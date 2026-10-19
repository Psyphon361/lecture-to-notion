import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    put: vi.fn(),
    get: vi.fn(),
    head: vi.fn(),
    del: vi.fn(),
    list: vi.fn(),
  };
});

vi.mock("@vercel/blob", () => blob);

import {
  createBlobStorage,
  isUploadPathname,
  purgeExpiredBlobs,
  readUploadedDeck,
} from "@/lib/storage/blob-storage";
import { isBlobConfigured } from "@/lib/storage/default-storage";
import { sha256Hex } from "@/lib/storage/storage";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bytes = new Uint8Array([1, 2, 3]);
const key = `${runId}/${sha256Hex(bytes)}`;

function streamOf(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createBlobStorage", () => {
  it("writes a private blob under runs/<runId>/<hash>", async () => {
    blob.put.mockResolvedValue({});
    const stored = await createBlobStorage().put(key, bytes, "image/png");

    expect(stored).toEqual({ key, contentType: "image/png", byteLength: 3 });
    expect(blob.put).toHaveBeenCalledWith(
      `runs/${key}`,
      expect.anything(),
      expect.objectContaining({ access: "private", contentType: "image/png", allowOverwrite: true }),
    );
  });

  it("reads bytes back and reports metadata", async () => {
    blob.get.mockResolvedValue({ statusCode: 200, stream: streamOf(bytes) });
    blob.head.mockResolvedValue({ contentType: "image/png", size: 3 });
    const storage = createBlobStorage();

    expect(await storage.get(key)).toEqual(bytes);
    expect(await storage.stat(key)).toEqual({ key, contentType: "image/png", byteLength: 3 });
    expect(blob.get).toHaveBeenCalledWith(`runs/${key}`, { access: "private" });
  });

  it("returns null for a missing image", async () => {
    blob.get.mockRejectedValue(new blob.BlobNotFoundError());
    blob.head.mockRejectedValue(new blob.BlobNotFoundError());
    const storage = createBlobStorage();

    expect(await storage.get(key)).toBeNull();
    expect(await storage.stat(key)).toBeNull();
  });

  it("rejects a key that is not a run id plus a hash", async () => {
    await expect(createBlobStorage().get("../etc/passwd")).rejects.toThrow();
  });
});

describe("uploaded decks", () => {
  it("accepts only uploads/<uuid>/<name>.pptx", () => {
    expect(isUploadPathname(`uploads/${runId}/lecture.pptx`)).toBe(true);
    expect(isUploadPathname(`uploads/${runId}/a/b.pptx`)).toBe(false);
    expect(isUploadPathname(`runs/${runId}/lecture.pptx`)).toBe(false);
    expect(isUploadPathname(`uploads/not-a-uuid/lecture.pptx`)).toBe(false);
    expect(isUploadPathname(`uploads/${runId}/lecture.pdf`)).toBe(false);
  });

  it("refuses a missing, foreign, or oversized deck", async () => {
    expect(await readUploadedDeck("runs/x", 10)).toBeNull();
    expect(blob.get).not.toHaveBeenCalled();

    blob.get.mockResolvedValue({ statusCode: 200, blob: { size: 99 }, stream: streamOf(bytes) });
    expect(await readUploadedDeck(`uploads/${runId}/a.pptx`, 10)).toBeNull();

    blob.get.mockRejectedValue(new blob.BlobNotFoundError());
    expect(await readUploadedDeck(`uploads/${runId}/a.pptx`, 10)).toBeNull();
  });

  it("reads a deck within the cap", async () => {
    blob.get.mockResolvedValue({ statusCode: 200, blob: { size: 3 }, stream: streamOf(bytes) });
    expect(await readUploadedDeck(`uploads/${runId}/a.pptx`, 10)).toEqual(bytes);
  });
});

describe("purgeExpiredBlobs", () => {
  it("deletes only blobs older than the TTL, across both prefixes", async () => {
    const now = Date.now();
    blob.list.mockImplementation(async ({ prefix }: { prefix: string }) => ({
      blobs: [
        { pathname: `${prefix}old`, uploadedAt: new Date(now - 48 * 3600_000) },
        { pathname: `${prefix}new`, uploadedAt: new Date(now - 1000) },
      ],
      hasMore: false,
    }));
    blob.del.mockResolvedValue(undefined);

    const removed = await purgeExpiredBlobs(24 * 3600_000, now);

    expect(removed).toBe(2);
    expect(blob.del).toHaveBeenCalledWith(["runs/old"]);
    expect(blob.del).toHaveBeenCalledWith(["uploads/old"]);
  });
});

describe("isBlobConfigured", () => {
  it("is true with a token or an OIDC store id, false otherwise", () => {
    expect(isBlobConfigured({})).toBe(false);
    expect(isBlobConfigured({ BLOB_READ_WRITE_TOKEN: " " })).toBe(false);
    expect(isBlobConfigured({ BLOB_READ_WRITE_TOKEN: "t" })).toBe(true);
    expect(isBlobConfigured({ BLOB_STORE_ID: "store_1" })).toBe(true);
  });
});
