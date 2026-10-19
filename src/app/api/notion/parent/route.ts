import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ensureFreshToken, resolveNotionAuth } from "@/lib/notion/auth";
import { NotionApiError } from "@/lib/notion/client";
import { isSameOrigin, jsonError } from "@/lib/notion/http";
import type { NotionEnv } from "@/lib/notion/oauth";
import { NotionPageError, validateParentPage } from "@/lib/notion/pages";
import { clearSession, writeSession } from "@/lib/notion/session";

export const runtime = "nodejs";

const parentRequestSchema = z.object({ pageId: z.string().min(1) }).strict();

export async function POST(request: NextRequest): Promise<Response> {
  return handleNotionParent(request);
}

export async function handleNotionParent(
  request: NextRequest,
  deps: { env?: NotionEnv; fetch?: typeof fetch } = {},
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonError(403, "That request is not allowed.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "The page request could not be read.");
  }
  const parsed = parentRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "Add a Notion page id or page URL.");
  }

  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const auth = resolveNotionAuth(request, env);
  if (auth.mode !== "oauth" || !auth.session || !auth.sessionKey) {
    return jsonError(
      400,
      "Choosing a page here needs an OAuth connection. Set NOTION_PARENT_PAGE_ID for the server token.",
    );
  }

  const fresh = await ensureFreshToken(auth, env, fetchImpl);
  if (!fresh.ok) {
    const response = jsonError(fresh.status, fresh.message);
    if (fresh.reason === "reconnect") clearSession(response);
    return response;
  }

  const token = fresh.auth.accessToken ?? auth.accessToken;
  if (!token) {
    return jsonError(401, "Connect Notion first.");
  }
  try {
    const pageId = await validateParentPage(token, parsed.data.pageId, fetchImpl);
    const response = NextResponse.json({ ok: true, parentPageId: pageId });
    writeSession(
      response,
      { ...(fresh.session ?? auth.session), parentPageId: pageId },
      auth.sessionKey,
    );
    return response;
  } catch (error) {
    if (error instanceof NotionPageError) {
      return jsonError(400, error.message);
    }
    if (error instanceof NotionApiError) {
      if (error.status === 401) {
        const response = jsonError(
          401,
          "The Notion connection expired. Connect Notion again.",
        );
        clearSession(response);
        return response;
      }
      if (error.status === 403 || error.status === 404) {
        return jsonError(
          400,
          "That page is not shared with this Notion connection.",
        );
      }
    }
    return jsonError(502, "Notion could not verify that page.");
  }
}
