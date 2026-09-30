import type {
  NoteBlock,
  NoteDocument,
  NoteListItem,
  NoteSection,
} from "@/lib/documents/schema";

/**
 * NoteDocument -> Notion block JSON. No network calls.
 * Image blocks stay placeholders until the export route uploads them.
 */

export const NOTION_VERSION = "2026-03-11";

/** `text.content` limit from the Notion request-limits page. */
export const RICH_TEXT_LIMIT = 2000;

/** Rich-text arrays and block-children arrays share this cap. */
export const ARRAY_LIMIT = 100;

export interface NotionRichText {
  type: "text";
  text: { content: string };
}

export interface ImagePlaceholder {
  type: "image_placeholder";
  assetId: string;
  caption: NotionRichText[];
}

/** A block body Notion accepts on create-page or append-children. */
export type NotionBlock = {
  object: "block";
  type: string;
} & Record<string, unknown>;

export type MappedBlock = NotionBlock | ImagePlaceholder;

export interface MappedNotionPage {
  title: NotionRichText[];
  blocks: MappedBlock[];
}

export function mapNoteDocument(document: NoteDocument): MappedNotionPage {
  return {
    title: richTextSegments(document.title).slice(0, ARRAY_LIMIT),
    blocks: document.sections.flatMap(mapSection),
  };
}

export function chunkBlocks<T>(blocks: T[], size = ARRAY_LIMIT): T[][] {
  if (size < 1) return blocks.length === 0 ? [] : [blocks];
  const chunks: T[][] = [];
  for (let index = 0; index < blocks.length; index += size) {
    chunks.push(blocks.slice(index, index + size));
  }
  return chunks;
}

export function isImagePlaceholder(block: MappedBlock): block is ImagePlaceholder {
  return block.type === "image_placeholder";
}

export function richTextSegments(content: string): NotionRichText[] {
  if (content.length === 0) {
    return [{ type: "text", text: { content: "" } }];
  }
  const segments: NotionRichText[] = [];
  for (let index = 0; index < content.length; index += RICH_TEXT_LIMIT) {
    segments.push({
      type: "text",
      text: { content: content.slice(index, index + RICH_TEXT_LIMIT) },
    });
  }
  return segments;
}

function mapSection(section: NoteSection): MappedBlock[] {
  const blocks = section.blocks.flatMap(mapBlock);
  if (section.heading === undefined) return blocks;
  const level = section.level ?? 2;
  const type = level === 1 ? "heading_1" : level === 3 ? "heading_3" : "heading_2";
  const headings = chunkRichText(richTextSegments(section.heading)).map((richText) =>
    block(type, { rich_text: richText }),
  );
  return [...headings, ...blocks];
}

function mapBlock(blockItem: NoteBlock): MappedBlock[] {
  switch (blockItem.type) {
    case "paragraph":
      return textBlocks(blockItem.provenance === "interpretation" ? "callout" : "paragraph", blockItem.content);
    case "bullets":
      return mapList("bulleted_list_item", blockItem.items, blockItem.provenance === "interpretation");
    case "numbered":
      return mapList("numbered_list_item", blockItem.items, blockItem.provenance === "interpretation");
    case "code":
      return mapCode(blockItem.content, blockItem.language, blockItem.provenance === "interpretation");
    case "table":
      return mapTable(blockItem.rows, blockItem.header === true, blockItem.provenance === "interpretation");
    case "divider":
      return [block("divider", {})];
    case "image": {
      const caption = blockItem.caption ?? blockItem.alt;
      return [
        {
          type: "image_placeholder",
          assetId: blockItem.assetId,
          caption: caption === undefined ? [] : richTextSegments(caption),
        },
      ];
    }
  }
}

function mapList(type: "bulleted_list_item" | "numbered_list_item", items: NoteListItem[], interpretation: boolean): MappedBlock[] {
  const children = items.map((item) => listItem(type, item));
  if (!interpretation) return children;
  return chunkBlocks(children).map((group) =>
    block("callout", { rich_text: [], children: group }),
  );
}

function listItem(type: "bulleted_list_item" | "numbered_list_item", item: NoteListItem): NotionBlock {
  const segments = richTextSegments(item.text);
  const nested = (item.children ?? []).map((child) => listItem(type, child));
  const overflow = chunkRichText(segments.slice(ARRAY_LIMIT)).map((richText) =>
    block("paragraph", { rich_text: richText }),
  );
  const children = [...overflow, ...nested];
  return block(type, {
    rich_text: segments.slice(0, ARRAY_LIMIT),
    ...(children.length > 0 ? { children } : {}),
  });
}

function mapCode(content: string, language: string | undefined, interpretation: boolean): MappedBlock[] {
  const codeBlocks = chunkRichText(richTextSegments(content)).map((richText) =>
    block("code", { rich_text: richText, language: notionLanguage(language) }),
  );
  if (!interpretation) return codeBlocks;
  return chunkBlocks(codeBlocks).map((group) => block("callout", { rich_text: [], children: group }));
}

function mapTable(rows: string[][], header: boolean, interpretation: boolean): MappedBlock[] {
  if (rows.length === 0) return [];
  const width = Math.max(1, ...rows.map((row) => row.length));
  const tableRows = rows.map((row) =>
    block("table_row", {
      cells: Array.from({ length: width }, (_, column) => richTextSegments(row[column] ?? "").slice(0, ARRAY_LIMIT)),
    }),
  );
  const tables = chunkBlocks(tableRows).map((group, index) =>
    block("table", {
      table_width: width,
      has_column_header: header && index === 0,
      has_row_header: false,
      children: group,
    }),
  );
  if (!interpretation) return tables;
  return chunkBlocks(tables).map((group) => block("callout", { rich_text: [], children: group }));
}

function textBlocks(type: "paragraph" | "callout", content: string): NotionBlock[] {
  return chunkRichText(richTextSegments(content)).map((richText) => block(type, { rich_text: richText }));
}

function chunkRichText(segments: NotionRichText[]): NotionRichText[][] {
  return chunkBlocks(segments);
}

function block(type: string, body: Record<string, unknown>): NotionBlock {
  return { object: "block", type, [type]: body };
}

const NOTION_CODE_LANGUAGES = new Set([
  "abap",
  "arduino",
  "bash",
  "basic",
  "c",
  "clojure",
  "coffeescript",
  "c++",
  "c#",
  "css",
  "dart",
  "diff",
  "docker",
  "elixir",
  "elm",
  "erlang",
  "flow",
  "fortran",
  "f#",
  "gherkin",
  "glsl",
  "go",
  "graphql",
  "groovy",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "julia",
  "kotlin",
  "latex",
  "less",
  "lisp",
  "livescript",
  "lua",
  "makefile",
  "markdown",
  "markup",
  "matlab",
  "mermaid",
  "nix",
  "objective-c",
  "ocaml",
  "pascal",
  "perl",
  "php",
  "plain text",
  "powershell",
  "prolog",
  "protobuf",
  "python",
  "r",
  "reason",
  "ruby",
  "rust",
  "sass",
  "scala",
  "scheme",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vb.net",
  "verilog",
  "vhdl",
  "visual basic",
  "webassembly",
  "xml",
  "yaml",
  "java/c/c++/c#",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  plaintext: "plain text",
  text: "plain text",
  sh: "shell",
};

export function notionLanguage(language: string | undefined): string {
  const value = language?.trim().toLowerCase() ?? "";
  if (value.length === 0) return "plain text";
  const aliased = LANGUAGE_ALIASES[value] ?? value;
  return NOTION_CODE_LANGUAGES.has(aliased) ? aliased : "plain text";
}
