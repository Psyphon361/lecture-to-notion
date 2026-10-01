import type { ImageOutcome } from "@/lib/ai/analyze-response";
import type { ImageAnalysis } from "@/lib/ai/schema";
import type { NoteBlock, NoteListItem, SlideNotes } from "@/lib/documents/schema";
import { slideNotesSchema } from "@/lib/documents/schema";
import { elementsInReadingOrder } from "@/lib/ppt/reading-order";
import type { Slide, TextParagraph } from "@/lib/ppt/schema";

const EMPTY_SLIDE_WARNING = "This slide had no text to keep.";

/**
 * Notes from the slide itself when the model response cannot be used.
 * Native text keeps its bullet kind. Image readings become source or interpretation.
 * A diagram, chart, equation, code image, or a reading with relationships keeps the stored picture.
 * A skipped image adds nothing.
 */
export function fallbackSlideNotes(slide: Slide, outcomes: ImageOutcome[] = []): SlideNotes {
  const readings = readingsForSlide(slide, outcomes);
  const blocks: NoteBlock[] = [];
  const warnings: string[] = [];
  const sourceReferences: SlideNotes["sourceReferences"] = [];
  let title: string | undefined;
  let usedTitle = false;
  const pictureOnlySlide = isPictureOnlySlide(slide);

  for (const element of elementsInReadingOrder(slide.elements)) {
    if (element.type === "text" && element.isTitle && !usedTitle) {
      const heading = titleFrom(element.paragraphs);
      if (heading) {
        title = heading;
        usedTitle = true;
        sourceReferences.push({ slideNumber: slide.slideNumber, elementId: element.id });
        continue;
      }
    }

    const contributed = appendElement(element, readings, blocks, warnings, pictureOnlySlide, (imageTitle) => {
      if (!usedTitle && imageTitle) {
        title = imageTitle;
        usedTitle = true;
      }
    });
    if (contributed) {
      sourceReferences.push({ slideNumber: slide.slideNumber, elementId: element.id });
    }
  }

  if (blocks.length === 0 && title === undefined && warnings.length === 0) {
    warnings.push(EMPTY_SLIDE_WARNING);
  }

  return slideNotesSchema.parse({
    slideNumber: slide.slideNumber,
    ...(title === undefined ? {} : { title }),
    blocks,
    sourceReferences:
      sourceReferences.length > 0 ? sourceReferences : [{ slideNumber: slide.slideNumber }],
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export function readingsForSlide(slide: Slide, outcomes: ImageOutcome[]): Map<string, ImageOutcome> {
  const imageIds = new Set(
    slide.elements.flatMap((element) => (element.type === "image" ? [element.id] : [])),
  );
  const readings = new Map<string, ImageOutcome>();
  for (const analysis of slide.imageAnalyses ?? []) {
    if (!imageIds.has(analysis.imageId)) continue;
    readings.set(analysis.imageId, { imageId: analysis.imageId, status: "analyzed", analysis });
  }
  for (const outcome of outcomes) {
    if (!imageIds.has(outcome.imageId)) continue;
    readings.set(outcome.imageId, outcome);
  }
  return readings;
}

function appendElement(
  element: Slide["elements"][number],
  readings: Map<string, ImageOutcome>,
  blocks: NoteBlock[],
  warnings: string[],
  pictureOnlySlide: boolean,
  onImageTitle: (title: string) => void,
): boolean {
  if (element.type === "text") {
    const next = blocksFromParagraphs(element.paragraphs);
    blocks.push(...next);
    return next.length > 0;
  }
  if (element.type === "table") {
    if (element.rows.length === 0) return false;
    blocks.push({ type: "table", rows: element.rows, provenance: "source" });
    return true;
  }
  if (element.type === "shape") {
    if (!element.text?.trim()) return false;
    blocks.push({ type: "paragraph", content: element.text, provenance: "source" });
    return true;
  }
  if (element.type === "image") {
    return appendImage(element, readings.get(element.id), blocks, warnings, pictureOnlySlide, onImageTitle);
  }
  return false;
}

const PICTURE_KINDS = new Set<NonNullable<ImageAnalysis["kind"]>>(["diagram", "chart", "equation", "code"]);

function appendImage(
  element: Extract<Slide["elements"][number], { type: "image" }>,
  outcome: ImageOutcome | undefined,
  blocks: NoteBlock[],
  warnings: string[],
  pictureOnlySlide: boolean,
  onImageTitle: (title: string) => void,
): boolean {
  if (!outcome || outcome.status === "skipped") return false;
  if (outcome.status === "unanalyzed") {
    warnings.push(outcome.warning);
    return true;
  }
  return appendAnalysis(element.assetId, outcome.analysis, blocks, warnings, pictureOnlySlide, onImageTitle);
}

function appendAnalysis(
  assetId: string,
  analysis: ImageAnalysis,
  blocks: NoteBlock[],
  warnings: string[],
  pictureOnlySlide: boolean,
  onImageTitle: (title: string) => void,
): boolean {
  let contributed = false;
  const extracted = written(analysis.extractedText);
  const description = written(analysis.description);
  const relationships = (analysis.relationships ?? []).map(written).filter((item): item is string => item !== undefined);
  const structuredLines = structuredImageLines(analysis.lines);
  const picture = keepsPicture(analysis.kind, relationships, pictureOnlySlide);
  if (picture) {
    blocks.push({ type: "image", assetId, provenance: "source" });
    contributed = true;
    if (structuredLines) {
      const imageTitle = titleFromStructuredLines(structuredLines);
      if (imageTitle) onImageTitle(imageTitle);
    }
    for (const uncertainty of analysis.uncertainties ?? []) {
      const warning = written(uncertainty);
      if (!warning) continue;
      warnings.push(warning);
      contributed = true;
    }
    return contributed;
  }
  if (extracted && !picture) {
    blocks.push({ type: "paragraph", content: extracted, provenance: "source" });
    contributed = true;
  }
  if (description && (!picture || relationships.length === 0)) {
    blocks.push({ type: "paragraph", content: description, provenance: "interpretation" });
    contributed = true;
  }
  if (relationships.length > 0) {
    blocks.push({
      type: "bullets",
      provenance: "interpretation",
      items: relationships.map((text) => ({ text })),
    });
    contributed = true;
  }
  for (const uncertainty of analysis.uncertainties ?? []) {
    const warning = written(uncertainty);
    if (!warning) continue;
    warnings.push(warning);
    contributed = true;
  }
  return contributed;
}

function keepsPicture(
  kind: ImageAnalysis["kind"],
  relationships: string[],
  pictureOnlySlide: boolean,
): boolean {
  if (pictureOnlySlide) return true;
  return (kind !== undefined && PICTURE_KINDS.has(kind)) || relationships.length > 0;
}

function isPictureOnlySlide(slide: Slide): boolean {
  const images = slide.elements.filter((element) => element.type === "image");
  if (images.length !== 1) return false;
  for (const element of slide.elements) {
    if (element.type === "image") continue;
    if (element.type === "text") {
      if (element.paragraphs.some((paragraph) => written(paragraph.text))) return false;
      continue;
    }
    if (element.type === "table" && element.rows.length > 0) return false;
    if (element.type === "shape" && written(element.text)) return false;
  }
  return true;
}

function structuredImageLines(
  lines: ImageAnalysis["lines"],
): NonNullable<ImageAnalysis["lines"]> | undefined {
  if (!lines || lines.length === 0) return undefined;
  const kept = lines.filter((line) => written(line.text));
  return kept.length > 0 ? kept : undefined;
}

function titleFromStructuredLines(lines: NonNullable<ImageAnalysis["lines"]>): string | undefined {
  for (const line of lines) {
    if (line.role !== "title") continue;
    const text = written(line.text);
    if (text) return text;
  }
  return undefined;
}

function blocksFromParagraphs(paragraphs: TextParagraph[]): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let index = 0;
  while (index < paragraphs.length) {
    const current = paragraphs[index];
    if (!current || !written(current.text)) {
      index += 1;
      continue;
    }
    const kind = current.bullet ?? "none";
    if (kind === "none") {
      if (current.bold) {
        blocks.push({
          type: "heading",
          content: current.text,
          level: 2,
          provenance: "source",
        });
      } else {
        blocks.push({ type: "paragraph", content: current.text, provenance: "source" });
      }
      index += 1;
      continue;
    }
    const run: TextParagraph[] = [];
    while (index < paragraphs.length) {
      const next = paragraphs[index];
      if (!next || (next.bullet ?? "none") !== kind) break;
      if (written(next.text)) run.push(next);
      index += 1;
    }
    const items = nestItems(run);
    if (items.length === 0) continue;
    blocks.push({
      type: kind === "number" ? "numbered" : "bullets",
      items,
      provenance: "source",
    });
  }
  return blocks;
}

function nestItems(paragraphs: TextParagraph[]): NoteListItem[] {
  const roots: NoteListItem[] = [];
  const stack: { level: number; item: NoteListItem }[] = [];
  for (const paragraph of paragraphs) {
    const item: NoteListItem = { text: paragraph.text };
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= paragraph.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.item.children = [...(parent.item.children ?? []), item];
    else roots.push(item);
    stack.push({ level: paragraph.level, item });
  }
  return roots;
}

function titleFrom(paragraphs: TextParagraph[]): string | undefined {
  const lines = paragraphs.map((paragraph) => paragraph.text.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;
  return lines.join("\n");
}

function written(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  return value;
}
