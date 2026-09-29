import { PptxParseError, parsePptx } from "@/lib/ppt/parse-pptx";
import type { Presentation } from "@/lib/ppt/schema";
import {
  createLocalStorage,
  createRunId,
  imageAssetKey,
  type Storage,
} from "@/lib/storage/storage";
import {
  uploadRejectionMessage,
  validatePptx,
  type UploadRejection,
} from "@/lib/upload/validate-pptx";

export type ParseUploadSuccess = {
  ok: true;
  runId: string;
  presentation: Presentation;
  warnings: string[];
};

export type ParseUploadFailure = {
  ok: false;
  status: 400 | 500;
  reason: UploadRejection | "parse" | "storage";
  message: string;
};

export type ParseUploadResult = ParseUploadSuccess | ParseUploadFailure;

/**
 * Validate a PPTX, parse it, and store each unique image under `runId`.
 * The returned presentation uses storage keys as image `assetId`s and does not include bytes.
 */
export async function parseUpload(
  input: { filename: string; bytes: Uint8Array },
  storage: Storage = createLocalStorage(),
  runId = createRunId(),
): Promise<ParseUploadResult> {
  const filename = uploadBasename(input.filename);
  const validation = validatePptx({
    filename,
    byteLength: input.bytes.byteLength,
    magic: input.bytes.subarray(0, 4),
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      reason: validation.reason,
      message: uploadRejectionMessage(validation.reason),
    };
  }

  let parsed: Awaited<ReturnType<typeof parsePptx>>;
  try {
    parsed = await parsePptx({ filename, bytes: input.bytes, id: runId });
  } catch (error) {
    const message =
      error instanceof PptxParseError
        ? error.message
        : "That PowerPoint file could not be read.";
    return { ok: false, status: 400, reason: "parse", message };
  }

  const written: string[] = [];
  try {
    for (const image of parsed.images) {
      const key = imageAssetKey(runId, image.contentHash);
      await storage.put(key, image.bytes, image.mimeType);
      written.push(key);
    }
    return {
      ok: true,
      runId,
      warnings: parsed.warnings,
      presentation: withAssetKeys(parsed.presentation, runId),
    };
  } catch {
    await Promise.all(
      written.map((key) => storage.delete(key).catch(() => undefined)),
    );
    return {
      ok: false,
      status: 500,
      reason: "storage",
      message: "The slides were read, but an image could not be saved.",
    };
  }
}

function withAssetKeys(presentation: Presentation, runId: string): Presentation {
  return {
    ...presentation,
    slides: presentation.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) => {
        if (element.type !== "image") return element;
        return {
          ...element,
          assetId: imageAssetKey(runId, element.contentHash),
        };
      }),
    })),
  };
}

function uploadBasename(name: string): string {
  const trimmed = name.trim();
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}
