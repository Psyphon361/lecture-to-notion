import { noteDocumentSchema, type NoteDocument } from "@/lib/documents/schema";
import { exportNoteDocument, type NotionExportInput } from "@/lib/notion/export-document";
import { createLocalStorage } from "@/lib/storage/storage";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleNotionExport(request, {
    token: process.env.NOTION_TOKEN,
    parentPageId: process.env.NOTION_PARENT_PAGE_ID,
    storage: createLocalStorage(),
  });
}

export async function handleNotionExport(
  request: Request,
  deps: Pick<NotionExportInput, "token" | "parentPageId" | "storage" | "fetch">,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure(400, "The export request could not be read.");
  }

  const document = readDocument(payload);
  if (!document) return failure(400, "The export request could not be read.");

  const outcome = await exportNoteDocument({
    document,
    token: deps.token,
    parentPageId: deps.parentPageId,
    storage: deps.storage,
    fetch: deps.fetch,
  });
  if (!outcome.ok) return failure(outcome.status, outcome.message);
  return Response.json({ ok: true, pageUrl: outcome.pageUrl });
}

function readDocument(payload: unknown): NoteDocument | null {
  if (typeof payload !== "object" || payload === null || !("document" in payload)) return null;
  const parsed = noteDocumentSchema.safeParse(payload.document);
  return parsed.success ? parsed.data : null;
}

function failure(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status });
}
