import { describe, expect, it } from "vitest";

import { mockNoteDocument } from "@/lib/documents/mock-note";
import { noteDocumentSchema } from "@/lib/documents/schema";
import { presentationSchema } from "@/lib/ppt/schema";

describe("noteDocumentSchema", () => {
  it("accepts the preview fixture", () => {
    expect(noteDocumentSchema.parse(mockNoteDocument)).toEqual(mockNoteDocument);
  });

  it("rejects a block that is not part of the note model", () => {
    const result = noteDocumentSchema.safeParse({
      title: "Bad",
      sections: [
        {
          blocks: [{ type: "notion-paragraph", content: "no" }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("presentationSchema", () => {
  it("accepts a slide with text and an image", () => {
    const parsed = presentationSchema.parse({
      id: "run-1",
      filename: "lecture.pptx",
      slides: [
        {
          slideNumber: 1,
          elements: [
            {
              id: "s1-e1",
              type: "text",
              paragraphs: [{ text: "Deadlock", level: 0, bullet: "none" }],
              isTitle: true,
            },
            {
              id: "s1-e2",
              type: "image",
              assetId: "img-1",
              contentHash: "abc",
              mimeType: "image/png",
            },
          ],
        },
      ],
    });
    expect(parsed.slides[0]?.elements).toHaveLength(2);
  });
});
