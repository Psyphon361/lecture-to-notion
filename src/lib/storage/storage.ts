export interface StoredAsset {
  key: string;
  contentType: string;
  byteLength: number;
}

/**
 * Binary assets for one run (the PPTX and extracted images).
 * Phase 1 has no implementation. Local disk and Vercel Blob will share this.
 */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredAsset>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
