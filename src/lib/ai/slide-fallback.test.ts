import { describe, expect, it } from "vitest";

import type { ImageOutcome } from "@/lib/ai/analyze-response";
import { fallbackSlideNotes } from "@/lib/ai/slide-fallback";
import type { ImageAnalysis } from "@/lib/ai/schema";
import { slideNotesSchema } from "@/lib/documents/schema";
import type { Slide } from "@/lib/ppt/schema";

describe("fallbackSlideNotes", () => {
  it("keeps native paragraphs as source blocks with their bullet kind", () => {
    const notes = fallbackSlideNotes(
      slide({
        elements: [
          {
            id: "s3-title",
            type: "text",
            isTitle: true,
            paragraphs: [{ text: "Buying process", level: 0, bullet: "none" }],
          },
          {
            id: "s3-body",
            type: "text",
            paragraphs: [
              { text: "Four conditions:", level: 0, bullet: "none" },
              { text: "Mutual exclusion", level: 0, bullet: "bullet" },
              { text: "Only one process", level: 1, bullet: "bullet" },
              { text: "First step", level: 0, bullet: "number" },
            ],
          },
          {
            id: "s3-shape",
            type: "shape",
            text: "arrow label",
          },
        ],
        speakerNotes: "Say this aloud: planted speaker note",
      }),
      [],
    );

    expect(slideNotesSchema.parse(notes)).toEqual(notes);
    expect(notes.slideNumber).toBe(3);
    expect(notes.title).toBe("Buying process");
    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "Four conditions:", provenance: "source" },
      {
        type: "bullets",
        provenance: "source",
        items: [
          { text: "Mutual exclusion", children: [{ text: "Only one process" }] },
        ],
      },
      {
        type: "numbered",
        provenance: "source",
        items: [{ text: "First step" }],
      },
      { type: "paragraph", content: "arrow label", provenance: "source" },
    ]);
    expect(notes.sourceReferences).toEqual([
      { slideNumber: 3, elementId: "s3-title" },
      { slideNumber: 3, elementId: "s3-body" },
      { slideNumber: 3, elementId: "s3-shape" },
    ]);
    expect(JSON.stringify(notes)).not.toContain("planted speaker note");
  });

  it("keeps table cells as a source table", () => {
    const notes = fallbackSlideNotes(
      slide({
        elements: [
          {
            id: "s4-table",
            type: "table",
            rows: [
              ["Term", "On the slide"],
              ["Code", "BBALLB-203 recieve"],
            ],
          },
        ],
      }),
      [],
    );

    expect(notes.blocks).toEqual([
      {
        type: "table",
        provenance: "source",
        rows: [
          ["Term", "On the slide"],
          ["Code", "BBALLB-203 recieve"],
        ],
      },
    ]);
    expect(notes.blocks[0]).not.toHaveProperty("header");
    expect(notes.sourceReferences).toEqual([{ slideNumber: 3, elementId: "s4-table" }]);
  });

  it("turns a picture-only analysis into source text, interpretation, and warnings", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        extractedText: "BBALLB-203 recieve",
        description: "A course code on the slide.",
        relationships: ["The code sits under the heading."],
        uncertainties: ["The last digit is faint."],
      }),
    ]);

    expect(notes.blocks).toEqual([
      {
        type: "image",
        assetId: "run/secret-asset",
        caption: "A course code on the slide.",
        provenance: "source",
      },
      { type: "paragraph", content: "BBALLB-203 recieve", provenance: "source" },
      {
        type: "bullets",
        provenance: "interpretation",
        items: [{ text: "The code sits under the heading." }],
      },
    ]);
    expect(notes.warnings).toEqual(["The last digit is faint."]);
    expect(notes.sourceReferences).toEqual([{ slideNumber: 3, elementId: "s3-img" }]);
  });

  it("keeps the stored picture when the reading is a diagram", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "diagram",
        extractedText: "Start",
        description: "A three-step flow.",
      }),
    ]);

    expect(notes.blocks).toEqual([
      {
        type: "image",
        assetId: "run/secret-asset",
        caption: "A three-step flow.",
        provenance: "source",
      },
      { type: "paragraph", content: "Start", provenance: "source" },
    ]);
  });

  it("keeps words only for a text image with no relationships", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "text",
        extractedText: "BBALLB-203 recieve",
        description: "A course code on the slide.",
      }),
    ]);

    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "BBALLB-203 recieve", provenance: "source" },
      {
        type: "paragraph",
        content: "A course code on the slide.",
        provenance: "interpretation",
      },
    ]);
  });

  it("adds no body text for a skipped decorative image", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      { imageId: "s3-img", status: "skipped", reason: "Treated as a logo." },
    ]);

    expect(notes.blocks).toEqual([]);
    expect(notes.warnings).toEqual(["This slide had no text to keep."]);
    expect(JSON.stringify(notes)).not.toContain("Treated as a logo.");
    expect(notes.title).toBeUndefined();
  });

  it("keeps slide text when a skipped image is also on the slide", () => {
    const notes = fallbackSlideNotes(
      slide({
        elements: [
          {
            id: "s3-body",
            type: "text",
            paragraphs: [{ text: "Still on the slide", level: 0, bullet: "none" }],
          },
          pictureSlide().elements[0]!,
        ],
        imageAnalyses: [
          {
            imageId: "s3-img",
            containsUsefulInformation: true,
            extractedText: "should not leak from a skipped image",
          },
        ],
      }),
      [{ imageId: "s3-img", status: "skipped", reason: "Treated as a logo." }],
    );

    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "Still on the slide", provenance: "source" },
    ]);
    expect(notes.warnings).toBeUndefined();
    expect(JSON.stringify(notes)).not.toContain("should not leak");
    expect(JSON.stringify(notes)).not.toContain("Treated as a logo.");
  });
});

function slide(overrides: Omit<Slide, "slideNumber"> & { slideNumber?: number }): Slide {
  return { slideNumber: 3, ...overrides };
}

function pictureSlide(): Slide {
  return slide({
    elements: [
      {
        id: "s3-img",
        type: "image",
        assetId: "run/secret-asset",
        contentHash: "ab".repeat(32),
        mimeType: "image/png",
      },
    ],
  });
}

function analyzed(
  imageId: string,
  analysis: Omit<ImageAnalysis, "imageId" | "containsUsefulInformation"> &
    Partial<Pick<ImageAnalysis, "containsUsefulInformation">>,
): ImageOutcome {
  return {
    imageId,
    status: "analyzed",
    analysis: { imageId, containsUsefulInformation: true, ...analysis },
  };
}
