import { storedAssetSrc } from "@/lib/storage/asset-url";

/** Picture already stored for this run. Bytes stay on disk; the browser loads the asset route. */
export function StoredImage({ assetId, alt }: { assetId: string; alt: string }) {
  const src = storedAssetSrc(assetId);
  if (!src) return null;
  return (
    // These are per-run uploads, not static files next/image can optimize.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="max-h-80 max-w-full rounded-md object-contain" />
  );
}
