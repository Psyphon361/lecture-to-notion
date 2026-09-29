"use client";

import { useState } from "react";

import { uploadRejectionMessage, validatePptx } from "@/lib/upload/validate-pptx";

export function UploadDropzone({
  disabled,
  onAccepted,
}: {
  disabled?: boolean;
  onAccepted: (file: File) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function takeFile(file: File | undefined) {
    if (!file) {
      setMessage(uploadRejectionMessage("missing"));
      return;
    }
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const result = validatePptx({
      filename: file.name,
      byteLength: file.size,
      magic: header,
    });
    if (!result.ok) {
      setMessage(uploadRejectionMessage(result.reason));
      return;
    }
    setMessage(null);
    onAccepted(file);
  }

  return (
    <section className="mx-auto w-full max-w-xl text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Turn lectures into notes</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Upload a lecture PowerPoint and review a structured draft. The draft keeps the lecture&apos;s detail. It is not a summary.
      </p>
      <label
        className={`mt-8 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 ${
          dragging ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900" : "border-zinc-300 dark:border-zinc-700"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void takeFile(event.dataTransfer.files[0]);
        }}
      >
        <span className="font-medium">Drop your PowerPoint here</span>
        <span className="text-sm text-zinc-500">.pptx only, up to 50 MB. Extracted images stay on this computer.</span>
        <input
          className="sr-only"
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          disabled={disabled}
          onChange={(event) => {
            void takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {message ? (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}
    </section>
  );
}
