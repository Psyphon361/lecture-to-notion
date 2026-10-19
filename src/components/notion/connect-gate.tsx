"use client";

import Link from "next/link";
import { useState } from "react";

import { NotionConnection } from "@/components/notion/notion-connection";
import type { NotionStatus } from "@/lib/notion/contracts";

export function ConnectGate({ initialStatus }: { initialStatus: NotionStatus }) {
  const [status, setStatus] = useState<NotionStatus | null>(initialStatus);
  const ready = status?.connected === true;

  return (
    <section className="flex flex-col gap-4">
      <NotionConnection initialStatus={initialStatus} onStatus={setStatus} />

      <div className="flex flex-wrap items-center gap-3">
        {ready ? (
          <Link href="/app" className={primaryButtonClass}>
            Continue to upload
          </Link>
        ) : (
          <button type="button" className={primaryButtonClass} disabled>
            Continue to upload
          </button>
        )}
        <p className="text-sm text-zinc-500">
          {ready
            ? "Connected. Notes export to the page you selected in Notion."
            : "Connect Notion to unlock the upload step."}
        </p>
      </div>
    </section>
  );
}

const primaryButtonClass =
  "rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900";
