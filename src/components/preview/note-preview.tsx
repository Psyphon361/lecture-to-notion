import type { ReactNode } from "react";

import { StoredImage } from "@/components/assets/stored-image";
import type { NoteBlock, NoteDocument, NoteListItem, SlideNotes } from "@/lib/documents/schema";
import { storedAssetSrc } from "@/lib/storage/asset-url";
import type { Slide } from "@/lib/ppt/schema";

export function NotePreview({
  notes,
  slides,
  slideNumber,
}: {
  notes?: SlideNotes[];
  slides?: Slide[];
  slideNumber: number;
}) {
  const slideNotes = notes?.find((item) => item.slideNumber === slideNumber);
  const source = slides?.find((item) => item.slideNumber === slideNumber);
  const blockAssetIds = new Set(
    slideNotes?.blocks.flatMap((block) => (block.type === "image" ? [block.assetId] : [])) ?? [],
  );

  if (!slideNotes) {
    if (notes === undefined) return null;
    return (
      <article className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">This slide was not structured.</p>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold">
        Slide {slideNotes.slideNumber}
        {slideNotes.title ? `. ${slideNotes.title}` : ""}
      </h2>
      <SlidePictures slide={source} skipAssetIds={blockAssetIds} />
      {slideNotes.warnings && slideNotes.warnings.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
          {slideNotes.warnings.map((warning, warningIndex) => (
            <li key={`${warning}-${warningIndex}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {slideNotes.blocks.map((block, blockIndex) => (
        <BlockView key={blockIndex} block={block} />
      ))}
    </article>
  );
}

export function DocumentPreview({ document }: { document: NoteDocument }) {
  const jumps = document.sections.flatMap((section, index) => {
    const heading = section.heading?.trim();
    if (!heading) return [];
    return [{ index, heading }];
  });

  return (
    <article className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{document.title}</h2>
      {jumps.length > 0 ? (
        <nav aria-label="Sections">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {jumps.map((jump) => (
              <li key={jump.index}>
                <a className="underline" href={`#${sectionId(jump.index)}`}>
                  {jump.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {document.sections.map((section, index) => {
        const heading = section.heading?.trim();
        const HeadingTag = section.level === 3 ? "h5" : section.level === 2 ? "h4" : "h3";
        return (
          <section key={index} className="flex flex-col gap-3">
            {heading ? (
              <HeadingTag id={sectionId(index)} className="scroll-mt-6 font-semibold">
                {heading}
              </HeadingTag>
            ) : null}
            {section.blocks.map((block, blockIndex) => (
              <BlockView key={blockIndex} block={block} />
            ))}
          </section>
        );
      })}
    </article>
  );
}

function sectionId(index: number): string {
  return `note-section-${index}`;
}

function BlockView({ block }: { block: NoteBlock }) {
  const interpretation = block.provenance === "interpretation";
  const frame = interpretation
    ? "rounded-md border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950"
    : "";

  let body: ReactNode;
  switch (block.type) {
    case "paragraph":
      body = <p className="leading-7">{block.content}</p>;
      break;
    case "bullets":
      body = <ListTag ordered={false} items={block.items} />;
      break;
    case "numbered":
      body = <ListTag ordered items={block.items} />;
      break;
    case "code":
      body = (
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-sm dark:bg-zinc-900">
          <code>{block.content}</code>
        </pre>
      );
      break;
    case "table":
      body = <TableBlock rows={block.rows} header={block.header} />;
      break;
    case "divider":
      body = <hr className="border-zinc-200 dark:border-zinc-800" />;
      break;
    case "image":
      body = <ImageBlock assetId={block.assetId} alt={block.alt} caption={block.caption} />;
      break;
  }

  if (!interpretation) return body;
  return (
    <div className={frame}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-sky-800 dark:text-sky-200">
        Interpretation
      </p>
      {body}
    </div>
  );
}

function SlidePictures({ slide, skipAssetIds }: { slide?: Slide; skipAssetIds: Set<string> }) {
  const images = (slide?.elements ?? []).flatMap((element) =>
    element.type === "image" && storedAssetSrc(element.assetId) && !skipAssetIds.has(element.assetId)
      ? [element]
      : [],
  );
  if (images.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {images.map((image) => (
        <figure key={image.id} className="flex flex-col gap-2">
          <StoredImage assetId={image.assetId} alt={image.altText || "Image"} />
        </figure>
      ))}
    </div>
  );
}

function ImageBlock({
  assetId,
  alt,
  caption,
}: {
  assetId: string;
  alt?: string;
  caption?: string;
}) {
  const src = storedAssetSrc(assetId);
  return (
    <figure className="flex flex-col gap-2">
      {src ? (
        <StoredImage assetId={assetId} alt={alt || caption || "Image"} />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
          Image {assetId}
        </div>
      )}
      {caption ? <figcaption className="text-sm text-zinc-500">{caption}</figcaption> : null}
    </figure>
  );
}

function ListTag({ ordered, items }: { ordered: boolean; items: NoteListItem[] }) {
  const List = ordered ? "ol" : "ul";
  const listClass = ordered ? "list-decimal" : "list-disc";
  return (
    <List className={`${listClass} space-y-1 pl-5 leading-7`}>
      {items.map((item, index) => (
        <li key={index}>
          {item.text}
          {item.children && item.children.length > 0 ? (
            <ListTag ordered={ordered} items={item.children} />
          ) : null}
        </li>
      ))}
    </List>
  );
}

function TableBlock({ rows, header }: { rows: string[][]; header?: boolean }) {
  const [first, ...rest] = rows;
  const body = header ? rest : rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {header && first ? (
          <thead>
            <tr>
              {first.map((cell, index) => (
                <th key={index} className="border-b border-zinc-300 px-2 py-1 font-medium dark:border-zinc-700">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
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
