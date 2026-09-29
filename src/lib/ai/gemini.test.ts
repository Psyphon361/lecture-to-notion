import { describe, expect, it } from "vitest";

import {
  GeminiCallError,
  ImageAnalysisInvalidError,
  MissingGeminiKeyError,
  analyzeImageDetailed,
  analyzeImageWithGemini,
  createGeminiProvider,
  geminiModelId,
  processSlideDetailed,
  processSlideWithGemini,
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
    expect(result.promptVersion).toBe("image-analysis-v1");
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(7);
    expect(logs).toEqual([
      "image-analysis model=gemini-3.8-flash prompt=image-analysis-v1 inputTokens=11 outputTokens=7 latencyMs=0 outcome=ok",
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

  it("leaves organization unimplemented", async () => {
    const provider = createGeminiProvider();
    await expect(provider.organizeNotes([])).rejects.toThrow(/has not started/);
  });
});

describe("processSlideDetailed", () => {
  it("checks the model response and sets the slide number itself", async () => {
    const logs: string[] = [];
    const generate = fakeGenerate([
      JSON.stringify({
        title: "Buying process",
        blocks: [{ type: "paragraph", content: "Kept as written", provenance: "source" }],
        sourceReferences: [{ slideNumber: 99, elementId: "s4-body" }],
      }),
    ]);

    const result = await processSlideDetailed(
      {
        slide: lectureSlide(),
        outcomes: [],
        previousLine: "Previous title only",
        nextLine: "Next first line only",
      },
      {
        generate,
        model: "gemini-3.8-flash",
        log: (line) => logs.push(line),
        now: () => 1_000,
      },
    );

    expect(result.usedFallback).toBe(false);
    expect(result.notes.slideNumber).toBe(4);
    expect(result.notes.title).toBe("Buying process");
    expect(result.notes.blocks).toEqual([
      { type: "paragraph", content: "Kept as written", provenance: "source" },
    ]);
    expect(result.notes.sourceReferences).toEqual([{ slideNumber: 4, elementId: "s4-body" }]);
    expect(JSON.stringify(result.notes)).not.toContain("Four conditions");
    expect(result.model).toBe("gemini-3.8-flash");
    expect(result.promptVersion).toBe("slide-processing-v1");
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(7);
    expect(logs).toEqual([
      "slide-processing model=gemini-3.8-flash prompt=slide-processing-v1 inputTokens=11 outputTokens=7 latencyMs=0 outcome=ok",
    ]);
    expect(logs.join(" ")).not.toContain(SECRET);
    expect(logs.join(" ")).not.toContain("BBALLB-203");
    const request = generate.requests[0];
    expect(request?.bytes).toBeUndefined();
    expect(request?.mimeType).toBeUndefined();
    expect(request?.prompt).toContain("Previous title only");
    expect(request?.prompt).toContain("Next first line only");
    expect(request?.prompt).toContain("Four conditions");
    expect(request?.prompt).not.toContain("the rest of the deck");
    const schema = JSON.stringify(request?.responseJsonSchema);
    expect(schema).not.toContain("minLength");
    expect(schema).not.toContain("minItems");
    expect(schema).not.toContain("children");
  });

  it("retries once with the validation error and then uses the slide text", async () => {
    const logs: string[] = [];
    const generate = fakeGenerate(["not json", "{\"nope\":true}"]);
    const result = await processSlideDetailed(
      { slide: lectureSlide(), outcomes: [] },
      { generate, model: "gemini-3.8-flash", log: (line) => logs.push(line) },
    );

    expect(generate.requests).toHaveLength(2);
    expect(generate.requests[1]?.prompt).toContain("failed validation");
    expect(result.usedFallback).toBe(true);
    expect(result.notes.title).toBe("Buying process");
    expect(result.notes.blocks).toEqual([
      {
        type: "paragraph",
        content: `Four conditions: BBALLB-203 ${SECRET}`,
        provenance: "source",
      },
    ]);
    expect(result.notes.warnings).toEqual([
      "The model response did not match the expected shape, so this slide keeps its source text.",
    ]);
    expect(logs[0]).toContain("outcome=invalid");
    expect(logs[1]).toContain("outcome=fallback");
    expect(logs.join(" ")).not.toContain(SECRET);
  });

  it("accepts a repaired response", async () => {
    const generate = fakeGenerate([
      "{\"nope\":true}",
      JSON.stringify({
        blocks: [{ type: "paragraph", content: "Repaired line", provenance: "source" }],
        sourceReferences: [],
      }),
    ]);
    const result = await processSlideDetailed(
      { slide: lectureSlide(), outcomes: [] },
      { generate, model: "gemini-3.8-flash", log: () => undefined },
    );
    expect(result.usedFallback).toBe(false);
    expect(result.notes.blocks).toEqual([
      { type: "paragraph", content: "Repaired line", provenance: "source" },
    ]);
    expect(result.notes.slideNumber).toBe(4);
    expect(result.notes.warnings ?? []).not.toContain(
      "The model response did not match the expected shape, so this slide keeps its source text.",
    );
  });

  it("retries a 429 and does not retry or fall back on a 5xx", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const generate: GeminiGenerate = async () => {
      calls += 1;
      if (calls < 3) throw new GeminiCallError(429);
      return {
        text: JSON.stringify({
          blocks: [{ type: "paragraph", content: "After the wait", provenance: "source" }],
          sourceReferences: [],
        }),
        inputTokens: 1,
        outputTokens: 1,
      };
    };
    const result = await processSlideDetailed(
      { slide: lectureSlide(), outcomes: [] },
      {
        generate,
        model: "gemini-3.8-flash",
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        log: () => undefined,
      },
    );
    expect(result.notes.blocks[0]).toMatchObject({ content: "After the wait" });
    expect(result.usedFallback).toBe(false);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);

    let serverErrors = 0;
    const failing: GeminiGenerate = async () => {
      serverErrors += 1;
      throw new GeminiCallError(503);
    };
    await expect(
      processSlideDetailed(
        { slide: lectureSlide(), outcomes: [] },
        {
          generate: failing,
          model: "gemini-3.8-flash",
          sleep: async () => {
            throw new Error("should not wait");
          },
          log: () => undefined,
        },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(serverErrors).toBe(1);
  });

  it("does not call Gemini when the key is missing", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(
        processSlideWithGemini({ slide: lectureSlide(), outcomes: [] }),
      ).rejects.toBeInstanceOf(MissingGeminiKeyError);
      await expect(
        createGeminiProvider().processSlide({ slide: lectureSlide(), outcomes: [] }),
      ).rejects.toBeInstanceOf(MissingGeminiKeyError);
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
