import type { ImageAnalysis } from "@/lib/ai/schema";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";

export interface ImageInput {
  imageId: string;
  mimeType: string;
  bytes: Uint8Array;
  altText?: string;
}

/** Assembled per slide. Never the whole deck, and never Notion JSON. */
export interface SlideContext {
  slideNumber: number;
  title?: string;
  sourceText: string;
  imageAnalyses: ImageAnalysis[];
  previousSummary?: string;
  nextSummary?: string;
}

export interface AIProvider {
  analyzeImage(input: ImageInput): Promise<ImageAnalysis>;
  processSlide(input: SlideContext): Promise<SlideNotes>;
  organizeNotes(input: SlideNotes[]): Promise<NoteDocument>;
}
