"use client";

import { useState } from "react";

import { NotePreview } from "@/components/preview/note-preview";
import { ProcessingStatus } from "@/components/processing/processing-status";
import { ExtractionReview } from "@/components/review/extraction-review";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import {
  analyzeFailureSchema,
  analyzeSuccessSchema,
  candidatesFromPresentation,
  presentationWithAnalyses,
  type ImageOutcome,
} from "@/lib/ai/analyze-response";
import { parseFailureSchema, parseSuccessSchema } from "@/lib/ppt/parse-response";
import type { Presentation } from "@/lib/ppt/schema";
import {
  initialStages,
  stagesAfterAnalyze,
  stagesAfterExtract,
  stagesWhileAnalyzing,
  type StageState,
} from "@/lib/pipeline/stages";

type FlowState =
  | { phase: "idle" }
  | { phase: "rejected"; message: string }
  | { phase: "extracting"; filename: string; stages: StageState[] }
  | { phase: "analyzing"; filename: string; stages: StageState[] }
  | {
      phase: "review";
      filename: string;
      stages: StageState[];
      presentation: Presentation;
      warnings: string[];
      outcomes: ImageOutcome[];
      analysisMessage?: string;
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
        const filename = success.data.presentation.filename;
        setFlow({
          phase: "analyzing",
          filename,
          stages: stagesWhileAnalyzing(),
        });
        const analyzed = await requestImageAnalysis(
          success.data.runId,
          success.data.presentation,
        );
        if (analyzed.ok) {
          setFlow({
            phase: "review",
            filename,
            stages: stagesAfterAnalyze(),
            presentation: presentationWithAnalyses(success.data.presentation, analyzed.outcomes),
            warnings: success.data.warnings,
            outcomes: analyzed.outcomes,
          });
          return;
        }
        setFlow({
          phase: "review",
          filename,
          stages: stagesAfterExtract(),
          presentation: success.data.presentation,
          warnings: success.data.warnings,
          outcomes: [],
          analysisMessage: analyzed.message,
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

  if (flow.phase === "analyzing") {
    return (
      <ProcessingStatus
        title="Analyzing images"
        summary={`Reading diagrams and screenshots in ${flow.filename}. Structuring and organization have not started.`}
        stages={flow.stages}
      />
    );
  }

  if (flow.phase === "review") {
    return (
      <div className="flex flex-col gap-12">
        <ProcessingStatus
          title={flow.analysisMessage ? "Slides extracted" : "Images analyzed"}
          summary={
            flow.analysisMessage
              ? "Image analysis did not finish. Structuring and organization have not started."
              : "Image analysis finished. Structuring and organization have not started."
          }
          stages={flow.stages}
        />
        {flow.analysisMessage ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {flow.analysisMessage}
          </p>
        ) : null}
        <ExtractionReview
          presentation={flow.presentation}
          warnings={flow.warnings}
          outcomes={flow.outcomes}
        />
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
