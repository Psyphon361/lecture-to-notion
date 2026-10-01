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

  it("turns a fully bold body line into a level-2 heading and keeps bullet lists", () => {
    const notes = fallbackSlideNotes(
      slide({
        elements: [
          {
            id: "s5-body",
            type: "text",
            paragraphs: [
              { text: "Stage 3: Considering the alternatives", level: 0, bold: true },
              { text: "Option A", level: 0, bullet: "bullet" },
              { text: "Option B", level: 0, bullet: "bullet" },
            ],
          },
        ],
      }),
      [],
    );

    expect(notes.blocks).toEqual([
      {
        type: "heading",
        content: "Stage 3: Considering the alternatives",
        level: 2,
        provenance: "source",
      },
      {
        type: "bullets",
        provenance: "source",
        items: [{ text: "Option A" }, { text: "Option B" }],
      },
    ]);
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
      { type: "image", assetId: "run/secret-asset", provenance: "source" },
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
      { type: "image", assetId: "run/secret-asset", provenance: "source" },
    ]);
  });

  it("joins a wrapped quote into one paragraph and keeps the attribution", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "text",
        description: "A quote on a red background by Justice Krishna Iyer.",
        lines: [
          { role: "body", text: "It is the weakness" },
          { role: "body", text: "of our jurisprudence" },
          { role: "body", text: "that victims of crime" },
          { role: "heading", text: "— Justice Krishna Iyer" },
          {
            role: "callout",
            text: "This early judicial critique acted as the catalyst for aggressive legal reform in India.",
          },
        ],
      }),
    ]);

    expect(notes.blocks).toEqual([
      {
        type: "paragraph",
        content: "It is the weakness of our jurisprudence that victims of crime",
        provenance: "source",
      },
      { type: "paragraph", content: "— Justice Krishna Iyer", provenance: "source" },
      {
        type: "paragraph",
        content: "This early judicial critique acted as the catalyst for aggressive legal reform in India.",
        provenance: "source",
      },
    ]);
    expect(JSON.stringify(notes)).not.toContain("red background");
  });

  it("keeps a designed slide screenshot and does not repeat its text", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "screenshot",
        extractedText: "Section 357 CrPC",
        description: "A lecture slide comparing two statutory mechanisms.",
        lines: [{ role: "title", text: "Course Outcomes & Syllabus Integration" }],
      }),
    ]);

    expect(notes.blocks).toEqual([
      { type: "image", assetId: "run/secret-asset", provenance: "source" },
    ]);
    expect(notes.title).toBeUndefined();
    expect(JSON.stringify(notes)).not.toContain("Section 357 CrPC");
    expect(JSON.stringify(notes)).not.toContain("Course Outcomes");
  });

  it("keeps a plain quote as text and drops the image", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "text",
        extractedText: "BBALLB-203 recieve",
        description: "A course code on the slide.",
      }),
    ]);

    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "BBALLB-203 recieve", provenance: "source" },
    ]);
    expect(JSON.stringify(notes)).not.toContain("run/secret-asset");
  });

  it("keeps a misspelling and drops a spelling warning", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "text",
        extractedText: "recieve",
        description: "Possible typo for receive.",
        uncertainties: ["Misspelling of receive.", "The last digit is faint."],
      }),
    ]);

    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "recieve", provenance: "source" },
    ]);
    expect(notes.warnings).toEqual(["The last digit is faint."]);
  });

  it("maps image lines to the slide title, headings, body, and callout", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "text",
        extractedText: "flat blob that should not appear",
        description: "Overall layout of the infographic.",
        lines: [
          { role: "title", text: "Victim Compensation" },
          { role: "heading", text: "Section 357 CrPC" },
          { role: "body", text: "Compensation may be ordered at the time of sentencing." },
          { role: "callout", text: "Historical Flaw" },
        ],
      }),
    ]);

    expect(notes.title).toBe("Victim Compensation");
    expect(notes.blocks).toEqual([
      { type: "heading", content: "Section 357 CrPC", level: 2, provenance: "source" },
      {
        type: "paragraph",
        content: "Compensation may be ordered at the time of sentencing.",
        provenance: "source",
      },
      { type: "paragraph", content: "Historical Flaw", provenance: "source" },
    ]);
    expect(JSON.stringify(notes)).not.toContain("flat blob");
    expect(JSON.stringify(notes)).not.toContain("Overall layout of the infographic.");
    expect(JSON.stringify(notes)).not.toContain("run/secret-asset");
  });

  it("keeps a photo quote as text when it is not a diagram", () => {
    const notes = fallbackSlideNotes(pictureSlide(), [
      analyzed("s3-img", {
        kind: "photo",
        extractedText: "A sentence from the slide.",
      }),
    ]);

    expect(notes.blocks).toEqual([
      { type: "paragraph", content: "A sentence from the slide.", provenance: "source" },
    ]);
    expect(JSON.stringify(notes)).not.toContain("run/secret-asset");
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
