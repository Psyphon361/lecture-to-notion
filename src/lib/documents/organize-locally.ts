import {
  noteDocumentSchema,
  type NoteBlock,
  type NoteDocument,
  type SlideNotes,
} from "@/lib/documents/schema";

/**
 * One document from the per-slide notes. Block text is copied.
 * A warning stays on that slide's section so it is not dropped.
 */
export function organizeLocally(notes: SlideNotes[], filename: string): NoteDocument {
  const title = firstTitle(notes) ?? filename;
  const sourceReferences = notes.flatMap((slide) => slide.sourceReferences);
  return noteDocumentSchema.parse({
    title,
    sections: notes.map((slide) => ({
      heading: headingFor(slide),
      level: 1,
      blocks: sectionBlocks(slide),
    })),
    ...(sourceReferences.length > 0 ? { sourceReferences } : {}),
  });
}

function firstTitle(notes: SlideNotes[]): string | undefined {
  for (const slide of notes) {
    const title = slide.title?.trim();
    if (title) return title;
  }
  return undefined;
}

function headingFor(slide: SlideNotes): string {
  const title = slide.title?.trim();
  return title ? title : `Slide ${slide.slideNumber}`;
}

function sectionBlocks(slide: SlideNotes): NoteBlock[] {
  const warnings = (slide.warnings ?? []).flatMap((warning) => {
    const content = warning.trim();
    return content ? [{ type: "paragraph" as const, content }] : [];
  });
  return [...warnings, ...slide.blocks.map((block) => structuredClone(block))];
}
