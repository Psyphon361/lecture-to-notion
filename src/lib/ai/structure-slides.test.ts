import { describe, expect, it } from "vitest";

import type { ImageOutcome } from "@/lib/ai/analyze-response";
import { structureSlides, type SlidePostResult } from "@/lib/ai/structure-slides";
import type { SlideNotes } from "@/lib/documents/schema";
import type { Slide } from "@/lib/ppt/schema";

describe("structureSlides", () => {
  it("requests one slide at a time and keeps every returned note", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];
    const result = await structureSlides(deck(), [], async (body) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(body.slide.slideNumber);
      await Promise.resolve();
      inFlight -= 1;
      return ok(notes(body.slide.slideNumber));
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seen).toEqual([1, 2, 3]);
    expect(maxInFlight).toBe(1);
    expect(result.notes.map((note) => note.slideNumber)).toEqual([1, 2, 3]);
  });

  it("stops on a rate limit and keeps the slides already structured", async () => {
    const seen: number[] = [];
    const result = await structureSlides(deck(), [], async (body) => {
      seen.push(body.slide.slideNumber);
      if (body.slide.slideNumber === 2) {
        return {
          ok: false,
          payload: {
            ok: false,
            message: "Gemini is rate limiting slide structuring. Wait a moment and try again.",
          },
        };
      }
      return ok(notes(body.slide.slideNumber));
    });

    expect(seen).toEqual([1, 2]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.notes.map((note) => note.slideNumber)).toEqual([1]);
    expect(result.message).toMatch(/rate limiting/);
  });

  it("does not send another slide's image outcome", async () => {
    const outcomes: ImageOutcome[] = [
      { imageId: "s1-img", status: "skipped", reason: "logo" },
      { imageId: "s2-img", status: "skipped", reason: "decorative" },
    ];
    const slides: Slide[] = [
      {
        slideNumber: 1,
        elements: [
          {
            id: "s1-img",
            type: "image",
            assetId: "run/hash",
            contentHash: "b".repeat(64),
            mimeType: "image/png",
          },
        ],
      },
    ];
    const result = await structureSlides(slides, outcomes, async (body) => {
      expect(body.outcomes.map((outcome) => outcome.imageId)).toEqual(["s1-img"]);
      expect(JSON.stringify(body)).not.toContain("bytes");
      return ok(notes(1));
    });
    expect(result.ok).toBe(true);
  });
});

function deck(): Slide[] {
  return [1, 2, 3].map((slideNumber) => ({
    slideNumber,
    elements: [
      {
        id: `s${slideNumber}-title`,
        type: "text" as const,
        isTitle: true,
        paragraphs: [{ text: `Slide ${slideNumber}`, level: 0, bullet: "none" as const }],
      },
    ],
  }));
}

function notes(slideNumber: number): SlideNotes {
  return {
    slideNumber,
    blocks: [{ type: "paragraph", content: `Kept ${slideNumber}`, provenance: "source" }],
    sourceReferences: [{ slideNumber }],
  };
}

function ok(payload: SlideNotes): SlidePostResult {
  return { ok: true, payload };
}
