import { parseFailureSchema, parseSuccessSchema } from "@/lib/ppt/parse-response";
import { parseUpload } from "@/lib/ppt/parse-upload";
import { deleteUploadedDeck, readUploadedDeck } from "@/lib/storage/blob-storage";
import { isBlobConfigured, purgeExpired } from "@/lib/storage/default-storage";
import {
  MAX_UPLOAD_BYTES,
  uploadRejectionMessage,
  type UploadRejection,
} from "@/lib/upload/validate-pptx";

export const runtime = "nodejs";

/**
 * Two ways in:
 * - JSON `{ blobPathname, filename }`: the deck was uploaded straight to Blob
 *   (needed on Vercel, where a function body is capped at 4.5 MB).
 * - multipart `file`: local development without a Blob store.
 */
export async function POST(request: Request) {
  await purgeExpired().catch(() => undefined);

  const read = await readDeck(request);
  if (!read.ok) return failure(read.status, read.reason, read.message);

  const result = await parseUpload({ filename: read.filename, bytes: read.bytes });
  if (read.cleanup) await read.cleanup().catch(() => undefined);
  if (!result.ok) {
    return failure(result.status, result.reason, result.message);
  }

  const body = parseSuccessSchema.parse({
    ok: true,
    runId: result.runId,
    presentation: result.presentation,
    warnings: result.warnings,
  });
  return Response.json(body);
}

type DeckRead =
  | { ok: true; filename: string; bytes: Uint8Array; cleanup?: () => Promise<void> }
  | { ok: false; status: 400 | 500; reason: string; message: string };

async function readDeck(request: Request): Promise<DeckRead> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return readBlobDeck(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return rejected("missing");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return rejected("missing");
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return rejected(file.size <= 0 ? "magic" : "size");
  }
  return { ok: true, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function readBlobDeck(request: Request): Promise<DeckRead> {
  if (!isBlobConfigured()) return rejected("missing");
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return rejected("missing");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("blobPathname" in payload) ||
    typeof payload.blobPathname !== "string" ||
    !("filename" in payload) ||
    typeof payload.filename !== "string"
  ) {
    return rejected("missing");
  }
  const pathname = payload.blobPathname;
  let bytes: Uint8Array | null;
  try {
    bytes = await readUploadedDeck(pathname, MAX_UPLOAD_BYTES);
  } catch {
    return {
      ok: false,
      status: 500,
      reason: "storage",
      message: "The uploaded file could not be read. Try the upload again.",
    };
  }
  if (!bytes) return rejected("missing");
  return {
    ok: true,
    filename: payload.filename,
    bytes,
    cleanup: () => deleteUploadedDeck(pathname),
  };
}

function rejected(reason: UploadRejection): DeckRead {
  return { ok: false, status: 400, reason, message: uploadRejectionMessage(reason) };
}

function failure(status: number, reason: string, message: string) {
  const body = parseFailureSchema.parse({ ok: false, reason, message });
  return Response.json(body, { status });
}
