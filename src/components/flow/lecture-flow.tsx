"use client";

import { useState } from "react";

import { ProcessingStatus } from "@/components/processing/processing-status";
import { SlideWorkspace } from "@/components/review/slide-workspace";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import {
  analyzeFailureSchema,
  analyzeSuccessSchema,
  candidatesFromPresentation,
  presentationWithAnalyses,
  type ImageOutcome,
} from "@/lib/ai/analyze-response";
import { fallbackSlideNotes } from "@/lib/ai/slide-fallback";
import { organizeLocally } from "@/lib/documents/organize-locally";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";
import { parseFailureSchema, parseSuccessSchema } from "@/lib/ppt/parse-response";
import type { Presentation } from "@/lib/ppt/schema";
import {
  initialStages,
  stagesAfterOrganize,
  stagesWhileAnalyzing,
  type StageState,
} from "@/lib/pipeline/stages";

type StoredRun = {
  filename: string;
  runId: string;
  presentation: Presentation;
  warnings: string[];
};

type FlowState =
  | { phase: "idle" }
  | { phase: "rejected"; message: string }
  | { phase: "extracting"; filename: string; stages: StageState[] }
  | { phase: "analyzing"; filename: string; stages: StageState[] }
  | (StoredRun & {
      phase: "analyze-stopped";
      message: string;
      showExtracted: boolean;
    })
  | {
      phase: "review";
      filename: string;
      stages: StageState[];
      presentation: Presentation;
      warnings: string[];
      outcomes: ImageOutcome[];
      notes?: SlideNotes[];
      document?: NoteDocument;
    };

export function LectureFlow() {
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });

  async function onAccepted(file: File) {
    setFlow({
      phase: "extracting",
      filename: file.name,
      stages: initialStages(),
    });
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/parse", { method: "POST", body });
      const payload: unknown = await response.json();
      const success = parseSuccessSchema.safeParse(payload);
      if (response.ok && success.success) {
        await analyzeAndStructure({
          filename: success.data.presentation.filename,
          runId: success.data.runId,
          presentation: success.data.presentation,
          warnings: success.data.warnings,
        });
        return;
      }
      const failure = parseFailureSchema.safeParse(payload);
      setFlow({
        phase: "rejected",
        message: failure.success
          ? failure.data.message
          : "That PowerPoint file could not be read.",
      });
    } catch {
      setFlow({
        phase: "rejected",
        message: "The PowerPoint could not be read. Try the file again.",
      });
    }
  }

  async function analyzeAndStructure(run: StoredRun) {
    setFlow({
      phase: "analyzing",
      filename: run.filename,
      stages: stagesWhileAnalyzing(),
    });
    const analyzed = await requestImageAnalysis(run.runId, run.presentation);
    if (!analyzed.ok) {
      setFlow({
        phase: "analyze-stopped",
        filename: run.filename,
        runId: run.runId,
        presentation: run.presentation,
        warnings: run.warnings,
        message: analyzed.message,
        showExtracted: false,
      });
      return;
    }
    const presentation = presentationWithAnalyses(run.presentation, analyzed.outcomes);
    const notes = presentation.slides.map((slide) => fallbackSlideNotes(slide, analyzed.outcomes));
    organizeStructuredNotes({
      filename: run.filename,
      presentation,
      warnings: run.warnings,
      outcomes: analyzed.outcomes,
      notes,
    });
  }

  function organizeStructuredNotes(review: {
    filename: string;
    presentation: Presentation;
    warnings: string[];
    outcomes: ImageOutcome[];
    notes: SlideNotes[];
  }) {
    setFlow({
      phase: "review",
      filename: review.filename,
      stages: stagesAfterOrganize(),
      presentation: review.presentation,
      warnings: review.warnings,
      outcomes: review.outcomes,
      notes: review.notes,
      document: organizeLocally(review.notes, review.filename),
    });
  }

  if (flow.phase === "extracting") {
    return (
      <ProcessingStatus
        title="Extracting slides"
        summary={`Reading text, images, and layout from ${flow.filename}.`}
        stages={flow.stages}
      />
    );
  }

  if (flow.phase === "analyzing") {
    return (
      <ProcessingStatus
        title="Analyzing images"
        summary={`Reading diagrams and screenshots in ${flow.filename}. Structuring and organization have not started.`}
        stages={flow.stages}
      />
    );
  }

  if (flow.phase === "analyze-stopped") {
    const stopped = flow;
    return (
      <div className="mx-auto flex w-full flex-col gap-6">
        <button
          type="button"
          className="self-start text-sm font-medium underline"
          onClick={() => setFlow({ phase: "idle" })}
        >
          Upload a different file
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{stopped.filename}</h1>
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {stopped.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => void analyzeAndStructure(stopped)}
            >
              Try again
            </button>
            {stopped.showExtracted ? null : (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setFlow({ ...stopped, showExtracted: true })}
              >
                View extracted slides
              </button>
            )}
          </div>
        </div>
        {stopped.showExtracted ? (
          <SlideWorkspace presentation={stopped.presentation} outcomes={[]} />
        ) : null}
      </div>
    );
  }

  if (flow.phase === "review") {
    return (
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
        <button
          type="button"
          className="self-start text-sm font-medium underline"
          onClick={() => setFlow({ phase: "idle" })}
        >
          Upload a different file
        </button>
        <ProcessingStatus compact stages={flow.stages} />
        {flow.warnings.length > 0 ? (
          <div>
            <h2 className="text-sm font-medium">Warnings</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              {flow.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {flow.document ? <NotionExport document={flow.document} /> : null}
        <SlideWorkspace
          presentation={flow.presentation}
          outcomes={flow.outcomes}
          notes={flow.notes}
          noteDocument={flow.document}
        />
      </div>
    );
  }

  return (
    <div>
      <UploadDropzone onAccepted={(file) => void onAccepted(file)} />
      {flow.phase === "rejected" ? (
        <p role="alert" className="mt-4 text-center text-sm text-red-700 dark:text-red-300">
          {flow.message}
        </p>
      ) : null}
    </div>
  );
}

const primaryButtonClass =
  "rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";

const secondaryButtonClass =
  "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700";

function NotionExport({ document }: { document: NoteDocument }) {
  const [exporting, setExporting] = useState(false);
  const [pageUrl, setPageUrl] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function onExport() {
    setExporting(true);
    setMessage(undefined);
    setPageUrl(undefined);
    try {
      const response = await fetch("/api/notion/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document }),
      });
      const payload: unknown = await response.json();
      const success = readExportSuccess(payload);
      if (response.ok && success) {
        setPageUrl(success);
        return;
      }
      setMessage(readExportFailure(payload) ?? "Notion export failed. Try again.");
    } catch {
      setMessage("Notion export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className={primaryButtonClass}
        disabled={exporting}
        onClick={() => void onExport()}
      >
        {exporting ? "Exporting…" : "Export to Notion"}
      </button>
      {pageUrl ? (
        <a href={pageUrl} className="text-sm font-medium underline">
          {pageUrl}
        </a>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function readExportSuccess(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("ok" in payload) || payload.ok !== true) {
    return null;
  }
  if (!("pageUrl" in payload) || typeof payload.pageUrl !== "string" || !payload.pageUrl.startsWith("https://")) {
    return null;
  }
  return payload.pageUrl;
}

function readExportFailure(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("ok" in payload) || payload.ok !== false) {
    return null;
  }
  if (!("message" in payload) || typeof payload.message !== "string" || payload.message.length === 0) {
    return null;
  }
  return payload.message;
}

async function requestImageAnalysis(
  runId: string,
  presentation: Presentation,
): Promise<{ ok: true; outcomes: ImageOutcome[] } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/analyze-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        images: candidatesFromPresentation(presentation),
      }),
    });
    const payload: unknown = await response.json();
    const success = analyzeSuccessSchema.safeParse(payload);
    if (response.ok && success.success) {
      return { ok: true, outcomes: success.data.outcomes };
    }
    const failure = analyzeFailureSchema.safeParse(payload);
    return {
      ok: false,
      message: failure.success ? failure.data.message : "Image analysis failed. Try again.",
    };
  } catch {
    return { ok: false, message: "Image analysis failed. Try the file again." };
  }
}
