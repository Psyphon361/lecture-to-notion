import { z } from "zod";

/** Browser/server contract for Notion connection state. Tokens are never part of it. */

export const notionStatusSchema = z.object({
  ok: z.literal(true),
  oauthConfigured: z.boolean(),
  connected: z.boolean(),
  mode: z.enum(["oauth", "token", "none"]),
  workspaceName: z.string().nullable(),
  parentPageId: z.string().nullable(),
  needsParentPage: z.boolean(),
});

export const accessiblePageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  url: z.string().min(1),
});

export const notionPagesResponseSchema = z.object({
  ok: z.literal(true),
  pages: z.array(accessiblePageSchema),
});

export const notionActionResponseSchema = z.object({
  ok: z.literal(true),
});

export const notionErrorResponseSchema = z.object({
  ok: z.literal(false),
  message: z.string().min(1),
});

export type NotionStatus = z.infer<typeof notionStatusSchema>;
export type AccessiblePage = z.infer<typeof accessiblePageSchema>;
