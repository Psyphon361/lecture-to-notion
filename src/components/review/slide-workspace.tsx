"use client";

import { useState } from "react";

import { NotePreview } from "@/components/preview/note-preview";
import { ExtractionReview } from "@/components/review/extraction-review";
import { SlideDeck, SlideFrame } from "@/components/review/slide-deck";
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
  const notesReady = notes !== undefined || noteDocument !== undefined;
  const showingDocument = noteDocument !== undefined && view === "notes";
  const count = showingDocument ? noteDocument.sections.length : slides.length;
  const lastIndex = Math.max(count - 1, 0);
  const currentIndex = Math.min(Math.max(index, 0), lastIndex);
  const slide = slides[Math.min(currentIndex, Math.max(slides.length - 1, 0))];

  if (!slide && !showingDocument) {
    return <p className="text-sm text-zinc-500">No slides were extracted.</p>;
  }

  const showingNotes = notes !== undefined && view === "notes" && !showingDocument;
  const slideNumber = slide?.slideNumber ?? currentIndex + 1;

  return (
    <section
      className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden"
      aria-label={showingDocument ? "Notes" : `Slide ${slideNumber}`}
    >
      {notesReady ? (
        <div className="flex gap-2" role="group" aria-label={`Slide ${slideNumber} view`}>
          <button
            type="button"
            className={view === "notes" ? currentSlideClass : slideButtonClass}
            aria-pressed={view === "notes"}
            aria-label={`Slide ${slideNumber} notes`}
            onClick={() => setView("notes")}
          >
            Notes
          </button>
          <button
            type="button"
            className={view === "extracted" ? currentSlideClass : slideButtonClass}
            aria-pressed={view === "extracted"}
            aria-label={`Slide ${slideNumber} extracted`}
            onClick={() => setView("extracted")}
          >
            Extracted
          </button>
        </div>
      ) : null}
      {showingDocument && noteDocument ? (
        <SlideDeck
          filename={presentation.filename}
          document={noteDocument}
          index={currentIndex}
          onIndexChange={setIndex}
        />
      ) : slide ? (
        <SlideFrame
          filename={presentation.filename}
          index={currentIndex}
          count={slides.length}
          onIndexChange={setIndex}
        >
          <div className="h-full overflow-y-auto overscroll-contain p-6">
            {showingNotes ? (
              <NotePreview notes={notes} slides={slides} slideNumber={slide.slideNumber} />
            ) : (
              <ExtractionReview
                presentation={presentation}
                outcomes={outcomes}
                slideNumber={slide.slideNumber}
              />
            )}
          </div>
        </SlideFrame>
      ) : null}
    </section>
  );
}

const slideButtonClass =
  "min-w-8 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900";

const currentSlideClass =
  "min-w-8 rounded-md bg-zinc-900 px-2 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";
