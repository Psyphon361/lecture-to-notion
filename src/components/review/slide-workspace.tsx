"use client";

import { useEffect, useState } from "react";

import { DocumentPreview, NotePreview } from "@/components/preview/note-preview";
import { ExtractionReview } from "@/components/review/extraction-review";
import type { ImageOutcome } from "@/lib/ai/analyze-response";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";
import type { Presentation } from "@/lib/ppt/schema";

type SlideView = "notes" | "extracted";

export function SlideWorkspace({
  presentation,
  outcomes = [],
  notes,
  noteDocument,
}: {
  presentation: Presentation;
  outcomes?: ImageOutcome[];
  notes?: SlideNotes[];
  noteDocument?: NoteDocument;
}) {
  const slides = presentation.slides;
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<SlideView>("notes");
  const lastIndex = Math.max(slides.length - 1, 0);
  const currentIndex = Math.min(index, lastIndex);
  const slide = slides[currentIndex];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (noteDocument && view === "notes") return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setIndex((current) => {
        const bounded = Math.min(Math.max(current, 0), lastIndex);
        if (event.key === "ArrowLeft") return Math.max(0, bounded - 1);
        return Math.min(lastIndex, bounded + 1);
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastIndex, noteDocument, view]);

  if (!slide) {
    return <p className="text-sm text-zinc-500">No slides were extracted.</p>;
  }

  const notesReady = notes !== undefined || noteDocument !== undefined;
  const showingDocument = noteDocument !== undefined && view === "notes";
  const showingNotes = notes !== undefined && view === "notes" && !showingDocument;
  const position = currentIndex + 1;

  return (
    <section className="flex flex-col gap-6" aria-label={showingDocument ? "Notes" : `Slide ${slide.slideNumber}`}>
      {showingDocument ? null : (
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={navButtonClass}
          aria-label="Previous slide"
          disabled={currentIndex === 0}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
        >
          Previous
        </button>
        <p className="min-w-16 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {position} of {slides.length}
        </p>
        <button
          type="button"
          className={navButtonClass}
          aria-label="Next slide"
          disabled={currentIndex === lastIndex}
          onClick={() => setIndex((current) => Math.min(lastIndex, current + 1))}
        >
          Next
        </button>
      </div>
      )}
      {notesReady ? (
        <div className="flex gap-2" role="group" aria-label={`Slide ${slide.slideNumber} view`}>
          <button
            type="button"
            className={view === "notes" ? currentSlideClass : slideButtonClass}
            aria-pressed={view === "notes"}
            aria-label={`Slide ${slide.slideNumber} notes`}
            onClick={() => setView("notes")}
          >
            Notes
          </button>
          <button
            type="button"
            className={view === "extracted" ? currentSlideClass : slideButtonClass}
            aria-pressed={view === "extracted"}
            aria-label={`Slide ${slide.slideNumber} extracted`}
            onClick={() => setView("extracted")}
          >
            Extracted
          </button>
        </div>
      ) : null}
      {showingDocument && noteDocument ? (
        <DocumentPreview document={noteDocument} />
      ) : showingNotes ? (
        <NotePreview notes={notes} slides={slides} slideNumber={slide.slideNumber} />
      ) : (
        <ExtractionReview
          presentation={presentation}
          outcomes={outcomes}
          slideNumber={slide.slideNumber}
        />
      )}
    </section>
  );
}

const navButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700";

const slideButtonClass =
  "min-w-8 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900";

const currentSlideClass =
  "min-w-8 rounded-md bg-zinc-900 px-2 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
