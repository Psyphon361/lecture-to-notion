import type { ImageOutcome } from "@/lib/ai/analyze-response";
import { readingsForSlide } from "@/lib/ai/slide-fallback";
import { elementsInReadingOrder } from "@/lib/ppt/reading-order";
import type { Slide } from "@/lib/ppt/schema";

export const PROMPT_VERSION = "slide-processing-v1";

/**
 * One prompt for one slide. Image bytes are not included.
 * A repair attempt appends the validator message and nothing else from the bad response.
 */
export function slideProcessingPrompt(input: {
  slide: Slide;
  outcomes: ImageOutcome[];
  previousLine?: string;
  nextLine?: string;
  validationError?: string;
}): string {
  const lines = [
    `You structure study notes for slide ${input.slide.slideNumber} only.`,
    "You keep every point. You copy terms and numbers as written. You do not summarize the slide away.",
    "Do not correct spelling, codes, equations, or identifiers. Do not add a point that is not in the source below.",
    "Text from the slide and image source text are source. Descriptions and relationships are interpretation.",
    "Put uncertainties in warnings. Do not state an uncertainty as a fact.",
    "Neighbor lines are context only. Do not copy them into this slide.",
  ];

  const previous = input.previousLine?.trim();
  if (previous) lines.push(`Previous slide: ${previous}`);
  const next = input.nextLine?.trim();
  if (next) lines.push(`Next slide: ${next}`);

  const material = materialLines(input.slide, input.outcomes);
  const body = material.length === 0 ? "(This slide has no text.)" : material.join("\n");
  lines.push(`Source for this slide:\n${body}`);

  const validationError = input.validationError?.trim();
  if (validationError) {
    lines.push(
      `The previous response failed validation: ${validationError.slice(0, 800)}. Return JSON that matches the schema.`,
    );
  }
  return lines.join("\n\n");
}

function materialLines(slide: Slide, outcomes: ImageOutcome[]): string[] {
  const readings = readingsForSlide(slide, outcomes);
  const lines: string[] = [];
  for (const element of elementsInReadingOrder(slide.elements)) {
    if (element.type === "text") {
      for (const paragraph of element.paragraphs) {
        if (!paragraph.text.trim()) continue;
        const kind = paragraph.bullet ?? "none";
        const label =
          element.isTitle
            ? "title"
            : kind === "none"
              ? "text (none)"
              : `text (${kind}, level ${paragraph.level})`;
        lines.push(`[${element.id}] ${label}: ${paragraph.text}`);
      }
      continue;
    }
    if (element.type === "table") {
      if (element.rows.length === 0) continue;
      lines.push(`[${element.id}] table:`);
      for (const row of element.rows) lines.push(row.join(" | "));
      continue;
    }
    if (element.type === "shape") {
      if (!element.text?.trim()) continue;
      lines.push(`[${element.id}] text (none): ${element.text}`);
      continue;
    }
    if (element.type === "image") {
      lines.push(...imageLines(element.id, readings.get(element.id)));
    }
  }
  return lines;
}

function imageLines(imageId: string, outcome: ImageOutcome | undefined): string[] {
  if (!outcome || outcome.status === "skipped") return [];
  if (outcome.status === "unanalyzed") {
    return [`[${imageId}] This image was not read: ${outcome.warning}`];
  }
  const { analysis } = outcome;
  const lines: string[] = [];
  if (analysis.extractedText?.trim()) {
    lines.push(`[${imageId}] source text: ${analysis.extractedText}`);
  }
  if (analysis.description?.trim()) {
    lines.push(`[${imageId}] interpretation: ${analysis.description}`);
  }
  for (const relationship of analysis.relationships ?? []) {
    if (!relationship.trim()) continue;
    lines.push(`[${imageId}] interpretation: ${relationship}`);
  }
  for (const uncertainty of analysis.uncertainties ?? []) {
    if (!uncertainty.trim()) continue;
    lines.push(`[${imageId}] uncertainty: ${uncertainty}`);
  }
  return lines;
}
