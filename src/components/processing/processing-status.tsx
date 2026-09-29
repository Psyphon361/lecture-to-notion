import type { StageState } from "@/lib/pipeline/stages";

export function ProcessingStatus({
  filename,
  stages,
}: {
  filename: string;
  stages: StageState[];
}) {
  return (
    <section className="mx-auto w-full max-w-xl" aria-live="polite">
      <h1 className="text-2xl font-semibold tracking-tight">Checking the pipeline</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {filename} passed the file check. These stages are simulated. Nothing in the file has been read yet.
      </p>
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
