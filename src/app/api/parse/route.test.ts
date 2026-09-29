import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/parse/route";
import { parseSuccessSchema } from "@/lib/ppt/parse-response";

describe("POST /api/parse", () => {
  it("returns the synthetic presentation and no image bytes", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(process.cwd(), "fixtures/synthetic.pptx")));
    const response = await POST(pptxRequest(bytes, "synthetic.pptx"));
    const payload: unknown = await response.json();
    const parsed = parseSuccessSchema.safeParse(payload);
    const runId = parsed.success ? parsed.data.runId : undefined;
    try {
      expect(response.status).toBe(200);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.presentation.slides).toHaveLength(2);
      expect(parsed.data.warnings).toEqual([]);
      expect(JSON.stringify(parsed.data)).not.toContain("iVBORw0KGgo");
    } finally {
      if (runId) {
        await rm(path.join(process.cwd(), ".data", "runs", runId), {
          recursive: true,
          force: true,
        });
      }
    }
  });

  it("rejects a malformed package without throwing", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a presentation");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const response = await POST(pptxRequest(bytes, "broken.pptx"));
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.message).toMatch(/could not be read/);
  });

  it("rejects a missing file", async () => {
    const response = await POST(
      new Request("http://localhost/api/parse", { method: "POST", body: new FormData() }),
    );
    const payload = (await response.json()) as { reason: string };
    expect(response.status).toBe(400);
    expect(payload.reason).toBe("missing");
  });
});

function pptxRequest(bytes: Uint8Array, filename: string): Request {
  const file = new File([copyBytes(bytes)], filename, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const body = new FormData();
  body.set("file", file);
  return new Request("http://localhost/api/parse", { method: "POST", body });
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
