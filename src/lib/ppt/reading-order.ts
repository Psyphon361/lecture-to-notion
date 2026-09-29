import type { Slide, SlideElement, TextParagraph } from "@/lib/ppt/schema";

/**
 * Top to bottom, then left to right, using EMU positions.
 * Elements without a position stay after positioned ones, in their original order.
 */
export function elementsInReadingOrder(elements: SlideElement[]): SlideElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => {
      const byY = comparePosition(left.element.y, right.element.y);
      if (byY !== 0) return byY;
      const byX = comparePosition(left.element.x, right.element.x);
      if (byX !== 0) return byX;
      return left.index - right.index;
    })
    .map((item) => item.element);
}

/** Title placeholder text, or the first non-empty line when the slide has no title. */
export function slideHeading(slide: Slide): string {
  const ordered = elementsInReadingOrder(slide.elements);
  const title = ordered.find((element) => element.type === "text" && element.isTitle);
  const fromTitle = title?.type === "text" ? firstLine(title.paragraphs) : "";
  if (fromTitle) return fromTitle;
  for (const element of ordered) {
    if (element.type !== "text") continue;
    const line = firstLine(element.paragraphs);
    if (line) return line;
  }
  return "Untitled slide";
}

function firstLine(paragraphs: TextParagraph[]): string {
  for (const paragraph of paragraphs) {
    for (const line of paragraph.text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return "";
}

function comparePosition(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}
