import { describe, expect, it } from "vitest";

import { organizeLocally } from "@/lib/documents/organize-locally";
import type { SlideNotes } from "@/lib/documents/schema";

describe("organizeLocally", () => {
  it("copies a table and an interpretation paragraph into two sections", () => {
    const notes = twoSlides();
    const before = structuredClone(notes);
    const document = organizeLocally(notes, "lecture.pptx");

    expect(document.title).toBe("Conditions");
    expect(document.sections).toHaveLength(2);
    expect(document.sections[0]).toEqual({
      heading: "Conditions",
      level: 1,
      blocks: [
        {
          type: "table",
          header: true,
          provenance: "source",
          rows: [
            ["Term", "Meaning"],
            ["Need", "A gap"],
          ],
        },
        { type: "divider" },
      ],
    });
    expect(document.sections[1]).toEqual({
      heading: "Slide 2",
      level: 1,
      blocks: [
        {
          type: "paragraph",
          content: "A diagram of the conflict.",
          provenance: "interpretation",
        },
      ],
    });
    expect(document.sourceReferences).toEqual([
      { slideNumber: 1, elementId: "table-1" },
      { slideNumber: 2, elementId: "img-1" },
    ]);
    expect(notes).toEqual(before);
  });

  it("uses the file name when no slide has a title and keeps a warning-only slide", () => {
    const document = organizeLocally(
      [
        {
          slideNumber: 4,
          blocks: [],
          sourceReferences: [{ slideNumber: 4 }],
          warnings: ["This slide had no text to keep."],
        },
      ],
      "empty-deck.pptx",
    );

    expect(document.title).toBe("empty-deck.pptx");
    expect(document.sections).toEqual([
      {
        heading: "Slide 4",
        level: 1,
        blocks: [{ type: "paragraph", content: "This slide had no text to keep." }],
      },
    ]);
  });
});

function twoSlides(): SlideNotes[] {
  return [
    {
      slideNumber: 1,
      title: "Conditions",
      blocks: [
        {
          type: "table",
          header: true,
          provenance: "source",
          rows: [
            ["Term", "Meaning"],
            ["Need", "A gap"],
          ],
        },
      ],
      sourceReferences: [{ slideNumber: 1, elementId: "table-1" }],
    },
    {
      slideNumber: 2,
      title: "   ",
      blocks: [
        {
          type: "paragraph",
          content: "A diagram of the conflict.",
          provenance: "interpretation",
        },
      ],
      sourceReferences: [{ slideNumber: 2, elementId: "img-1" }],
    },
  ];
}
