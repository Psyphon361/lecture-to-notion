import { z } from "zod";

const imageKindSchema = z.enum([
  "diagram",
  "screenshot",
  "text",
  "photo",
  "chart",
  "equation",
  "code",
  "decorative",
]);

const imageLineRoleSchema = z.enum(["title", "heading", "body", "callout"]);

const imageLineModelSchema = z.object({
  role: imageLineRoleSchema.describe(
    "title is the main slide title. heading is a section line. body is normal text. callout is a boxed or emphasized note.",
  ),
  text: z.string().describe("One visible line, copied exactly as seen."),
});

/**
 * Fields the model is allowed to fill in.
 * No `.min()`: Zod's JSON Schema emits `minLength`, which Gemini ignores.
 * `imageId` is assigned by our code after the response is checked.
 */
export const imageAnalysisModelSchema = z.object({
  containsUsefulInformation: z
    .boolean()
    .describe("True only when the image contains lecture content a student would study."),
  kind: imageKindSchema
    .optional()
    .describe("What the image is, when that is visible."),
  extractedText: z
    .string()
    .optional()
    .describe("Verbatim text as seen. Do not correct spelling, codes, numbers, or equations."),
  lines: z
    .array(imageLineModelSchema)
    .optional()
    .describe(
      "Visible lines with a role when the slide is mostly one image. Copy each line exactly. Prefer lines over a single extractedText blob.",
    ),
  description: z
    .string()
    .optional()
    .describe("Interpretation of the picture. Not a quote of text in the image."),
  relationships: z
    .array(z.string())
    .optional()
    .describe("Only relationships that are visible, such as an arrow or a grouping."),
  uncertainties: z
    .array(z.string())
    .optional()
    .describe("Spots that could not be read, or claims that are unsure. Do not include spelling or typos."),
});

export const imageAnalysisSchema = imageAnalysisModelSchema.extend({
  imageId: z.string().min(1),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

const DROPPED_SCHEMA_KEYS = new Set(["$schema", "$id", "minLength", "maxLength"]);

/** JSON Schema sent as Gemini `responseJsonSchema`. */
export function imageAnalysisRequestJsonSchema(): Record<string, unknown> {
  return stripSchemaKeywords(imageAnalysisModelSchema.toJSONSchema());
}

const listItemModelSchema = z.object({
  text: z.string().describe("One point copied from the slide, as written."),
});

const blockProvenanceSchema = z
  .enum(["source", "interpretation"])
  .optional()
  .describe("source is text from the slide or image. interpretation is a description or relationship.");

/**
 * Shallow notes shape for Gemini. List items are text only.
 * No `.min()`: Zod's JSON Schema emits `minLength` / `minItems`, which Gemini ignores.
 * The slide number is assigned by our code after the response is checked.
 */
export const slideNotesModelSchema = z.object({
  title: z.string().optional().describe("The slide title, copied as written."),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("paragraph"),
          content: z.string(),
          provenance: blockProvenanceSchema,
        }),
        z.object({
          type: z.literal("bullets"),
          items: z.array(listItemModelSchema),
          provenance: blockProvenanceSchema,
        }),
        z.object({
          type: z.literal("numbered"),
          items: z.array(listItemModelSchema),
          provenance: blockProvenanceSchema,
        }),
        z.object({
          type: z.literal("code"),
          language: z.string().optional(),
          content: z.string(),
          provenance: blockProvenanceSchema,
        }),
        z.object({
          type: z.literal("table"),
          rows: z.array(z.array(z.string())),
          header: z.boolean().optional(),
          provenance: blockProvenanceSchema,
        }),
        z.object({
          type: z.literal("divider"),
          provenance: blockProvenanceSchema,
        }),
      ]),
    )
    .describe("Every point from this slide. Do not summarize the slide away."),
  sourceReferences: z.array(
    z.object({
      slideNumber: z.number().int().positive(),
      elementId: z.string().optional(),
    }),
  ),
  warnings: z.array(z.string()).optional().describe("Uncertainties. Not facts from the slide."),
});

export function slideNotesRequestJsonSchema(): Record<string, unknown> {
  return stripSchemaKeywords(slideNotesModelSchema.toJSONSchema());
}

const noteDocumentBlockModelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    content: z.string(),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("bullets"),
    items: z.array(listItemModelSchema),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("numbered"),
    items: z.array(listItemModelSchema),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("code"),
    language: z.string().optional(),
    content: z.string(),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("table"),
    rows: z.array(z.array(z.string())),
    header: z.boolean().optional(),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("image"),
    assetId: z.string().describe("The image id from the slide notes. Do not invent one."),
    caption: z.string().optional(),
    alt: z.string().optional(),
    provenance: blockProvenanceSchema,
  }),
  z.object({
    type: z.literal("divider"),
    provenance: blockProvenanceSchema,
  }),
]);

/**
 * Shallow document shape for Gemini. List items are text only.
 * No `.min()`: Zod's JSON Schema emits `minLength` / `minItems`, which Gemini ignores.
 */
export const noteDocumentModelSchema = z.object({
  title: z.string().describe("One title for the lecture."),
  sections: z
    .array(
      z.object({
        heading: z.string().optional().describe("A section heading taken from the notes."),
        level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .describe("1 is a top section. 3 is the deepest."),
        blocks: z.array(noteDocumentBlockModelSchema),
      }),
    )
    .describe("Every slide's points, under a heading hierarchy. Do not drop a slide."),
  sourceReferences: z
    .array(
      z.object({
        slideNumber: z.number().int().positive(),
        elementId: z.string().optional(),
      }),
    )
    .optional(),
});

export function noteDocumentRequestJsonSchema(): Record<string, unknown> {
  return stripSchemaKeywords(noteDocumentModelSchema.toJSONSchema());
}

function stripSchemaKeywords(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DROPPED_SCHEMA_KEYS.has(key)) continue;
    out[key] = stripChild(child);
  }
  return out;
}

function stripChild(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripChild(item));
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DROPPED_SCHEMA_KEYS.has(key)) continue;
    out[key] = stripChild(child);
  }
  return out;
}
