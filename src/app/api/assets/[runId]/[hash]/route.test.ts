import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/assets/[runId]/[hash]/route";
import { storedAssetSrc } from "@/lib/storage/asset-url";
import {
  createLocalStorage,
  createRunId,
  defaultStorageRoot,
  imageAssetKey,
  sha256Hex,
} from "@/lib/storage/storage";

const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("GET /api/assets/[runId]/[hash]", () => {
  it("returns a stored png and its content type", async () => {
    const stored = await storePng();
    try {
      const response = await GET(assetRequest(stored.runId, stored.hash), routeContext(stored.runId, stored.hash));
      const body = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(body).toEqual(TINY_PNG);
      expect(storedAssetSrc(stored.key)).toBe(`/api/assets/${stored.runId}/${stored.hash}`);
    } finally {
      await rm(path.join(defaultStorageRoot(), "runs", stored.runId), { recursive: true, force: true });
    }
  });

  it("does not return bytes for a missing file", async () => {
    const runId = createRunId();
    const hash = sha256Hex(TINY_PNG);
    const response = await GET(assetRequest(runId, hash), routeContext(runId, hash));
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain("image/");
    expect(startsWithPng(body)).toBe(false);
    expect(body).not.toEqual(TINY_PNG);
  });

  it("does not return bytes for a key parseImageKey would reject", async () => {
    const stored = await storePng();
    const outside = await mkdtemp(path.join(tmpdir(), "lecture-asset-"));
    directories.push(outside);
    await writeFile(path.join(outside, "secret.png"), TINY_PNG);

    const badParams = [
      { runId: "..", hash: "secret.png" },
      { runId: stored.runId, hash: `../${stored.hash}` },
      { runId: stored.runId, hash: "not-a-hash" },
      { runId: "not-a-uuid", hash: stored.hash },
      { runId: stored.runId.toUpperCase(), hash: stored.hash },
      { runId: stored.runId, hash: stored.hash.toUpperCase() },
      { runId: stored.runId, hash: `${stored.hash}/extra` },
    ];

    try {
      for (const params of badParams) {
        const response = await GET(assetRequest(params.runId, params.hash), routeContext(params.runId, params.hash));
        const body = new Uint8Array(await response.arrayBuffer());
        expect(response.status).toBe(400);
        expect(response.headers.get("content-type")).not.toContain("image/");
        expect(startsWithPng(body)).toBe(false);
        expect(body).not.toEqual(TINY_PNG);
      }
      expect(storedAssetSrc("../secret")).toBeNull();
      expect(storedAssetSrc("fixture-image")).toBeNull();
      expect(storedAssetSrc(`${stored.runId}/../${stored.hash}`)).toBeNull();
    } finally {
      await rm(path.join(defaultStorageRoot(), "runs", stored.runId), { recursive: true, force: true });
    }
  });
});

async function storePng(): Promise<{ runId: string; hash: string; key: string }> {
  const storage = createLocalStorage();
  const runId = createRunId();
  const hash = sha256Hex(TINY_PNG);
  const key = imageAssetKey(runId, hash);
  await storage.put(key, TINY_PNG, "image/png");
  return { runId, hash, key };
}

function assetRequest(runId: string, hash: string): Request {
  return new Request(`http://localhost/api/assets/${runId}/${hash}`);
}

function routeContext(runId: string, hash: string): { params: Promise<{ runId: string; hash: string }> } {
  return { params: Promise.resolve({ runId, hash }) };
}

function startsWithPng(body: Uint8Array): boolean {
  return body.length >= 4 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
}
