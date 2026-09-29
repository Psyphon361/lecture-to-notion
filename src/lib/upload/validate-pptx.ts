/** Local validation cap. Function bodies on Vercel are still limited to 4.5 MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UploadRejection = "missing" | "extension" | "size" | "magic";

export type UploadValidation =
  | { ok: true }
  | { ok: false; reason: UploadRejection };

export function uploadRejectionMessage(reason: UploadRejection): string {
  switch (reason) {
    case "missing":
      return "Choose a PowerPoint file.";
    case "extension":
      return "Only .pptx files can be uploaded.";
    case "size":
      return "That file is over the 50 MB limit.";
    case "magic":
      return "That file is not a valid PowerPoint package.";
  }
}

export function validatePptx(input: {
  filename: string;
  byteLength: number;
  magic: Uint8Array;
}): UploadValidation {
  const filename = input.filename.trim();
  if (!filename) return { ok: false, reason: "missing" };
  if (!filename.toLowerCase().endsWith(".pptx")) {
    return { ok: false, reason: "extension" };
  }
  if (input.byteLength <= 0 || input.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: input.byteLength <= 0 ? "magic" : "size",
    };
  }
  if (
    input.magic.length < 2 ||
    input.magic[0] !== 0x50 ||
    input.magic[1] !== 0x4b
  ) {
    return { ok: false, reason: "magic" };
  }
  return { ok: true };
}
