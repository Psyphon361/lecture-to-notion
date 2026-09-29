import { analyzeImageSet } from "@/lib/ai/analyze-images";
import {
  analyzeFailureSchema,
  analyzeImagesRequestSchema,
  analyzeSuccessSchema,
} from "@/lib/ai/analyze-response";
import { analyzeErrorResponse, analyzeImageWithGemini } from "@/lib/ai/gemini";
import type { ImageInput } from "@/lib/ai/provider";
import type { ImageAnalysis } from "@/lib/ai/schema";
import { createLocalStorage, imageAssetKey, type Storage } from "@/lib/storage/storage";

export const runtime = "nodejs";

type AnalyzeFn = (input: ImageInput) => Promise<{ analysis: ImageAnalysis }>;

export async function POST(request: Request): Promise<Response> {
  return handleAnalyzeImages(request, createLocalStorage(), analyzeImageWithGemini);
}

export async function handleAnalyzeImages(
  request: Request,
  storage: Storage,
  analyze: AnalyzeFn,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure(400, "The image analysis request could not be read.");
  }

  const parsed = analyzeImagesRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(400, "The image analysis request could not be read.");
  }

  for (const image of parsed.data.images) {
    let expected: string;
    try {
      expected = imageAssetKey(parsed.data.runId, image.contentHash);
    } catch {
      return failure(400, "That image does not belong to this run.");
    }
    if (image.assetId !== expected) {
      return failure(400, "That image does not belong to this run.");
    }
  }

  try {
    const outcomes = await analyzeImageSet(parsed.data.images, {
      readAsset: (assetId) => readStoredImage(storage, assetId),
      analyze,
    });
    return Response.json(analyzeSuccessSchema.parse({ ok: true, outcomes }));
  } catch (error) {
    const mapped = analyzeErrorResponse(error);
    console.info(`image-analysis outcome=request-error status=${mapped.status}`);
    return failure(mapped.status, mapped.message);
  }
}

async function readStoredImage(
  storage: Storage,
  assetId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const [bytes, info] = await Promise.all([storage.get(assetId), storage.stat(assetId)]);
  if (!bytes || !info || !info.contentType.startsWith("image/")) return null;
  return { bytes, mimeType: info.contentType };
}

function failure(status: number, message: string): Response {
  return Response.json(analyzeFailureSchema.parse({ ok: false, message }), { status });
}
