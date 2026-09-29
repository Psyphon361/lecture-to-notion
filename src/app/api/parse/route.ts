import { parseFailureSchema, parseSuccessSchema } from "@/lib/ppt/parse-response";
import { parseUpload } from "@/lib/ppt/parse-upload";
import { purgeExpiredRuns } from "@/lib/storage/storage";
import {
  MAX_UPLOAD_BYTES,
  uploadRejectionMessage,
  type UploadRejection,
} from "@/lib/upload/validate-pptx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await purgeExpiredRuns().catch(() => undefined);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(400, "missing", uploadRejectionMessage("missing"));
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return failure(400, "missing", uploadRejectionMessage("missing"));
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    const reason: UploadRejection = file.size <= 0 ? "magic" : "size";
    return failure(400, reason, uploadRejectionMessage(reason));
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await parseUpload({ filename: file.name, bytes });
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

function failure(status: number, reason: string, message: string) {
  const body = parseFailureSchema.parse({ ok: false, reason, message });
  return Response.json(body, { status });
}
