import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";

import { isRunId, parseImageKey, StorageError } from "@/lib/storage/image-key";
import type { Storage } from "@/lib/storage/storage";

/**
 * Vercel Blob backing for `Storage`. Used on Vercel, where `/tmp` is per-instance
 * and cannot carry images from the parse request to the analyze, asset, and export requests.
 * The store is private: every read goes through the SDK, which authenticates.
 *
 * Layout: images at `runs/<runId>/<sha256>`, uploaded decks at `uploads/<uuid>/<name>.pptx`.
 */

export const IMAGE_PREFIX = "runs/";
export const UPLOAD_PREFIX = "uploads/";

const UPLOAD_PATHNAME = /^uploads\/([0-9a-f-]{36})\/[A-Za-z0-9._-]{1,200}\.pptx$/i;

/** True for a deck pathname the browser may upload to and parse from. */
export function isUploadPathname(pathname: string): boolean {
  const match = UPLOAD_PATHNAME.exec(pathname);
  return match !== null && isRunId(match[1]!.toLowerCase());
}

function imagePathname(key: string): string {
  const { runId, contentHash } = parseImageKey(key);
  return `${IMAGE_PREFIX}${runId}/${contentHash}`;
}

export function createBlobStorage(): Storage {
  return {
    async put(key, body, contentType) {
      const bytes = new Uint8Array(body);
      const pathname = imagePathname(key);
      const type = contentType.trim();
      if (type.length === 0 || type.length > 255) {
        throw new StorageError("A content type is required.");
      }
      await put(pathname, Buffer.from(bytes), {
        access: "private",
        contentType: type,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { key, contentType: type, byteLength: bytes.byteLength };
    },

    async get(key) {
      const result = await get(imagePathname(key), { access: "private" }).catch(
        notFoundToNull,
      );
      if (!result || result.statusCode !== 200) return null;
      return readStream(result.stream);
    },

    async stat(key) {
      try {
        const info = await head(imagePathname(key));
        return { key, contentType: info.contentType, byteLength: info.size };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },

    async delete(key) {
      await del(imagePathname(key));
    },
  };
}

/** Read an uploaded deck. Returns null when it is missing or larger than `maxBytes`. */
export async function readUploadedDeck(
  pathname: string,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!isUploadPathname(pathname)) return null;
  const result = await get(pathname, { access: "private" }).catch(notFoundToNull);
  if (!result || result.statusCode !== 200) return null;
  if (result.blob.size > maxBytes) return null;
  return readStream(result.stream, maxBytes);
}

export async function deleteUploadedDeck(pathname: string): Promise<void> {
  if (!isUploadPathname(pathname)) return;
  await del(pathname);
}

/**
 * Delete blobs older than `maxAgeMs` under both prefixes.
 * Costs one list operation per prefix when nothing is old.
 */
export async function purgeExpiredBlobs(maxAgeMs: number, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const prefix of [IMAGE_PREFIX, UPLOAD_PREFIX]) {
    const stale: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, ...(cursor ? { cursor } : {}) });
      for (const blob of page.blobs) {
        if (now - blob.uploadedAt.getTime() >= maxAgeMs) stale.push(blob.pathname);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (stale.length > 0) {
      await del(stale);
      removed += stale.length;
    }
  }
  return removed;
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new StorageError("The stored file is larger than allowed.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function notFoundToNull(error: unknown): null {
  if (error instanceof BlobNotFoundError) return null;
  throw error;
}
