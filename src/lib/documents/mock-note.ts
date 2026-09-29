import type { NoteDocument } from "@/lib/documents/schema";

/**
 * Fixture document for the Phase 1 preview. It is not extracted from an upload.
 */
export const mockNoteDocument: NoteDocument = {
  title: "Sample notes",
  sections: [
    {
      heading: "What this preview is",
      level: 1,
      blocks: [
        {
          type: "paragraph",
          content:
            "These notes are fixture data so the preview can be reviewed before extraction exists. They were not read from the uploaded file.",
        },
      ],
    },
    {
      heading: "How a lecture will look",
      level: 2,
      blocks: [
        {
          type: "paragraph",
          content:
            "Text that was on the slide is shown as ordinary writing. Diagram descriptions are marked separately.",
        },
        {
          type: "bullets",
          items: [
            { text: "Bullet hierarchy from the slide is kept" },
            {
              text: "Nested items stay nested",
              children: [{ text: "Like this" }],
            },
          ],
        },
        {
          type: "numbered",
          items: [{ text: "Numbered lists stay numbered" }],
        },
        {
          type: "code",
          language: "text",
          content: "code and equations are copied, not corrected",
        },
        {
          type: "table",
          header: true,
          rows: [
            ["Term", "On the slide"],
            ["Example", "Kept as written"],
          ],
        },
        { type: "divider" },
        {
          type: "paragraph",
          provenance: "interpretation",
          content:
            "A diagram description will look like this, so it is not mistaken for text that was on the slide.",
        },
        {
          type: "image",
          assetId: "fixture-image",
          caption: "Images from the deck will appear here.",
          alt: "Placeholder for an extracted slide image",
        },
      ],
    },
  ],
  sourceReferences: [{ slideNumber: 1 }],
};
