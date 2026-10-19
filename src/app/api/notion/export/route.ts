import { NextResponse, type NextRequest } from "next/server";

import { noteDocumentSchema, type NoteDocument } from "@/lib/documents/schema";
import { ensureFreshToken, resolveNotionAuth } from "@/lib/notion/auth";
import { exportNoteDocument } from "@/lib/notion/export-document";
import type { NotionEnv } from "@/lib/notion/oauth";
import {
  clearSession,
  writeSession,
  type NotionSession,
} from "@/lib/notion/session";
import { createLocalStorage, type Storage } from "@/lib/storage/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  return handleNotionExport(request, {
    storage: createLocalStorage(),
  });
}

export async function handleNotionExport(
  request: NextRequest,
  deps: {
    storage: Storage;
    fetch?: typeof fetch;
    env?: NotionEnv;
  },
): Promise<Response> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure(400, "The export request could not be read.");
  }

  const document = readDocument(payload);
  if (!document) return failure(400, "The export request could not be read.");

  const auth = resolveNotionAuth(request, env);
  if (!auth.accessToken) {
    return failure(
      400,
      "Notion is not connected. Connect Notion or add NOTION_TOKEN on the server.",
    );
  }

  let accessToken = auth.accessToken;
  let refreshedSession: NotionSession | undefined;
  if (auth.mode === "oauth") {
    const fresh = await ensureFreshToken(auth, env, fetchImpl);
    if (!fresh.ok) {
      const response = failure(fresh.status, fresh.message);
      if (fresh.reason === "reconnect") clearSession(response);
      return response;
    }
    accessToken = fresh.auth.accessToken ?? accessToken;
    refreshedSession = fresh.session;
  }

  const outcome = await exportNoteDocument({
    document,
    token: accessToken,
    parentPageId: auth.parentPageId,
    storage: deps.storage,
    fetch: fetchImpl,
  });

  if (!outcome.ok) {
    const response = failure(outcome.status, outcome.message);
    if (outcome.status === 401) clearSession(response);
    return response;
  }

  const response = NextResponse.json({ ok: true, pageUrl: outcome.pageUrl });
  if (refreshedSession && auth.sessionKey) {
    writeSession(response, refreshedSession, auth.sessionKey);
  }
  return response;
}

function readDocument(payload: unknown): NoteDocument | null {
  if (typeof payload !== "object" || payload === null || !("document" in payload)) {
    return null;
  }
  const parsed = noteDocumentSchema.safeParse(payload.document);
  return parsed.success ? parsed.data : null;
}

function failure(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status });
}
