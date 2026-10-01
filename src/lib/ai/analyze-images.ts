import type { AnalyzeCandidate, ImageOutcome } from "@/lib/ai/analyze-response";
import { GeminiCallError, ImageAnalysisInvalidError } from "@/lib/ai/gemini";
import type { ImageInput } from "@/lib/ai/provider";
import { imageAnalysisSchema, type ImageAnalysis } from "@/lib/ai/schema";
import { triageImages } from "@/lib/ai/triage";

export const ANALYZE_CONCURRENCY = 2;

export type AnalyzeImageSetResult = {
  outcomes: ImageOutcome[];
  rateLimited?: boolean;
};

const UNREADABLE = "The stored image could not be read.";
const INVALID = "The model response did not match the expected shape.";

export interface StoredImageBytes {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Skip decorative images, then call the model once per remaining content hash.
 * A hash that appears twice is one call. The result is copied onto each image id.
 */
export async function analyzeImageSet(
  images: AnalyzeCandidate[],
  deps: {
    readAsset: (assetId: string) => Promise<StoredImageBytes | null>;
    analyze: (input: ImageInput) => Promise<{ analysis: ImageAnalysis }>;
    concurrency?: number;
  },
): Promise<AnalyzeImageSetResult> {
  const skipped = triageImages(images);
  const pendingHashes: string[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    if (skipped.has(image.imageId) || seen.has(image.contentHash)) continue;
    seen.add(image.contentHash);
    pendingHashes.push(image.contentHash);
  }

  const analyses = new Map<string, ImageOutcome & { status: "analyzed" }>();
  const failures = new Map<string, string>();
  const processedHashes = new Set<string>();

  const { rateLimited } = await runPool(
    pendingHashes,
    deps.concurrency ?? ANALYZE_CONCURRENCY,
    async (contentHash) => {
      const sample = images.find(
        (image) => image.contentHash === contentHash && !skipped.has(image.imageId),
      );
      if (!sample) return;
      const asset = await deps.readAsset(sample.assetId);
      if (!asset) {
        failures.set(contentHash, UNREADABLE);
        processedHashes.add(contentHash);
        return;
      }
      try {
        const result = await deps.analyze({
          imageId: sample.imageId,
          mimeType: asset.mimeType,
          bytes: asset.bytes,
          ...(sample.altText ? { altText: sample.altText } : {}),
        });
        const analysis = imageAnalysisSchema.parse({ ...result.analysis, imageId: sample.imageId });
        analyses.set(contentHash, { imageId: sample.imageId, status: "analyzed", analysis });
        processedHashes.add(contentHash);
      } catch (error) {
        if (error instanceof ImageAnalysisInvalidError) {
          failures.set(contentHash, INVALID);
          processedHashes.add(contentHash);
          return;
        }
        throw error;
      }
    },
  );

  const outcomes = buildOutcomes(images, skipped, analyses, failures, rateLimited ? processedHashes : null);
  return rateLimited ? { outcomes, rateLimited: true } : { outcomes };
}

function buildOutcomes(
  images: AnalyzeCandidate[],
  skipped: Map<string, string>,
  analyses: Map<string, ImageOutcome & { status: "analyzed" }>,
  failures: Map<string, string>,
  processedHashes: Set<string> | null,
): ImageOutcome[] {
  return images.flatMap((image) => {
    const reason = skipped.get(image.imageId);
    if (reason) return [{ imageId: image.imageId, status: "skipped" as const, reason }];
    if (processedHashes && !processedHashes.has(image.contentHash)) return [];
    const warning = failures.get(image.contentHash);
    if (warning) return [{ imageId: image.imageId, status: "unanalyzed" as const, warning }];
    const cached = analyses.get(image.contentHash);
    if (!cached) {
      return [{ imageId: image.imageId, status: "unanalyzed" as const, warning: UNREADABLE }];
    }
    const analysis = imageAnalysisSchema.parse({ ...cached.analysis, imageId: image.imageId });
    return [{ imageId: image.imageId, status: "analyzed" as const, analysis }];
  });
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ rateLimited: boolean }> {
  if (items.length === 0) return { rateLimited: false };
  let index = 0;
  let fatal: unknown;
  let rateLimited = false;
  let stop = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!stop && fatal === undefined) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        await worker(items[current] as T);
      } catch (error) {
        if (error instanceof GeminiCallError && error.status === 429) {
          rateLimited = true;
          stop = true;
          return;
        }
        fatal = error;
      }
    }
  });
  await Promise.all(workers);
  if (fatal !== undefined) throw fatal;
  return { rateLimited };
}
