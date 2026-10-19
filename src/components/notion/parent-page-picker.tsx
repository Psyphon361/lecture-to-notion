"use client";

import { useCallback, useEffect, useState } from "react";

import {
  notionErrorResponseSchema,
  notionPagesResponseSchema,
  type AccessiblePage,
} from "@/lib/notion/contracts";

export function ParentPagePicker({
  onSelected,
}: {
  onSelected: () => void | Promise<void>;
}) {
  const [pages, setPages] = useState<AccessiblePage[]>([]);
  const [selected, setSelected] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notion/pages");
      const payload: unknown = await response.json();
      const parsed = notionPagesResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        setMessage(readMessage(payload) ?? "Notion pages could not be loaded.");
        return;
      }
      setPages(parsed.data.pages);
      setSelected(parsed.data.pages[0]?.id ?? "");
    } catch {
      setMessage("Notion pages could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPages();
    });
  }, [loadPages]);

  async function choose(pageId: string) {
    if (!pageId.trim()) {
      setMessage("Choose a page or paste a Notion page URL.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notion/parent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setMessage(readMessage(payload) ?? "That page could not be used.");
        return;
      }
      await onSelected();
    } catch {
      setMessage("That page could not be used.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">Choose the Notion page for this lecture</p>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading pages…</p>
      ) : pages.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No pages are shared with this connection. Choose at least one page in
          Notion, then reconnect.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Notion parent page"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !selected}
            onClick={() => void choose(selected)}
          >
            Use this page
          </button>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
          Use a Notion page URL instead
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label="Notion page URL"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            placeholder="https://www.notion.so/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button
            type="button"
            className={buttonClass}
            disabled={busy || url.trim().length === 0}
            onClick={() => void choose(url.trim())}
          >
            Use URL
          </button>
        </div>
      </details>
      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function readMessage(payload: unknown): string | null {
  const parsed = notionErrorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.message : null;
}

const buttonClass =
  "rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700";
