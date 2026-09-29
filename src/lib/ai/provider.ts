import type { ImageOutcome } from "@/lib/ai/analyze-response";
import type { ImageAnalysis } from "@/lib/ai/schema";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";
import type { Slide } from "@/lib/ppt/schema";

export interface ImageInput {
  imageId: string;
  mimeType: string;
  bytes: Uint8Array;
  altText?: string;
}

/** One slide, its image outcomes, and the neighbor title or first line. Never image bytes. */
export interface SlideContext {
  slide: Slide;
  outcomes: ImageOutcome[];
  previousLine?: string;
  nextLine?: string;
}

export interface AIProvider {
  analyzeImage(input: ImageInput): Promise<ImageAnalysis>;
  processSlide(input: SlideContext): Promise<SlideNotes>;
  organizeNotes(input: SlideNotes[]): Promise<NoteDocument>;
}
