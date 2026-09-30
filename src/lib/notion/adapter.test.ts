import { describe, expect, it } from "vitest";

import type { NoteDocument } from "@/lib/documents/schema";
import {
  ARRAY_LIMIT,
  RICH_TEXT_LIMIT,
  chunkBlocks,
  isImagePlaceholder,
  mapNoteDocument,
  notionLanguage,
  type NotionBlock,
} from "@/lib/notion/adapter";

describe("mapNoteDocument", () => {
  it("copies the title and maps each block without calling the network", () => {
    const mapped = mapNoteDocument(sample());

    expect(mapped.title).toEqual([{ type: "text", text: { content: "Consumer buying" } }]);
    expect(mapped.blocks.map((block) => block.type)).toEqual([
      "heading_1",
      "paragraph",
      "bulleted_list_item",
      "numbered_list_item",
      "code",
      "table",
      "divider",
      "image_placeholder",
      "heading_3",
      "callout",
      "callout",
    ]);

    const heading = body(mapped.blocks[0]!, "heading_1");
    expect(heading.rich_text).toEqual([{ type: "text", text: { content: "Need and meaning" } }]);

    const paragraph = body(mapped.blocks[1]!, "paragraph");
    expect(paragraph.rich_text).toEqual([{ type: "text", text: { content: "Four conditions." } }]);

    const bullet = body(mapped.blocks[2]!, "bulleted_list_item");
    expect(bullet.rich_text).toEqual([{ type: "text", text: { content: "Parent" } }]);
    expect(bullet.children).toEqual([
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "Child" } }],
        },
      },
    ]);

    const numbered = body(mapped.blocks[3]!, "numbered_list_item");
    expect(numbered.rich_text).toEqual([{ type: "text", text: { content: "First" } }]);
    expect(numbered.children).toEqual([
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: "Nested" } }],
        },
      },
    ]);

    const code = body(mapped.blocks[4]!, "code");
    expect(code.language).toBe("python");
    expect(code.rich_text).toEqual([{ type: "text", text: { content: "recieve = 1" } }]);

    const table = body(mapped.blocks[5]!, "table");
    expect(table.table_width).toBe(2);
    expect(table.has_column_header).toBe(true);
    expect(table.children).toEqual([
      {
        object: "block",
        type: "table_row",
        table_row: {
          cells: [
            [{ type: "text", text: { content: "Term" } }],
            [{ type: "text", text: { content: "Meaning" } }],
          ],
        },
      },
      {
        object: "block",
        type: "table_row",
        table_row: {
          cells: [
            [{ type: "text", text: { content: "Need" } }],
            [{ type: "text", text: { content: "Gap" } }],
          ],
        },
      },
    ]);

    expect(mapped.blocks[6]).toEqual({ object: "block", type: "divider", divider: {} });
    expect(isImagePlaceholder(mapped.blocks[7]!)).toBe(true);
    if (!isImagePlaceholder(mapped.blocks[7]!)) return;
    expect(mapped.blocks[7].assetId).toBe("run/image");
    expect(mapped.blocks[7].caption).toEqual([{ type: "text", text: { content: "Figure 1" } }]);

    const callout = body(mapped.blocks[9]!, "callout");
    expect(callout.rich_text).toEqual([
      { type: "text", text: { content: "A diagram of the conflict." } },
    ]);
    const listCallout = body(mapped.blocks[10]!, "callout");
    expect(listCallout.rich_text).toEqual([]);
    expect(listCallout.children).toEqual([
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "Visible arrow" } }],
        },
      },
    ]);
  });

  it("splits rich text at 2000 characters and keeps the original characters", () => {
    const content = `${"a".repeat(RICH_TEXT_LIMIT)}b`;
    const mapped = mapNoteDocument({
      title: content,
      sections: [{ blocks: [{ type: "paragraph", content, provenance: "source" }] }],
    });

    expect(mapped.title.map((part) => part.text.content.length)).toEqual([RICH_TEXT_LIMIT, 1]);
    expect(mapped.title.map((part) => part.text.content).join("")).toBe(content);
    const paragraph = body(mapped.blocks[0]!, "paragraph");
    const richText = paragraph.rich_text as { text: { content: string } }[];
    expect(richText.map((part) => part.text.content.length)).toEqual([RICH_TEXT_LIMIT, 1]);
    expect(richText.map((part) => part.text.content).join("")).toBe(content);
  });

  it("uses heading_2 when a heading has no level", () => {
    const mapped = mapNoteDocument({
      title: "Notes",
      sections: [{ heading: "Untitled level", blocks: [] }],
    });
    expect(mapped.blocks[0]?.type).toBe("heading_2");
  });

  it("turns an unknown code language into plain text", () => {
    expect(notionLanguage("Python")).toBe("python");
    expect(notionLanguage("ts")).toBe("typescript");
    expect(notionLanguage("brainfuck")).toBe("plain text");
    expect(notionLanguage(undefined)).toBe("plain text");
  });

  it("chunks blocks at 100", () => {
    const blocks = Array.from({ length: ARRAY_LIMIT + 1 }, (_, index) => index);
    expect(chunkBlocks(blocks).map((chunk) => chunk.length)).toEqual([ARRAY_LIMIT, 1]);
  });
});

function sample(): NoteDocument {
  return {
    title: "Consumer buying",
    sections: [
      {
        heading: "Need and meaning",
        level: 1,
        blocks: [
          { type: "paragraph", content: "Four conditions.", provenance: "source" },
          {
            type: "bullets",
            provenance: "source",
            items: [{ text: "Parent", children: [{ text: "Child" }] }],
          },
          {
            type: "numbered",
            provenance: "source",
            items: [{ text: "First", children: [{ text: "Nested" }] }],
          },
          { type: "code", language: "Python", content: "recieve = 1", provenance: "source" },
          {
            type: "table",
            header: true,
            provenance: "source",
            rows: [
              ["Term", "Meaning"],
              ["Need", "Gap"],
            ],
          },
          { type: "divider" },
          { type: "image", assetId: "run/image", caption: "Figure 1", provenance: "source" },
        ],
      },
      {
        heading: "Reading",
        level: 3,
        blocks: [
          { type: "paragraph", content: "A diagram of the conflict.", provenance: "interpretation" },
          {
            type: "bullets",
            provenance: "interpretation",
            items: [{ text: "Visible arrow" }],
          },
        ],
      },
    ],
  };
}

function body(block: { type: string }, key: string): Record<string, unknown> {
  const notion = block as NotionBlock;
  const value = notion[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`Missing ${key}`);
  }
  return value as Record<string, unknown>;
}
