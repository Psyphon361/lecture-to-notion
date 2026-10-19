"use client";

import { useEffect, useState } from "react";

export default function NotionConnectedPage() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (window.opener) {
      window.opener.postMessage(
        error
          ? { type: "notion-error", message: error }
          : { type: "notion-connected" },
        window.location.origin,
      );
      window.close();
      return;
    }
    if (!error) {
      window.location.replace("/app");
      return;
    }
    queueMicrotask(() => {
      setMessage(error);
    });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notion connection</h1>
      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Notion is connected. You can close this window.
        </p>
      )}
      <a href="/app" className="text-sm font-medium underline">
        Back to the app
      </a>
    </main>
  );
}
