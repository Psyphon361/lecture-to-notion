import { describe, expect, it } from "vitest";

import { analyzeImageSet } from "@/lib/ai/analyze-images";
import {
  presentationWithAnalyses,
  type AnalyzeCandidate,
} from "@/lib/ai/analyze-response";
import { GeminiCallError, ImageAnalysisInvalidError } from "@/lib/ai/gemini";
import type { ImageInput } from "@/lib/ai/provider";
import type { ImageAnalysis } from "@/lib/ai/schema";
import type { Presentation } from "@/lib/ppt/schema";

describe("analyzeImageSet", () => {
  it("calls the model once for one hash on two slides", async () => {
    const calls: string[] = [];
    const outcomes = await analyzeImageSet(
      [
        candidate("one", 2, "aa"),
        candidate("two", 3, "aa"),
      ],
      {
        readAsset: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png" }),
        analyze: async (input) => {
          calls.push(input.imageId);
          return { analysis: analysis(input.imageId) };
        },
      },
    );

    expect(calls).toEqual(["one"]);
    expect(outcomes.map((outcome) => outcome.imageId)).toEqual(["one", "two"]);
    expect(outcomes.every((outcome) => outcome.status === "analyzed")).toBe(true);
    if (outcomes[1]?.status !== "analyzed") return;
    expect(outcomes[1].analysis.imageId).toBe("two");
    expect(outcomes[1].analysis.extractedText).toBe("BBALLB-203");
  });

  it("does not call the model for a skipped image", async () => {
    let calls = 0;
    const outcomes = await analyzeImageSet([candidate("logo", 1, "bb", 100, 100)], {
      readAsset: async () => {
        throw new Error("bytes should stay unread");
      },
      analyze: async () => {
        calls += 1;
        return { analysis: analysis("logo") };
      },
    });
    expect(calls).toBe(0);
    expect(outcomes[0]).toMatchObject({ status: "skipped" });
  });

  it("keeps an image unanalyzed when the model response stays invalid", async () => {
    const outcomes = await analyzeImageSet([candidate("pic", 5, "cc")], {
      readAsset: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png" }),
      analyze: async () => {
        throw new ImageAnalysisInvalidError();
      },
    });
    expect(outcomes[0]).toMatchObject({
      status: "unanalyzed",
      warning: "The model response did not match the expected shape.",
    });
  });

  it("stops the run when Gemini rate limits the call", async () => {
    await expect(
      analyzeImageSet([candidate("pic", 5, "dd")], {
        readAsset: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png" }),
        analyze: async () => {
          throw new GeminiCallError(429);
        },
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("runs at most two analyses at a time", async () => {
    let active = 0;
    let max = 0;
    await analyzeImageSet(
      ["a", "b", "c", "d"].map((hash, index) => candidate(`id-${hash}`, index + 1, hash.repeat(64))),
      {
        readAsset: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png" }),
        analyze: async (input: ImageInput) => {
          active += 1;
          max = Math.max(max, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
          return { analysis: analysis(input.imageId) };
        },
        concurrency: 2,
      },
    );
    expect(max).toBe(2);
  });
});

describe("presentationWithAnalyses", () => {
  it("attaches an analysis to the slide that owns the image", () => {
    const presentation: Presentation = {
      id: "p",
      filename: "lecture.pptx",
      slides: [
        {
          slideNumber: 5,
          elements: [
            {
              id: "s5-e1",
              type: "image",
              assetId: "run/hash",
              contentHash: "a".repeat(64),
              mimeType: "image/png",
            },
          ],
        },
      ],
    };
    const next = presentationWithAnalyses(presentation, [
      { imageId: "s5-e1", status: "analyzed", analysis: analysis("s5-e1") },
    ]);
    expect(next.slides[0]?.imageAnalyses?.[0]?.imageId).toBe("s5-e1");
    expect(next.slides[0]?.imageAnalyses?.[0]?.extractedText).toBe("BBALLB-203");
  });
});

function candidate(
  imageId: string,
  slideNumber: number,
  hash: string,
  width = 8_000_000,
  height = 5_000_000,
): AnalyzeCandidate {
  return {
    imageId,
    assetId: `00000000-0000-4000-8000-000000000001/${hash.padStart(64, "0")}`,
    contentHash: hash.padStart(64, "0"),
    mimeType: "image/png",
    slideNumber,
    width,
    height,
  };
}

function analysis(imageId: string): ImageAnalysis {
  return {
    imageId,
    containsUsefulInformation: true,
    kind: "diagram",
    extractedText: "BBALLB-203",
    description: "A diagram.",
    relationships: ["Box A points at box B."],
    uncertainties: [],
  };
}
