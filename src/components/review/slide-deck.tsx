"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useEffect, type ReactNode } from "react";

import { NoteBlocks } from "@/components/preview/note-preview";
import type { NoteDocument } from "@/lib/documents/schema";

const genericSlideHeading = /^Slide \d+$/;

export function cardTitle(heading: string | undefined): string | undefined {
  const trimmed = heading?.trim();
  if (!trimmed || genericSlideHeading.test(trimmed)) return undefined;
  return trimmed;
}

export function SlideDeck({
  filename,
  document,
  index,
  onIndexChange,
}: {
  filename: string;
  document: NoteDocument;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const count = document.sections.length;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    watchDrag: true,
  });

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      onIndexChange(emblaApi.selectedScrollSnap());
    };
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onIndexChange]);

  useEffect(() => {
    if (!emblaApi) return;
    if (emblaApi.selectedScrollSnap() !== index) emblaApi.scrollTo(index);
  }, [emblaApi, index]);

  return (
    <SlideFrame filename={filename} index={index} count={count} onIndexChange={onIndexChange}>
      <div className="h-full min-h-0 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {document.sections.map((section, sectionIndex) => {
            const title = cardTitle(section.heading);
            const active = sectionIndex === index;
            return (
              <div
                key={sectionIndex}
                className="deck-scroll h-full min-w-0 flex-[0_0_100%] overflow-y-auto overscroll-contain"
                data-deck-section=""
                data-active={active ? "true" : "false"}
                aria-hidden={active ? undefined : true}
              >
                <div className="flex min-h-full flex-col justify-center gap-4 px-6 py-8">
                  {title ? <h2 className="text-2xl font-semibold">{title}</h2> : null}
                  <NoteBlocks blocks={section.blocks} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

export function SlideFrame({
  filename,
  index,
  count,
  onIndexChange,
  children,
}: {
  filename: string;
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      const next = event.key === "ArrowLeft" ? index - 1 : index + 1;
      onIndexChange(clampIndex(next, count));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, index, onIndexChange]);

  const position = count === 0 ? 0 : index + 1;
  const progress = count === 0 ? 0 : (position / count) * 100;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <p className="truncate text-sm text-zinc-500">{filename}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={navButtonClass}
          aria-label="Previous slide"
          disabled={count === 0 || index <= 0}
          onClick={() => onIndexChange(clampIndex(index - 1, count))}
        >
          Previous
        </button>
        <p className="min-w-16 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {position} / {count}
        </p>
        <button
          type="button"
          className={navButtonClass}
          aria-label="Next slide"
          disabled={count === 0 || index >= count - 1}
          onClick={() => onIndexChange(clampIndex(index + 1, count))}
        >
          Next
        </button>
      </div>
      <div
        className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-label="Slide progress"
        aria-valuemin={1}
        aria-valuemax={Math.max(count, 1)}
        aria-valuenow={Math.max(position, 1)}
      >
        <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const navButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700";
