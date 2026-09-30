import type { StageState } from "@/lib/pipeline/stages";

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
  if (props.compact) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {reviewStageLine(props.stages)}
      </p>
    );
  }

  const { title, summary, stages } = props;
  return (
    <section className="mx-auto w-full max-w-xl" aria-live="polite">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{summary}</p>
      <ol className="mt-6 flex flex-col gap-3">
        {stages.map((stage) => (
          <li key={stage.id} className="flex gap-3">
            <StageMark status={stage.status} />
            <div>
              <p className="font-medium">{stage.label}</p>
              <p className="text-sm text-zinc-500">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageMark({ status }: { status: StageState["status"] }) {
  const label = status === "done" ? "Done" : status === "active" ? "In progress" : "Waiting";
  const glyph = status === "done" ? "✓" : status === "active" ? "●" : "○";
  return (
    <span
      className="mt-0.5 w-4 text-center font-medium text-zinc-700 dark:text-zinc-200"
      aria-label={label}
    >
      {glyph}
    </span>
  );
}
