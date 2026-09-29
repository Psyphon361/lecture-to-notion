import { z } from "zod";

export const imageAnalysisSchema = z.object({
  imageId: z.string().min(1),
  containsUsefulInformation: z.boolean(),
  kind: z
    .enum([
      "diagram",
      "screenshot",
      "text",
      "photo",
      "chart",
      "equation",
      "code",
      "decorative",
    ])
    .optional(),
  extractedText: z.string().optional(),
  description: z.string().optional(),
  relationships: z.array(z.string()).optional(),
  uncertainties: z.array(z.string()).optional(),
});

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;
