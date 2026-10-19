import { NextResponse, type NextRequest } from "next/server";

import { ensureFreshToken, resolveNotionAuth } from "@/lib/notion/auth";
import { NotionApiError } from "@/lib/notion/client";
import { notionPagesResponseSchema } from "@/lib/notion/contracts";
import { jsonError } from "@/lib/notion/http";
import type { NotionEnv } from "@/lib/notion/oauth";
import { listAccessiblePages } from "@/lib/notion/pages";
import { clearSession, writeSession, type NotionSession } from "@/lib/notion/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  return handleNotionPages(request);
}

export async function handleNotionPages(
  request: NextRequest,
  deps: { env?: NotionEnv; fetch?: typeof fetch } = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const auth = resolveNotionAuth(request, env);
  if (!auth.accessToken) {
    return jsonError(401, "Connect Notion first.");
  }

  let token = auth.accessToken;
  let refreshedSession: NotionSession | undefined;
  if (auth.mode === "oauth") {
    const fresh = await ensureFreshToken(auth, env, fetchImpl);
    if (!fresh.ok) {
      const response = jsonError(fresh.status, fresh.message);
      if (fresh.reason === "reconnect") clearSession(response);
      return response;
    }
    token = fresh.auth.accessToken ?? token;
    refreshedSession = fresh.session;
  }

  try {
    const pages = await listAccessiblePages(token, fetchImpl);
    const response = NextResponse.json(
      notionPagesResponseSchema.parse({ ok: true, pages }),
    );
    if (refreshedSession && auth.sessionKey) {
      writeSession(response, refreshedSession, auth.sessionKey);
    }
    return response;
  } catch (error) {
    if (error instanceof NotionApiError && error.status === 401) {
      const response = jsonError(
        401,
        "The Notion connection expired. Connect Notion again.",
      );
      clearSession(response);
      return response;
    }
    return jsonError(502, "Notion pages could not be loaded.");
  }
}
