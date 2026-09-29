"use client";

import { useState } from "react";

import { NotePreview } from "@/components/preview/note-preview";
import { ProcessingStatus } from "@/components/processing/processing-status";
import { ExtractionReview } from "@/components/review/extraction-review";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { parseFailureSchema, parseSuccessSchema } from "@/lib/ppt/parse-response";
import type { Presentation } from "@/lib/ppt/schema";
import { initialStages, stagesAfterExtract, type StageState } from "@/lib/pipeline/stages";

type FlowState =
  | { phase: "idle" }
  | { phase: "rejected"; message: string }
  | { phase: "extracting"; filename: string; stages: StageState[] }
  | {
      phase: "review";
      filename: string;
      stages: StageState[];
      presentation: Presentation;
      warnings: string[];
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
        setFlow({
          phase: "review",
          filename: success.data.presentation.filename,
          stages: stagesAfterExtract(),
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

  if (flow.phase === "extracting") {
    return (
      <ProcessingStatus
        title="Extracting slides"
        summary={`Reading text, images, and layout from ${flow.filename}.`}
        stages={flow.stages}
      />
    );
  }

  if (flow.phase === "review") {
    return (
      <div className="flex flex-col gap-12">
        <ProcessingStatus
          title="Slides extracted"
          summary="Image analysis, structuring, and organization have not started."
          stages={flow.stages}
        />
        <ExtractionReview presentation={flow.presentation} warnings={flow.warnings} />
        <NotePreview />
        <button
          type="button"
          className="self-start text-sm font-medium underline"
          onClick={() => setFlow({ phase: "idle" })}
        >
          Upload a different file
        </button>
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
