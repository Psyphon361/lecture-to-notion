import { parseImageKey } from "@/lib/storage/image-key";

/**
 * Browser path for one stored image.
 * Returns null when the id is not a run id plus a content hash.
 */
export function storedAssetSrc(assetId: string): string | null {
  try {
    const { runId, contentHash } = parseImageKey(assetId);
    return `/api/assets/${runId}/${contentHash}`;
  } catch {
    return null;
  }
}
