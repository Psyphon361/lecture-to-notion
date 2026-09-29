import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
  stat as statFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { isRunId, parseImageKey, StorageError } from "@/lib/storage/image-key";

export { imageAssetKey, parseImageKey, StorageError } from "@/lib/storage/image-key";

export interface StoredAsset {
  key: string;
  contentType: string;
  byteLength: number;
}

/**
 * Binary assets for one run (the PPTX and extracted images).
 * Local disk and Vercel Blob share this contract.
 * An image key is `<runId>/<sha256>` from `imageAssetKey`.
 */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredAsset>;
  get(key: string): Promise<Uint8Array | null>;
  stat(key: string): Promise<StoredAsset | null>;
  delete(key: string): Promise<void>;
}

/** Local run directories older than this are eligible for `purgeExpiredRuns`. */
export const LOCAL_ASSET_TTL_MS = 24 * 60 * 60 * 1000;

interface AssetMeta {
  contentType: string;
  byteLength: number;
  storedAt: string;
}

interface LocatedAsset {
  dir: string;
  file: string;
  meta: string;
}

/**
 * Unguessable run id. Image files live under `.data/runs/<runId>/`.
 * This is separate from a presentation id until a route decides they match.
 */
export function createRunId(): string {
  return randomUUID();
}

/** Lowercase sha256 hex. Image file names and the second key segment use this. */
export function sha256Hex(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Project-local root. Already listed in `.gitignore`. */
export function defaultStorageRoot(): string {
  return path.join(process.cwd(), ".data");
}

/**
 * Files under `<root>/runs/<runId>/<sha256>`, plus a `<sha256>.meta.json` sidecar.
 * `root` defaults to `.data` in the project directory.
 */
export function createLocalStorage(rootDir = defaultStorageRoot()): Storage {
  const root = path.resolve(rootDir);

  return {
    async put(key, body, contentType) {
      const located = locate(root, key);
      const type = normalizeContentType(contentType);
      const bytes = new Uint8Array(body);
      if (sha256Hex(bytes) !== contentHashFromKey(key)) {
        throw new StorageError("Storage key does not match the image content hash.");
      }

      const meta: AssetMeta = {
        contentType: type,
        byteLength: bytes.byteLength,
        storedAt: new Date().toISOString(),
      };
      await mkdir(located.dir, { recursive: true });
      await writeFile(located.file, bytes);
      try {
        await writeFile(located.meta, `${JSON.stringify(meta)}\n`, "utf8");
      } catch (error) {
        await rm(located.file, { force: true });
        throw error;
      }

      return { key, contentType: type, byteLength: bytes.byteLength };
    },

    async get(key) {
      const located = locate(root, key);
      try {
        return new Uint8Array(await readFile(located.file));
      } catch (error) {
        if (isCode(error, "ENOENT")) return null;
        throw error;
      }
    },

    async stat(key) {
      const located = locate(root, key);
      let info;
      try {
        info = await statFile(located.file);
      } catch (error) {
        if (isCode(error, "ENOENT")) return null;
        throw error;
      }
      if (!info.isFile()) return null;

      let raw: string;
      try {
        raw = await readFile(located.meta, "utf8");
      } catch (error) {
        if (isCode(error, "ENOENT")) return null;
        throw error;
      }
      const record = readMeta(raw);
      return {
        key,
        contentType: record.contentType,
        byteLength: info.size,
      };
    },

    async delete(key) {
      const located = locate(root, key);
      await rm(located.file, { force: true });
      await rm(located.meta, { force: true });
      await removeDirIfEmpty(located.dir);
    },
  };
}

/**
 * Delete run directories last written at least `maxAgeMs` ago.
 * Names that are not run ids are left in place. A missing root removes nothing.
 */
export async function purgeExpiredRuns(
  rootDir = defaultStorageRoot(),
  maxAgeMs = LOCAL_ASSET_TTL_MS,
  now = Date.now(),
): Promise<number> {
  const runsDir = path.join(path.resolve(rootDir), "runs");
  let names: string[];
  try {
    names = await readdir(runsDir);
  } catch (error) {
    if (isCode(error, "ENOENT")) return 0;
    throw error;
  }

  let removed = 0;
  for (const name of names) {
    if (!isRunId(name)) continue;
    const dir = path.join(runsDir, name);
    let info;
    try {
      info = await statFile(dir);
    } catch (error) {
      if (isCode(error, "ENOENT")) continue;
      throw error;
    }
    if (!info.isDirectory()) continue;
    if (now - info.mtimeMs < maxAgeMs) continue;
    await rm(dir, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function contentHashFromKey(key: string): string {
  return parseImageKey(key).contentHash;
}

function locate(root: string, key: string): LocatedAsset {
  const { runId, contentHash } = parseImageKey(key);
  const dir = path.join(root, "runs", runId);
  const file = path.join(dir, contentHash);
  const meta = path.join(dir, `${contentHash}.meta.json`);
  assertInside(path.join(root, "runs"), file);
  assertInside(path.join(root, "runs"), meta);
  return { dir, file, meta };
}

function assertInside(parent: string, child: string): void {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StorageError("Storage key must stay inside the run directory.");
  }
}

function normalizeContentType(contentType: string): string {
  const value = contentType.trim();
  if (value.length === 0 || value.length > 255 || /[\u0000-\u001f\\]/.test(value)) {
    throw new StorageError("A content type is required.");
  }
  return value;
}

function readMeta(raw: string): AssetMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageError("Stored image metadata could not be read.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("contentType" in parsed) ||
    typeof parsed.contentType !== "string" ||
    !("byteLength" in parsed) ||
    typeof parsed.byteLength !== "number" ||
    !("storedAt" in parsed) ||
    typeof parsed.storedAt !== "string"
  ) {
    throw new StorageError("Stored image metadata could not be read.");
  }
  return {
    contentType: normalizeContentType(parsed.contentType),
    byteLength: parsed.byteLength,
    storedAt: parsed.storedAt,
  };
}

async function removeDirIfEmpty(dir: string): Promise<void> {
  try {
    await rmdir(dir);
  } catch (error) {
    if (isCode(error, "ENOENT") || isCode(error, "ENOTEMPTY")) return;
    throw error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
