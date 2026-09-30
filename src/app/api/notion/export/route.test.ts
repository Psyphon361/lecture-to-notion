import { describe, expect, it } from "vitest";

import { handleNotionExport, POST } from "@/app/api/notion/export/route";
import type { Storage, StoredAsset } from "@/lib/storage/storage";

describe("POST /api/notion/export", () => {
  it("rejects a body that is not a note document", async () => {
    const response = await handleNotionExport(jsonRequest({ title: "nope" }), {
      token: "secret-token",
      parentPageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      storage: unusedStorage(),
      fetch: async () => {
        throw new Error("Notion should not be called");
      },
    });
    const payload = (await response.json()) as { ok: boolean; pageUrl?: string; message: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.pageUrl).toBeUndefined();
  });

  it("reports a missing parent id and does not invent a URL", async () => {
    const previousToken = process.env.NOTION_TOKEN;
    const previousParent = process.env.NOTION_PARENT_PAGE_ID;
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_PARENT_PAGE_ID;
    try {
      const response = await POST(
        jsonRequest({
          document: { title: "Notes", sections: [{ blocks: [] }] },
        }),
      );
      const payload = (await response.json()) as { ok: boolean; pageUrl?: string; message: string };
      expect(response.status).toBe(400);
      expect(payload.ok).toBe(false);
      expect(payload.pageUrl).toBeUndefined();
      expect(payload.message).toContain("NOTION_TOKEN");
    } finally {
      restoreEnv("NOTION_TOKEN", previousToken);
      restoreEnv("NOTION_PARENT_PAGE_ID", previousParent);
    }
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/notion/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnv(name: "NOTION_TOKEN" | "NOTION_PARENT_PAGE_ID", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function unusedStorage(): Storage {
  return {
    async put(): Promise<StoredAsset> {
      throw new Error("unused");
    },
    async get() {
      return null;
    },
    async stat() {
      return null;
    },
    async delete() {},
  };
}
