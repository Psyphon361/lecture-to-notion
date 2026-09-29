import { z } from "zod";

import { presentationSchema } from "@/lib/ppt/schema";

/** JSON body from `POST /api/parse`. Image bytes stay in storage. */
export const parseSuccessSchema = z.object({
  ok: z.literal(true),
  runId: z.string().min(1),
  presentation: presentationSchema,
  warnings: z.array(z.string()),
});

export const parseFailureSchema = z.object({
  ok: z.literal(false),
  reason: z.string().min(1),
  message: z.string().min(1),
});

export type ParseSuccess = z.infer<typeof parseSuccessSchema>;
export type ParseFailure = z.infer<typeof parseFailureSchema>;
