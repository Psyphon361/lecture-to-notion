import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_ASSET_TTL_MS,
  StorageError,
  createLocalStorage,
  createRunId,
  defaultStorageRoot,
  imageAssetKey,
  purgeExpiredRuns,
  sha256Hex,
} from "@/lib/storage/storage";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("local storage", () => {
  it("writes image bytes under an unguessable run id and the content hash", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const runId = createRunId();
    const hash = sha256Hex(bytes);
    const key = imageAssetKey(runId, hash);

    const stored = await storage.put(key, bytes, " image/png ");

    expect(runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(createRunId()).not.toBe(runId);
    expect(key).toBe(`${runId}/${hash}`);
    expect(stored).toEqual({
      key,
      contentType: "image/png",
      byteLength: bytes.byteLength,
    });
    expect(await storage.get(key)).toEqual(bytes);
    expect(await storage.stat(key)).toEqual({
      key,
      contentType: "image/png",
      byteLength: bytes.byteLength,
    });

    const file = path.join(root, "runs", runId, hash);
    expect(new Uint8Array(await readFile(file))).toEqual(bytes);
    const meta = JSON.parse(
      await readFile(path.join(root, "runs", runId, `${hash}.meta.json`), "utf8"),
    );
    expect(meta).toMatchObject({
      contentType: "image/png",
      byteLength: bytes.byteLength,
    });
    expect(meta.storedAt).toEqual(expect.any(String));
  });

  it("dedupes one image in a run and keeps the other image when one is deleted", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([9, 8, 7]);
    const runId = createRunId();
    const hash = sha256Hex(bytes);
    const key = imageAssetKey(runId, hash);

    await storage.put(key, bytes, "image/png");
    await storage.put(key, bytes, "image/png");

    const afterDuplicate = await readdir(path.join(root, "runs", runId));
    expect(afterDuplicate.filter((name) => !name.endsWith(".meta.json"))).toEqual([
      hash,
    ]);

    const other = new Uint8Array([1, 1, 1]);
    const otherKey = imageAssetKey(runId, sha256Hex(other));
    await storage.put(otherKey, other, "image/png");
    await storage.delete(key);

    const names = await readdir(path.join(root, "runs", runId));
    expect(names.filter((name) => !name.endsWith(".meta.json"))).toEqual([
      sha256Hex(other),
    ]);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.get(otherKey)).toEqual(other);
  });

  it("stores the same hash in each run separately", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([4, 5, 6]);
    const hash = sha256Hex(bytes);
    const first = imageAssetKey(createRunId(), hash);
    const second = imageAssetKey(createRunId(), hash);

    await storage.put(first, bytes, "image/jpeg");
    await storage.put(second, bytes, "image/jpeg");
    await storage.delete(first);

    expect(await storage.get(first)).toBeNull();
    expect(await storage.get(second)).toEqual(bytes);
    expect(await storage.stat(second)).toMatchObject({ contentType: "image/jpeg" });
  });

  it("returns null for a missing image and ignores a second delete", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([1]);
    const runId = createRunId();
    const key = imageAssetKey(runId, sha256Hex(bytes));

    expect(await storage.get(key)).toBeNull();
    expect(await storage.stat(key)).toBeNull();

    await storage.put(key, bytes, "image/gif");
    await storage.delete(key);
    await storage.delete(key);

    expect(await storage.get(key)).toBeNull();
    await expect(readdir(path.join(root, "runs", runId))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects keys that escape the run directory and keys that are not a content hash", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([1, 2]);
    const runId = createRunId();
    const hash = sha256Hex(bytes);
    const badKeys = [
      "../secret",
      `${runId}/../${hash}`,
      `${runId}/${hash}/extra`,
      `${runId}\\${hash}`,
      "",
      runId,
      `${runId}/not-a-hash`,
      `not-a-uuid/${hash}`,
      `${runId.toUpperCase()}/${hash}`,
      `${runId}/${hash.toUpperCase()}`,
    ];

    for (const key of badKeys) {
      await expect(storage.put(key, bytes, "image/png")).rejects.toBeInstanceOf(
        StorageError,
      );
    }
    await expect(storage.get("../secret")).rejects.toBeInstanceOf(StorageError);
    await expect(
      storage.put(imageAssetKey(runId, hash), bytes, "  "),
    ).rejects.toBeInstanceOf(StorageError);
    await expect(readdir(path.join(root, "runs"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(imageAssetKey(runId, hash)).toBe(`${runId}/${hash}`);
    expect(() => imageAssetKey(runId, "nope")).toThrow(StorageError);
  });

  it("rejects a key whose hash does not match the bytes", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const key = imageAssetKey(createRunId(), sha256Hex(new Uint8Array([1])));

    await expect(
      storage.put(key, new Uint8Array([2]), "image/png"),
    ).rejects.toThrow(/content hash/);
    await expect(readdir(path.join(root, "runs"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("drops expired run directories and leaves other names alone", async () => {
    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const bytes = new Uint8Array([3, 3, 3]);
    const runId = createRunId();
    const hash = sha256Hex(bytes);
    const key = imageAssetKey(runId, hash);
    await storage.put(key, bytes, "image/png");

    const stray = path.join(root, "runs", "notes");
    await mkdir(stray, { recursive: true });
    await writeFile(path.join(stray, "keep.txt"), "keep");

    expect(await purgeExpiredRuns(root, LOCAL_ASSET_TTL_MS)).toBe(0);
    expect(await storage.get(key)).toEqual(bytes);

    expect(await purgeExpiredRuns(root, 0, Date.now() + 60_000)).toBe(1);
    expect(await storage.get(key)).toBeNull();
    expect(await readFile(path.join(stray, "keep.txt"), "utf8")).toBe("keep");
    expect(await purgeExpiredRuns(path.join(root, "missing"))).toBe(0);
  });

  it("uses .data under the project directory as the default root", () => {
    expect(defaultStorageRoot()).toBe(path.join(process.cwd(), ".data"));
  });
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lecture-storage-"));
  directories.push(dir);
  return dir;
}
