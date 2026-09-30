"use client";

import { useState } from "react";

import { NotePreview } from "@/components/preview/note-preview";
import { ExtractionReview } from "@/components/review/extraction-review";
import { SlideDeck, SlideFrame } from "@/components/review/slide-deck";
import type { ImageOutcome } from "@/lib/ai/analyze-response";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";
import type { Presentation } from "@/lib/ppt/schema";

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
  const showingDocument = noteDocument !== undefined;
  const count = showingDocument ? noteDocument.sections.length : slides.length;
  const lastIndex = Math.max(count - 1, 0);
  const currentIndex = Math.min(Math.max(index, 0), lastIndex);
  const slide = slides[Math.min(currentIndex, Math.max(slides.length - 1, 0))];

  if (!slide && !showingDocument) {
    return <p className="text-sm text-zinc-500">No slides were extracted.</p>;
  }

  const slideNumber = slide?.slideNumber ?? currentIndex + 1;

  return (
    <section
      className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden"
      aria-label={showingDocument ? "Notes" : `Slide ${slideNumber}`}
    >
      {showingDocument ? (
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
          <div className="p-6">
            {notes !== undefined ? (
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
