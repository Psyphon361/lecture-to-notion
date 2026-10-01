import { describe, expect, it } from "vitest";

import {
  GeminiCallError,
  ImageAnalysisInvalidError,
  MissingGeminiKeyError,
  NoteOrganizationIsLocalError,
  analyzeImageDetailed,
  analyzeImageWithGemini,
  createGeminiProvider,
  geminiModelId,
  organizeNotesWithGemini,
  processSlideWithGemini,
  SlideNotesAreLocalError,
  type GeminiGenerate,
} from "@/lib/ai/gemini";
import type { ImageInput } from "@/lib/ai/provider";
import type { Slide } from "@/lib/ppt/schema";

const SECRET = "super-secret-gemini-key";

describe("analyzeImageDetailed", () => {
  it("checks the model response and sets imageId itself", async () => {
    const logs: string[] = [];
    const generate = fakeGenerate([
      JSON.stringify({
        imageId: "from-the-model",
        containsUsefulInformation: true,
        kind: "text",
        extractedText: "BBALLB-203 recieve",
        description: "A course code.",
        relationships: ["The code is on its own line."],
        uncertainties: ["The last digit is faint."],
      }),
    ]);

    const result = await analyzeImageDetailed(input(), {
      generate,
      model: "gemini-3.8-flash",
      log: (line) => logs.push(line),
      now: () => 1_000,
    });

    expect(result.analysis.imageId).toBe("s5-e1");
    expect(result.analysis.extractedText).toBe("BBALLB-203 recieve");
    expect(result.model).toBe("gemini-3.8-flash");
    expect(result.promptVersion).toBe("image-analysis-v5");
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(7);
    expect(logs).toEqual([
      "image-analysis model=gemini-3.8-flash prompt=image-analysis-v5 inputTokens=11 outputTokens=7 latencyMs=0 outcome=ok",
    ]);
    expect(logs.join(" ")).not.toContain(SECRET);
    expect(logs.join(" ")).not.toContain("BBALLB-203");
    expect(JSON.stringify(generate.requests[0]?.responseJsonSchema)).not.toContain("minLength");
    expect(JSON.stringify(generate.requests[0]?.responseJsonSchema)).not.toContain("imageId");
    expect(generate.requests[0]?.prompt).not.toContain("full slide body");
  });

  it("retries once with the validation error and then gives up", async () => {
    const generate = fakeGenerate(["{\"containsUsefulInformation\":\"yes\"}", "still not json"]);
    await expect(
      analyzeImageDetailed(input(), { generate, model: "gemini-3.8-flash", log: () => undefined }),
    ).rejects.toBeInstanceOf(ImageAnalysisInvalidError);
    expect(generate.requests).toHaveLength(2);
    expect(generate.requests[1]?.prompt).toContain("failed validation");
  });

  it("accepts a repaired response", async () => {
    const generate = fakeGenerate([
      "{\"nope\":true}",
      JSON.stringify({ containsUsefulInformation: false, kind: "decorative" }),
    ]);
    const result = await analyzeImageDetailed(input(), {
      generate,
      model: "gemini-3.8-flash",
      log: () => undefined,
    });
    expect(result.analysis.containsUsefulInformation).toBe(false);
    expect(result.analysis.imageId).toBe("s5-e1");
  });

  it("retries a 429 and does not retry a 5xx", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const generate: GeminiGenerate = async () => {
      calls += 1;
      if (calls < 3) throw new GeminiCallError(429);
      return {
        text: JSON.stringify({ containsUsefulInformation: true }),
        inputTokens: 1,
        outputTokens: 1,
      };
    };
    const result = await analyzeImageDetailed(input(), {
      generate,
      model: "gemini-3.8-flash",
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: () => undefined,
    });
    expect(result.analysis.imageId).toBe("s5-e1");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);

    let serverErrors = 0;
    const failing: GeminiGenerate = async () => {
      serverErrors += 1;
      throw new GeminiCallError(503);
    };
    await expect(
      analyzeImageDetailed(input(), {
        generate: failing,
        model: "gemini-3.8-flash",
        sleep: async () => {
          throw new Error("should not wait");
        },
        log: () => undefined,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(serverErrors).toBe(1);
  });

  it("uses the free-tier Flash default unless GEMINI_MODEL is set", () => {
    expect(geminiModelId("")).toBe("gemini-3.5-flash-lite");
    expect(geminiModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash");
  });

  it("does not call Gemini when the key is missing", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(analyzeImageWithGemini(input())).rejects.toBeInstanceOf(MissingGeminiKeyError);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });

});

describe("processSlide", () => {
  it("rejects a text slide and a picture reading before any Gemini call", async () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "present-key";
    try {
      await expect(
        processSlideWithGemini({ slide: lectureSlide(), outcomes: [] }),
      ).rejects.toBeInstanceOf(SlideNotesAreLocalError);
      await expect(
        createGeminiProvider().processSlide({
          slide: lectureSlide(),
          outcomes: [
            {
              imageId: "s4-img",
              status: "analyzed",
              analysis: {
                imageId: "s4-img",
                containsUsefulInformation: true,
                extractedText: "On the picture",
                description: "A diagram.",
              },
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SlideNotesAreLocalError);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });
});

describe("organizeNotes", () => {
  it("rejects before any Gemini call", async () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "present-key";
    const notes = [
      {
        slideNumber: 1,
        title: "Opening",
        blocks: [{ type: "paragraph" as const, content: "Four conditions", provenance: "source" as const }],
        sourceReferences: [{ slideNumber: 1 }],
      },
      {
        slideNumber: 2,
        blocks: [
          {
            type: "paragraph" as const,
            content: "A diagram of the conflict.",
            provenance: "interpretation" as const,
          },
        ],
        sourceReferences: [{ slideNumber: 2 }],
      },
    ];
    try {
      await expect(organizeNotesWithGemini(notes)).rejects.toBeInstanceOf(NoteOrganizationIsLocalError);
      await expect(createGeminiProvider().organizeNotes(notes)).rejects.toBeInstanceOf(
        NoteOrganizationIsLocalError,
      );
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });
});

function lectureSlide(): Slide {
  return {
    slideNumber: 4,
    elements: [
      {
        id: "s4-title",
        type: "text",
        isTitle: true,
        paragraphs: [{ text: "Buying process", level: 0, bullet: "none" }],
      },
      {
        id: "s4-body",
        type: "text",
        paragraphs: [{ text: `Four conditions: BBALLB-203 ${SECRET}`, level: 0, bullet: "none" }],
      },
    ],
  };
}

function input(): ImageInput {
  return {
    imageId: "s5-e1",
    mimeType: "image/png",
    bytes: new TextEncoder().encode(SECRET),
    altText: `caption ${SECRET}`,
  };
}

function fakeGenerate(bodies: string[]): GeminiGenerate & { requests: Parameters<GeminiGenerate>[0][] } {
  const requests: Parameters<GeminiGenerate>[0][] = [];
  const generate: GeminiGenerate = async (request) => {
    requests.push(request);
    const text = bodies[requests.length - 1];
    return { text, inputTokens: 11, outputTokens: 7 };
  };
  return Object.assign(generate, { requests });
}
