import { z } from "zod";

import { imageAnalysisSchema } from "@/lib/ai/schema";
import type { Presentation } from "@/lib/ppt/schema";

export const analyzeCandidateSchema = z.object({
  imageId: z.string().min(1),
  assetId: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  mimeType: z.string().min(1),
  slideNumber: z.number().int().positive(),
  width: z.number().optional(),
  height: z.number().optional(),
  altText: z.string().optional(),
});

export const analyzeImagesRequestSchema = z.object({
  runId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  images: z.array(analyzeCandidateSchema).max(500),
});

export const imageOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    imageId: z.string().min(1),
    status: z.literal("skipped"),
    reason: z.string().min(1),
  }),
  z.object({
    imageId: z.string().min(1),
    status: z.literal("analyzed"),
    analysis: imageAnalysisSchema,
  }),
  z.object({
    imageId: z.string().min(1),
    status: z.literal("unanalyzed"),
    warning: z.string().min(1),
  }),
]);

export const analyzeSuccessSchema = z.object({
  ok: z.literal(true),
  outcomes: z.array(imageOutcomeSchema),
});

export const analyzeFailureSchema = z.object({
  ok: z.literal(false),
  message: z.string().min(1),
});

export type AnalyzeCandidate = z.infer<typeof analyzeCandidateSchema>;
export type ImageOutcome = z.infer<typeof imageOutcomeSchema>;
export type AnalyzeSuccess = z.infer<typeof analyzeSuccessSchema>;
export type AnalyzeFailure = z.infer<typeof analyzeFailureSchema>;

export function candidatesFromPresentation(presentation: Presentation): AnalyzeCandidate[] {
  return presentation.slides.flatMap((slide) =>
    slide.elements.flatMap((element) => {
      if (element.type !== "image") return [];
      return [
        {
          imageId: element.id,
          assetId: element.assetId,
          contentHash: element.contentHash,
          mimeType: element.mimeType,
          slideNumber: slide.slideNumber,
          ...(element.width === undefined ? {} : { width: element.width }),
          ...(element.height === undefined ? {} : { height: element.height }),
          ...(element.altText ? { altText: element.altText } : {}),
        },
      ];
    }),
  );
}

/** Copy each successful analysis onto the slide that owns that image element. */
export function presentationWithAnalyses(
  presentation: Presentation,
  outcomes: ImageOutcome[],
): Presentation {
  const byId = new Map(
    outcomes.flatMap((outcome) =>
      outcome.status === "analyzed" ? [[outcome.imageId, outcome.analysis] as const] : [],
    ),
  );
  return {
    ...presentation,
    slides: presentation.slides.map((slide) => {
      const imageAnalyses = slide.elements.flatMap((element) => {
        const analysis = byId.get(element.id);
        return analysis ? [analysis] : [];
      });
      if (imageAnalyses.length === 0) return slide;
      return { ...slide, imageAnalyses };
    }),
  };
}
