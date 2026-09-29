import {
  uploadRejectionMessage,
  validatePptx,
  type UploadRejection,
} from "@/lib/upload/validate-pptx";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return rejection("missing");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return rejection("missing");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validatePptx({
    filename: file.name,
    byteLength: bytes.byteLength,
    magic: bytes.subarray(0, 4),
  });

  if (!result.ok) return rejection(result.reason);

  return Response.json({
    accepted: true,
    filename: file.name,
    byteSize: bytes.byteLength,
  });
}

function rejection(reason: UploadRejection) {
  return Response.json(
    {
      accepted: false,
      reason,
      message: uploadRejectionMessage(reason),
    },
    { status: 400 },
  );
}
