import {
  elementsInReadingOrder,
  slideHeading,
} from "@/lib/ppt/reading-order";
import type { SlideElement, TextParagraph, Presentation } from "@/lib/ppt/schema";

export function ExtractionReview({
  presentation,
  warnings,
}: {
  presentation: Presentation;
  warnings: string[];
}) {
  return (
    <section className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">What was extracted</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Slide number, title or first line, text, and image boxes in reading order. Use this to check that the file was read correctly.
      </p>
      {warnings.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium">Warnings</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="mt-8 flex flex-col gap-8">
        {presentation.slides.map((slide) => (
          <li key={slide.slideNumber} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">
              Slide {slide.slideNumber}. {slideHeading(slide)}
            </h2>
            {slide.hidden ? <p className="mt-1 text-sm text-zinc-500">Hidden slide</p> : null}
            {slide.speakerNotes ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Speaker notes. </span>
                {slide.speakerNotes}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-3">
              {slide.elements.length === 0 ? (
                <p className="text-sm text-zinc-500">No text or images were extracted.</p>
              ) : (
                elementsInReadingOrder(slide.elements).map((element) => (
                  <ElementView key={element.id} element={element} />
                ))
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ElementView({ element }: { element: SlideElement }) {
  switch (element.type) {
    case "text":
      return <TextBlock paragraphs={element.paragraphs} />;
    case "image":
      return <ImageBox element={element} />;
    case "table":
      return <TableBox rows={element.rows} />;
    case "shape":
      return (
        <p className="text-sm text-zinc-500">
          {element.text
            ? element.text
            : `Connector${element.connectsFrom ? ` from ${element.connectsFrom}` : ""}${element.connectsTo ? ` to ${element.connectsTo}` : ""}`}
        </p>
      );
  }
}

function TextBlock({ paragraphs }: { paragraphs: TextParagraph[] }) {
  return (
    <div className="flex flex-col gap-1 leading-7">
      {withMarkers(paragraphs).map((item, index) => (
        <p
          key={index}
          className="whitespace-pre-wrap break-words"
          style={{ paddingLeft: `${item.paragraph.level * 1.25}rem` }}
        >
          {item.marker}
          {item.paragraph.text}
        </p>
      ))}
    </div>
  );
}

function withMarkers(paragraphs: TextParagraph[]): { paragraph: TextParagraph; marker: string }[] {
  let number = 0;
  let level = -1;
  return paragraphs.map((paragraph) => {
    if (paragraph.bullet !== "number") {
      number = 0;
      level = -1;
      return {
        paragraph,
        marker: paragraph.bullet === "bullet" ? "• " : "",
      };
    }
    if (paragraph.level !== level) {
      number = 0;
      level = paragraph.level;
    }
    number += 1;
    return { paragraph, marker: `${number}. ` };
  });
}

function ImageBox({
  element,
}: {
  element: Extract<SlideElement, { type: "image" }>;
}) {
  const place = boxLabel(element);
  const details = [element.mimeType, place, element.cropped ? "Cropped" : undefined].filter(
    (part): part is string => Boolean(part),
  );
  return (
    <div className="rounded-md border border-dashed border-zinc-300 px-3 py-3 dark:border-zinc-700">
      <p className="font-medium">{element.altText || "Image"}</p>
      <p className="mt-1 text-sm text-zinc-500">{details.join(" · ")}</p>
    </div>
  );
}

function TableBox({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function boxLabel(element: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): string | undefined {
  const origin =
    element.x !== undefined && element.y !== undefined ? `${element.x}, ${element.y}` : undefined;
  const size =
    element.width !== undefined && element.height !== undefined
      ? `${element.width} × ${element.height} EMU`
      : undefined;
  if (origin && size) return `${origin} · ${size}`;
  return origin ?? size;
}
