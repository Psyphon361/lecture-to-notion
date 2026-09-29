import { describe, expect, it } from "vitest";

import type { ImageOutcome } from "@/lib/ai/analyze-response";
import { processSlideRequestSchema, slideProcessBody } from "@/lib/ai/process-request";
import type { Slide } from "@/lib/ppt/schema";

describe("slideProcessBody", () => {
  it("sends one slide, its image outcomes, and neighbor lines only", () => {
    const slides = [
      textSlide(1, "Intro", "planted-body-from-the-previous-slide"),
      pictureSlide(2),
      textSlide(3, "Third title\nnot the first line", "later body"),
    ];
    const outcomes: ImageOutcome[] = [
      { imageId: "s1-img", status: "skipped", reason: "logo" },
      {
        imageId: "s2-img",
        status: "analyzed",
        analysis: {
          imageId: "s2-img",
          containsUsefulInformation: true,
          extractedText: "seen on the picture",
        },
      },
      { imageId: "s9-img", status: "skipped", reason: "not on this slide" },
    ];

    const body = slideProcessBody(slides, 1, outcomes);

    expect(body.slide.slideNumber).toBe(2);
    expect(body.previousLine).toBe("Intro");
    expect(body.nextLine).toBe("Third title");
    expect(body.outcomes.map((outcome) => outcome.imageId)).toEqual(["s2-img"]);
    expect(JSON.stringify(body)).not.toContain("planted-body-from-the-previous-slide");
    expect(JSON.stringify(body)).not.toContain("later body");
    expect(JSON.stringify(body)).not.toContain("bytes");
    expect(processSlideRequestSchema.parse(body)).toEqual(body);
  });

  it("omits a neighbor when that slide has no title or first line", () => {
    const body = slideProcessBody(
      [{ slideNumber: 1, elements: [] }, textSlide(2, "Only this slide")],
      1,
      [],
    );
    expect(body.previousLine).toBeUndefined();
    expect(body.nextLine).toBeUndefined();
    expect(Object.keys(body)).toEqual(["slide", "outcomes"]);
  });

  it("rejects a deck and a field that is not part of one slide", () => {
    const slide = textSlide(1, "Only");
    expect(
      processSlideRequestSchema.safeParse({
        slide,
        outcomes: [],
        slides: [slide, textSlide(2, "Other")],
      }).success,
    ).toBe(false);
    expect(
      processSlideRequestSchema.safeParse({
        slide,
        outcomes: [],
        bytes: "iVBORw0KGgo",
      }).success,
    ).toBe(false);
  });
});

function textSlide(slideNumber: number, title: string, body?: string): Slide {
  return {
    slideNumber,
    elements: [
      {
        id: `s${slideNumber}-title`,
        type: "text",
        isTitle: true,
        paragraphs: [{ text: title, level: 0, bullet: "none" }],
      },
      ...(body
        ? [
            {
              id: `s${slideNumber}-body`,
              type: "text" as const,
              paragraphs: [{ text: body, level: 0, bullet: "none" as const }],
            },
          ]
        : []),
    ],
  };
}

function pictureSlide(slideNumber: number): Slide {
  return {
    slideNumber,
    elements: [
      {
        id: `s${slideNumber}-img`,
        type: "image",
        assetId: "run/hash",
        contentHash: "a".repeat(64),
        mimeType: "image/png",
      },
    ],
  };
}
