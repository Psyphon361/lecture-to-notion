import { z } from "zod";

import { imageAnalysisSchema } from "@/lib/ai/schema";

/**
 * Normalized deterministic view of a PPTX.
 * Coordinates are English Metric Units (EMU), the OOXML unit. 914400 EMU = 1 inch.
 */

const baseElementSchema = z.object({
  id: z.string().min(1),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().optional(),
});

export const textParagraphSchema = z.object({
  text: z.string(),
  level: z.number().int().min(0),
  bullet: z.enum(["bullet", "number", "none"]).optional(),
});

export const slideElementSchema = z.discriminatedUnion("type", [
  baseElementSchema.extend({
    type: z.literal("text"),
    paragraphs: z.array(textParagraphSchema),
    isTitle: z.boolean().optional(),
  }),
  baseElementSchema.extend({
    type: z.literal("image"),
    assetId: z.string().min(1),
    contentHash: z.string().min(1),
    mimeType: z.string().min(1),
    altText: z.string().optional(),
    cropped: z.boolean().optional(),
  }),
  baseElementSchema.extend({
    type: z.literal("table"),
    rows: z.array(z.array(z.string())),
  }),
  baseElementSchema.extend({
    type: z.literal("shape"),
    shapeType: z.string().optional(),
    text: z.string().optional(),
    connectsFrom: z.string().optional(),
    connectsTo: z.string().optional(),
  }),
]);

export const slideSchema = z.object({
  slideNumber: z.number().int().positive(),
  hidden: z.boolean().optional(),
  elements: z.array(slideElementSchema),
  speakerNotes: z.string().optional(),
  imageAnalyses: z.array(imageAnalysisSchema).optional(),
});

export const presentationSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  title: z.string().optional(),
  slides: z.array(slideSchema),
});

export type TextParagraph = z.infer<typeof textParagraphSchema>;
export type SlideElement = z.infer<typeof slideElementSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type Presentation = z.infer<typeof presentationSchema>;
