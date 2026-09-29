/**
 * Image storage keys, with no Node imports.
 * The browser uses this to build asset URLs. Disk access stays in `storage.ts`.
 */

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_HASH = /^[0-9a-f]{64}$/;

/** True when `value` is an unguessable run id, and nothing else. */
export function isRunId(value: string): boolean {
  return RUN_ID.test(value);
}

/**
 * Storage key for one image. The run id is unguessable.
 * The object name is the content hash, so identical bytes in a run share one file.
 */
export function imageAssetKey(runId: string, contentHash: string): string {
  parseImageKey(`${runId}/${contentHash}`);
  return `${runId}/${contentHash}`;
}

/** A storage key is `<runId>/<sha256>`. Anything else is rejected. */
export function parseImageKey(key: string): { runId: string; contentHash: string } {
  const slash = key.indexOf("/");
  const runId = slash === -1 ? "" : key.slice(0, slash);
  const contentHash = slash === -1 ? "" : key.slice(slash + 1);
  if (
    slash === -1 ||
    key.indexOf("/", slash + 1) !== -1 ||
    !RUN_ID.test(runId) ||
    !CONTENT_HASH.test(contentHash)
  ) {
    throw new StorageError(
      "Storage key must be an unguessable run id and a content hash.",
    );
  }
  return { runId, contentHash };
}
