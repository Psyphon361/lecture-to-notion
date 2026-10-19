import { createBlobStorage, purgeExpiredBlobs } from "@/lib/storage/blob-storage";
import {
  LOCAL_ASSET_TTL_MS,
  createLocalStorage,
  purgeExpiredRuns,
  type Storage,
} from "@/lib/storage/storage";

type StorageEnv = Record<string, string | undefined>;

/**
 * Vercel Blob when the project has a store connected, local disk otherwise.
 * `BLOB_READ_WRITE_TOKEN` is the static token; `BLOB_STORE_ID` is set with OIDC.
 */
export function isBlobConfigured(env: StorageEnv = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || env.BLOB_STORE_ID?.trim());
}

export function createStorage(env: StorageEnv = process.env): Storage {
  return isBlobConfigured(env) ? createBlobStorage() : createLocalStorage();
}

/** Remove runs and uploads older than the 24 hour TTL from whichever backend is active. */
export async function purgeExpired(env: StorageEnv = process.env): Promise<number> {
  return isBlobConfigured(env)
    ? purgeExpiredBlobs(LOCAL_ASSET_TTL_MS)
    : purgeExpiredRuns();
}
