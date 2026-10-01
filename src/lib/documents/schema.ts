import { z } from "zod";

/**
 * Canonical note model. AI output is validated into this shape.
 * Notion blocks are produced later by the adapter, never by the model.
 * Positions and slide geometry do not belong here.
 */

export const sourceReferenceSchema = z.object({
  slideNumber: z.number().int().positive(),
  elementId: z.string().min(1).optional(),
});

export const noteListItemSchema = z.object({
  text: z.string(),
  get children() {
    return z.array(noteListItemSchema).optional();
  },
});

const provenanceSchema = z.enum(["source", "interpretation"]).optional();

export const noteBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    content: z.string(),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("heading"),
    content: z.string(),
    level: z.literal(2),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("bullets"),
    items: z.array(noteListItemSchema),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("numbered"),
    items: z.array(noteListItemSchema),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("image"),
    assetId: z.string().min(1),
    caption: z.string().optional(),
    alt: z.string().optional(),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("code"),
    language: z.string().optional(),
    content: z.string(),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("table"),
    rows: z.array(z.array(z.string())),
    header: z.boolean().optional(),
    provenance: provenanceSchema,
  }),
  z.object({
    type: z.literal("divider"),
    provenance: provenanceSchema,
  }),
]);

export const noteSectionSchema = z.object({
  heading: z.string().optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  blocks: z.array(noteBlockSchema),
});

export const noteDocumentSchema = z.object({
  title: z.string(),
  sections: z.array(noteSectionSchema),
  sourceReferences: z.array(sourceReferenceSchema).optional(),
});

export const slideNotesSchema = z.object({
  slideNumber: z.number().int().positive(),
  title: z.string().optional(),
  blocks: z.array(noteBlockSchema),
  sourceReferences: z.array(sourceReferenceSchema),
  warnings: z.array(z.string()).optional(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type NoteListItem = z.infer<typeof noteListItemSchema>;
export type NoteBlock = z.infer<typeof noteBlockSchema>;
export type NoteSection = z.infer<typeof noteSectionSchema>;
export type NoteDocument = z.infer<typeof noteDocumentSchema>;
export type SlideNotes = z.infer<typeof slideNotesSchema>;
