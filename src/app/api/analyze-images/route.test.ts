import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleAnalyzeImages } from "@/app/api/analyze-images/route";
import type { AnalyzeCandidate } from "@/lib/ai/analyze-response";
import { GeminiCallError, MissingGeminiKeyError } from "@/lib/ai/gemini";
import type { ImageAnalysis } from "@/lib/ai/schema";
import { createLocalStorage, imageAssetKey, type Storage } from "@/lib/storage/storage";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("POST /api/analyze-images", () => {
  it("returns one analysis per image and does not echo the bytes", async () => {
    const stored = await storeImage(new Uint8Array([7, 7, 7, 7]));
    const calls: Uint8Array[] = [];
    const response = await handleAnalyzeImages(
      jsonRequest([
        candidate(stored, "s5-e1", 5),
        candidate(stored, "s6-e1", 6),
      ]),
      stored.storage,
      async (input) => {
        calls.push(input.bytes);
        return { analysis: analysis(input.imageId) };
      },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      outcomes: { imageId: string; status: string; analysis?: ImageAnalysis }[];
    };

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(Array.from(calls[0] ?? [])).toEqual([7, 7, 7, 7]);
    expect(payload.outcomes.map((outcome) => outcome.imageId)).toEqual(["s5-e1", "s6-e1"]);
    expect(payload.outcomes[1]?.analysis?.imageId).toBe("s6-e1");
    expect(JSON.stringify(payload)).not.toContain("super-secret-gemini-key");
  });

  it("skips a small image without calling the model", async () => {
    const stored = await storeImage(new Uint8Array([1]));
    let calls = 0;
    const response = await handleAnalyzeImages(
      jsonRequest([candidate(stored, "logo", 1, 200, 200)]),
      stored.storage,
      async () => {
        calls += 1;
        return { analysis: analysis("logo") };
      },
    );
    const payload = (await response.json()) as { outcomes: { status: string; reason?: string }[] };
    expect(response.status).toBe(200);
    expect(calls).toBe(0);
    expect(payload.outcomes[0]?.status).toBe("skipped");
    expect(payload.outcomes[0]?.reason).toMatch(/very small/);
  });

  it("rejects an image that does not belong to the run", async () => {
    const stored = await storeImage(new Uint8Array([1]));
    const foreign = candidate(stored, "s5-e1", 5);
    foreign.assetId = imageAssetKey(randomUUID(), stored.contentHash);
    const response = await handleAnalyzeImages(
      jsonRequest([foreign], stored.runId),
      stored.storage,
      async () => ({ analysis: analysis("s5-e1") }),
    );
    expect(response.status).toBe(400);
  });

  it("turns a rate limit and a missing key into a user-facing error", async () => {
    const stored = await storeImage(new Uint8Array([1, 2, 3, 4]));
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    const limited = await handleAnalyzeImages(
      jsonRequest([candidate(stored, "s5-e1", 5)]),
      stored.storage,
      async () => {
        throw new GeminiCallError(429);
      },
    );
    const missing = await handleAnalyzeImages(
      jsonRequest([candidate(stored, "s9-e1", 9)]),
      stored.storage,
      async () => {
        throw new MissingGeminiKeyError();
      },
    );
    const limitedBody = (await limited.json()) as {
      message: string;
      retryAfterMs?: number;
      outcomes?: unknown[];
    };
    const missingBody = (await missing.json()) as { message: string };

    expect(limited.status).toBe(429);
    expect(limitedBody.message).toMatch(/rate limiting/);
    expect(limitedBody.retryAfterMs).toBe(60_000);
    expect(limitedBody.outcomes).toEqual([]);
    expect(missing.status).toBe(500);
    expect(missingBody.message).toMatch(/API key/);
    expect(JSON.stringify({ limitedBody, missingBody, logs })).not.toContain("GEMINI_API_KEY");
  });
});

async function storeImage(bytes: Uint8Array): Promise<{
  storage: Storage;
  runId: string;
  contentHash: string;
  assetId: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "l2n-analyze-"));
  roots.push(root);
  const storage = createLocalStorage(root);
  const runId = randomUUID();
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const assetId = imageAssetKey(runId, contentHash);
  await storage.put(assetId, bytes, "image/png");
  return { storage, runId, contentHash, assetId };
}

function candidate(
  stored: { runId: string; contentHash: string; assetId: string },
  imageId: string,
  slideNumber: number,
  width = 8_000_000,
  height = 5_000_000,
): AnalyzeCandidate {
  return {
    imageId,
    assetId: stored.assetId,
    contentHash: stored.contentHash,
    mimeType: "image/png",
    slideNumber,
    width,
    height,
  };
}

function analysis(imageId: string): ImageAnalysis {
  return {
    imageId,
    containsUsefulInformation: true,
    extractedText: "seen text",
  };
}

function jsonRequest(images: AnalyzeCandidate[], runId = images[0]?.assetId.split("/")[0] ?? randomUUID()): Request {
  return new Request("http://localhost/api/analyze-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, images }),
  });
}
