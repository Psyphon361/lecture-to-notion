"use client";

import { useEffect, useState } from "react";

import type { StageId, StageState } from "@/lib/pipeline/stages";

/** One line for the review screen. Processing screens keep the full stage list. */
export function reviewStageLine(stages: StageState[]): string {
  const organize = stages.find((stage) => stage.id === "organize");
  const tail =
    organize?.status === "done"
      ? "Organization is done."
      : organize?.detail === "Organization failed."
        ? "Organization failed."
        : "Organization has not started.";
  const structure = stages.find((stage) => stage.id === "process-slides");
  if (structure?.status === "done") return `Structured. ${tail}`;
  if (structure?.detail === "Stopped before every slide was structured.") {
    return `Structuring stopped. ${tail}`;
  }
  const analyze = stages.find((stage) => stage.id === "analyze-images");
  if (analyze?.status === "done") return `Images analyzed. ${tail}`;
  if (analyze?.status === "active") return `Analyzing images. ${tail}`;
  if (structure?.status === "active") return `Structuring. ${tail}`;
  return `Extracted. ${tail}`;
}

const ROTATE_MS = 4000;

/** Honest lines only. These requests do not report a slide number or a percent. */
const ACTIVE_DETAIL: Partial<Record<StageId, readonly string[]>> = {
  parse: ["Opening the file.", "Reading text and layout."],
  "analyze-images": [
    "Skipping decorative images.",
    "Reading diagrams.",
    "A picture deck takes longer.",
  ],
};

const MOTION_CSS = `
@keyframes processing-indeterminate {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(350%); }
}
.processing-indeterminate-bar {
  width: 40%;
  animation: processing-indeterminate 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .processing-indeterminate-bar {
    width: 100%;
    animation: none;
    transform: none;
  }
}
`;

type ProcessingStatusProps =
  | {
      compact?: false;
      title: string;
      summary: string;
      stages: StageState[];
    }
  | {
      compact: true;
      stages: StageState[];
    };

export function ProcessingStatus(props: ProcessingStatusProps) {
  const reduced = usePrefersReducedMotion();
  if (props.compact) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {reviewStageLine(props.stages)}
      </p>
    );
  }

  const { title, summary, stages } = props;
  const busy = stages.some((stage) => stage.status === "active");
  return (
    <section className="mx-auto w-full max-w-xl" aria-live="polite">
      {busy ? <style>{MOTION_CSS}</style> : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {busy ? <IndeterminateBar /> : null}
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{summary}</p>
      <ol className="mt-6 flex flex-col gap-3">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} reduced={reduced} />
        ))}
      </ol>
    </section>
  );
}

function StageRow({ stage, reduced }: { stage: StageState; reduced: boolean }) {
  const lines = stage.status === "active" ? ACTIVE_DETAIL[stage.id] : undefined;
  const rotating = useRotatingLine(lines, reduced);
  const active = stage.status === "active";
  return (
    <li
      className={
        active
          ? "flex gap-3 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900"
          : "flex gap-3 px-3 py-2"
      }
    >
      <StageMark status={stage.status} />
      <div>
        <p className="font-medium">{stage.label}</p>
        <p className="text-sm text-zinc-500">{rotating ?? stage.detail}</p>
      </div>
    </li>
  );
}

function StageMark({ status }: { status: StageState["status"] }) {
  const label = status === "done" ? "Done" : status === "active" ? "In progress" : "Waiting";
  const glyph = status === "done" ? "✓" : status === "active" ? "●" : "○";
  const tone =
    status === "active"
      ? "text-zinc-900 motion-safe:animate-pulse dark:text-zinc-50"
      : "text-zinc-700 dark:text-zinc-200";
  return (
    <span
      className={`mt-0.5 w-4 shrink-0 text-center font-medium ${tone}`}
      aria-label={label}
    >
      {glyph}
    </span>
  );
}

function IndeterminateBar() {
  return (
    <div
      className="mt-4 h-0.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      role="progressbar"
      aria-label="Still working"
    >
      <div className="processing-indeterminate-bar h-full rounded-full bg-zinc-800 dark:bg-zinc-100" />
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    if (typeof media.addEventListener !== "function") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return reduced;
}

function useRotatingLine(lines: readonly string[] | undefined, reduced: boolean): string | undefined {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [lines]);

  useEffect(() => {
    if (!lines || lines.length < 2 || reduced) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [lines, reduced]);

  if (!lines || lines.length === 0) return undefined;
  if (reduced) return lines[0];
  return lines[index] ?? lines[0];
}
