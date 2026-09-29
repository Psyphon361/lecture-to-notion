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
    .describe("Spots that could not be read, or claims that are unsure."),
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
