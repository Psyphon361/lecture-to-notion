import { z } from "zod";

import { imageOutcomeSchema, type ImageOutcome } from "@/lib/ai/analyze-response";
import type { SlideContext } from "@/lib/ai/provider";
import { slideTitleOrFirstLine } from "@/lib/ppt/reading-order";
import { slideSchema, type Slide } from "@/lib/ppt/schema";

/**
 * One slide, the image outcomes that belong to it, and the neighbor title or first line.
 * Image bytes and the rest of the deck are not part of this request.
 */
export const processSlideRequestSchema = z
  .object({
    slide: slideSchema,
    outcomes: z.array(imageOutcomeSchema).max(500),
    previousLine: z.string().optional(),
    nextLine: z.string().optional(),
  })
  .strict();

export const processFailureSchema = z.object({
  ok: z.literal(false),
  message: z.string().min(1),
});

export type ProcessSlideRequest = z.infer<typeof processSlideRequestSchema>;

export function slideProcessBody(
  slides: readonly Slide[],
  index: number,
  outcomes: readonly ImageOutcome[],
): ProcessSlideRequest {
  const slide = slides[index];
  if (!slide) throw new Error("That slide is not in the deck.");
  const imageIds = new Set(
    slide.elements.flatMap((element) => (element.type === "image" ? [element.id] : [])),
  );
  const previousLine = neighborLine(slides[index - 1]);
  const nextLine = neighborLine(slides[index + 1]);
  return processSlideRequestSchema.parse({
    slide,
    outcomes: outcomes.filter((outcome) => imageIds.has(outcome.imageId)),
    ...(previousLine ? { previousLine } : {}),
    ...(nextLine ? { nextLine } : {}),
  });
}

export function slideContextFromRequest(body: ProcessSlideRequest): SlideContext {
  const previousLine = written(body.previousLine);
  const nextLine = written(body.nextLine);
  return {
    slide: body.slide,
    outcomes: body.outcomes,
    ...(previousLine ? { previousLine } : {}),
    ...(nextLine ? { nextLine } : {}),
  };
}

function neighborLine(slide: Slide | undefined): string | undefined {
  if (!slide) return undefined;
  return slideTitleOrFirstLine(slide);
}

function written(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}
