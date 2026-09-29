"use client";

import { useEffect, useState } from "react";

import { NotePreview } from "@/components/preview/note-preview";
import { ProcessingStatus } from "@/components/processing/processing-status";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { advanceStages, initialStages, stagesComplete, type StageState } from "@/lib/pipeline/stages";
import { uploadRejectionMessage, type UploadRejection } from "@/lib/upload/validate-pptx";

type FlowState =
  | { phase: "idle" }
  | { phase: "checking"; filename: string }
  | { phase: "rejected"; message: string }
  | { phase: "processing"; filename: string; stages: StageState[] }
  | { phase: "preview"; filename: string };

export function LectureFlow() {
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });

  useEffect(() => {
    if (flow.phase !== "processing") return;
    const timer = window.setInterval(() => {
      setFlow((current) => {
        if (current.phase !== "processing") return current;
        const stages = advanceStages(current.stages);
        if (stagesComplete(stages)) {
          return { phase: "preview", filename: current.filename };
        }
        return { ...current, stages };
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [flow.phase]);

  async function onAccepted(file: File) {
    setFlow({ phase: "checking", filename: file.name });
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = (await response.json()) as {
        accepted?: boolean;
        reason?: UploadRejection;
        message?: string;
      };
      if (!response.ok || !payload.accepted) {
        setFlow({
          phase: "rejected",
          message: payload.message ?? uploadRejectionMessage(payload.reason ?? "missing"),
        });
        return;
      }
      setFlow({
        phase: "processing",
        filename: file.name,
        stages: initialStages(),
      });
    } catch {
      setFlow({
        phase: "rejected",
        message: "The file check could not be reached. Nothing was saved.",
      });
    }
  }

  if (flow.phase === "processing") {
    return <ProcessingStatus filename={flow.filename} stages={flow.stages} />;
  }

  if (flow.phase === "preview") {
    return (
      <div className="flex flex-col gap-8">
        <p className="text-sm text-zinc-500">Checked {flow.filename}. Extraction has not run.</p>
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
      <UploadDropzone disabled={flow.phase === "checking"} onAccepted={(file) => void onAccepted(file)} />
      {flow.phase === "checking" ? <p className="mt-4 text-center text-sm text-zinc-500">Checking the file…</p> : null}
      {flow.phase === "rejected" ? (
        <p role="alert" className="mt-4 text-center text-sm text-red-700 dark:text-red-300">
          {flow.message}
        </p>
      ) : null}
    </div>
  );
}
