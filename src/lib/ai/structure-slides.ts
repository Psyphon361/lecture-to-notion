import { processFailureSchema, slideProcessBody } from "@/lib/ai/process-request";
import type { ImageOutcome } from "@/lib/ai/analyze-response";
import { slideNotesSchema, type SlideNotes } from "@/lib/documents/schema";
import type { Slide } from "@/lib/ppt/schema";

export interface SlidePostResult {
  ok: boolean;
  payload: unknown;
}

export type StructureSlidesResult =
  | { ok: true; notes: SlideNotes[] }
  | { ok: false; notes: SlideNotes[]; message: string };

/**
 * One request per slide, in order. A failed request stops the loop.
 * Notes already returned stay in the result.
 */
export async function structureSlides(
  slides: readonly Slide[],
  outcomes: readonly ImageOutcome[],
  post: (body: ReturnType<typeof slideProcessBody>) => Promise<SlidePostResult>,
  onProgress?: (completed: number, total: number) => void,
): Promise<StructureSlidesResult> {
  const notes: SlideNotes[] = [];
  const total = slides.length;
  onProgress?.(0, total);
  for (let index = 0; index < total; index += 1) {
    let result: SlidePostResult;
    try {
      result = await post(slideProcessBody(slides, index, outcomes));
    } catch {
      return { ok: false, notes, message: "Slide structuring failed. Try the file again." };
    }
    const parsed = slideNotesSchema.safeParse(result.payload);
    if (!result.ok || !parsed.success) {
      const failure = processFailureSchema.safeParse(result.payload);
      return {
        ok: false,
        notes,
        message: failure.success ? failure.data.message : "Slide structuring failed. Try again.",
      };
    }
    notes.push(parsed.data);
    onProgress?.(notes.length, total);
  }
  return { ok: true, notes };
}
