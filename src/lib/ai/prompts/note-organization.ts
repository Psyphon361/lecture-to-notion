import type { NoteBlock, NoteListItem, SlideNotes } from "@/lib/documents/schema";

export const PROMPT_VERSION = "note-organization-v1";

/**
 * One prompt for the whole lecture, as compact text.
 * Image bytes are not included. A repair attempt appends the validator message only.
 */
export function noteOrganizationPrompt(input: {
  notes: SlideNotes[];
  validationError?: string;
}): string {
  const lines = [
    "You organize one lecture into one study document.",
    "Keep every slide. Do not drop a slide. Do not summarize the lecture away.",
    "Copy terms and numbers as written. Do not invent a point that is not in the notes below.",
    "Source text stays source. Interpretation stays interpretation.",
    "Keep lists, tables, code, and pictures. A picture stays as its image id.",
    "Each block type is heading, paragraph, bullets, numbered, code, table, image, or divider.",
    "A list uses bullets or numbered. Each item is an object with a text field.",
    "Give the document one title and a heading hierarchy.",
  ];

  const body = input.notes.map(slideLines).join("\n\n");
  lines.push(body.length > 0 ? body : "(There are no slide notes.)");

  const validationError = input.validationError?.trim();
  if (validationError) {
    lines.push(
      `The previous response failed validation: ${validationError.slice(0, 800)}. Return JSON that matches the schema.`,
    );
  }
  return lines.join("\n\n");
}

function slideLines(notes: SlideNotes): string {
  const title = notes.title?.trim();
  const lines = [title ? `Slide ${notes.slideNumber}. ${title}` : `Slide ${notes.slideNumber}`];
  for (const block of notes.blocks) lines.push(...blockLines(block));
  return lines.join("\n");
}

function blockLines(block: NoteBlock): string[] {
  const kind =
    block.provenance === "interpretation"
      ? "interpretation"
      : block.provenance === "source"
        ? "source"
        : "text";
  switch (block.type) {
    case "heading":
      return [`${kind} heading: ${block.content}`];
    case "paragraph":
      return [`${kind}: ${block.content}`];
    case "bullets":
    case "numbered":
      return [`${kind} ${block.type}:`, ...itemLines(block.items)];
    case "code":
      return [`${kind} code: ${block.content}`];
    case "table":
      return [`${kind} table:`, ...block.rows.map((row) => row.join(" | "))];
    case "image": {
      const caption = [block.caption?.trim(), block.alt?.trim()].filter(Boolean).join(" ");
      return [`${kind} image: ${block.assetId}${caption ? ` ${caption}` : ""}`];
    }
    case "divider":
      return [`${kind}: divider`];
  }
}

function itemLines(items: NoteListItem[], depth = 0): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(depth);
  for (const item of items) {
    lines.push(`${pad}${item.text}`);
    if (item.children && item.children.length > 0) {
      lines.push(...itemLines(item.children, depth + 1));
    }
  }
  return lines;
}
