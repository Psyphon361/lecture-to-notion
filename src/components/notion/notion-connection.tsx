"use client";

import { useCallback, useEffect, useState } from "react";

import {
  notionErrorResponseSchema,
  notionStatusSchema,
  type NotionStatus,
} from "@/lib/notion/contracts";

export function NotionConnection({
  onStatus,
  initialStatus,
  connectMode = "same-tab",
}: {
  onStatus?: (status: NotionStatus | null) => void;
  initialStatus?: NotionStatus | null;
  connectMode?: "same-tab" | "new-tab";
}) {
  const [status, setStatus] = useState<NotionStatus | null>(initialStatus ?? null);
  const [loading, setLoading] = useState(initialStatus === undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await fetch("/api/notion/status", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        const parsed = notionStatusSchema.safeParse(payload);
        if (signal?.aborted) return;
        if (!response.ok || !parsed.success) {
          setMessage("Could not check the Notion connection.");
          return;
        }
        setStatus(parsed.data);
        onStatus?.(parsed.data);
        setMessage(null);
      } catch {
        if (!signal?.aborted) {
          setMessage("Could not check the Notion connection.");
        }
      } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (!signal?.aborted) setLoading(false);
      }
    },
    [onStatus],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void loadStatus(controller.signal);
    });
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null || !("type" in data)) return;
      if (data.type === "notion-connected") {
        setMessage(null);
        void loadStatus();
      }
      if (data.type === "notion-error") {
        const text =
          "message" in data && typeof data.message === "string"
            ? data.message
            : "Notion connection failed.";
        setMessage(text);
        void loadStatus();
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      controller.abort();
      window.removeEventListener("message", onMessage);
    };
  }, [loadStatus]);

  useEffect(() => {
    function onFocus() {
      void loadStatus();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadStatus]);

  async function disconnect() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notion/oauth/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        setMessage(readMessage(await response.json()) ?? "Notion could not be disconnected.");
        return;
      }
      await loadStatus();
    } catch {
      setMessage("Notion could not be disconnected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Notion</p>
        {loading ? (
          <p className="text-sm text-zinc-500">Checking…</p>
        ) : status?.connected ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {status.mode === "oauth"
              ? `Connected${status.workspaceName ? ` to ${status.workspaceName}` : ""}.`
              : "Using the server Notion token."}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Not connected.</p>
        )}
        {status?.mode === "oauth" ? (
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        ) : null}
        {(status ? !status.connected && status.oauthConfigured : !loading) ? (
          <a
            href="/api/notion/oauth/start"
            className={primaryButtonClass}
            {...(connectMode === "new-tab"
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            Connect Notion
          </a>
        ) : null}
      </div>

      {status?.needsParentPage ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Set NOTION_PARENT_PAGE_ID on the server to choose the export location.
        </p>
      ) : null}
      {status && !status.connected && !status.oauthConfigured ? (
        <p className="text-sm text-zinc-500">
          Add the Notion OAuth settings to connect a workspace, or set
          NOTION_TOKEN on the server.
        </p>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function readMessage(payload: unknown): string | null {
  const parsed = notionErrorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.message : null;
}

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";

const secondaryButtonClass =
  "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700";
