import type { ReactNode } from "react";

import { mockNoteDocument } from "@/lib/documents/mock-note";
import type { NoteBlock, NoteListItem } from "@/lib/documents/schema";

const document = mockNoteDocument;

export function NotePreview() {
  return (
    <article className="mx-auto w-full max-w-3xl">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        Sample preview. This document was not generated from your file.
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{document.title}</h1>
      <div className="mt-8 flex flex-col gap-8">
        {document.sections.map((section, index) => (
          <section key={`${section.heading ?? "section"}-${index}`} className="flex flex-col gap-3">
            {section.heading ? <SectionHeading level={section.level ?? 2} text={section.heading} /> : null}
            {section.blocks.map((block, blockIndex) => (
              <BlockView key={blockIndex} block={block} />
            ))}
          </section>
        ))}
      </div>
      <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          disabled
          className="rounded-full bg-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          Export to Notion
        </button>
        <p className="mt-2 text-sm text-zinc-500">
          Export stays off until the notes pass a quality check.
        </p>
      </div>
    </article>
  );
}

function SectionHeading({ level, text }: { level: 1 | 2 | 3; text: string }) {
  if (level === 1) return <h2 className="text-2xl font-semibold">{text}</h2>;
  if (level === 3) return <h4 className="text-lg font-semibold">{text}</h4>;
  return <h3 className="text-xl font-semibold">{text}</h3>;
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
      body = (
        <figure className="flex flex-col gap-2">
          <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
            Image {block.assetId}
          </div>
          {block.caption ? <figcaption className="text-sm text-zinc-500">{block.caption}</figcaption> : null}
        </figure>
      );
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
