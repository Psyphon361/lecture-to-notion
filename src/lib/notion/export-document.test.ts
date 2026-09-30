import { describe, expect, it } from "vitest";

import type { NoteDocument } from "@/lib/documents/schema";
import { ARRAY_LIMIT } from "@/lib/notion/adapter";
import { exportNoteDocument, normalizeParentPageId } from "@/lib/notion/export-document";
import type { Storage, StoredAsset } from "@/lib/storage/storage";

const token = "secret-token";
const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assetId = `${parentPageId}/${"ab".repeat(32)}`;

describe("exportNoteDocument", () => {
  it("returns a message and does not call Notion when a setting is missing", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("Notion should not be called");
    };
    const missingToken = await exportNoteDocument({
      document: paragraphDocument("Notes"),
      token: "  ",
      parentPageId,
      storage: memoryStorage({}),
      fetch: fetchImpl,
    });
    const missingParent = await exportNoteDocument({
      document: paragraphDocument("Notes"),
      token,
      parentPageId: "",
      storage: memoryStorage({}),
      fetch: fetchImpl,
    });

    expect(missingToken).toMatchObject({ ok: false, status: 400 });
    expect(missingParent).toMatchObject({
      ok: false,
      status: 400,
      message: expect.stringContaining("NOTION_PARENT_PAGE_ID"),
    });
    expect(calls).toBe(0);
  });

  it("creates the page with the first 100 blocks and appends the rest", async () => {
    const calls = installFetch();
    const document = paragraphDocument("Lecture", ARRAY_LIMIT + 1);
    const outcome = await exportNoteDocument({
      document,
      token,
      parentPageId,
      storage: memoryStorage({}),
      fetch: calls.fetch,
    });

    expect(outcome).toEqual({ ok: true, pageUrl: "https://www.notion.so/Lecture" });
    expect(calls.requests.map((request) => request.path)).toEqual(["/v1/pages", `/v1/blocks/page-1/children`]);
    expect(calls.requests[0]?.headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(calls.requests[0]?.headers.get("notion-version")).toBe("2026-03-11");
    const created = calls.requests[0]?.json as { children: unknown[]; properties: { title: { title: { text: { content: string } }[] } } };
    expect(created.children).toHaveLength(ARRAY_LIMIT);
    expect(created.properties.title.title[0]?.text.content).toBe("Lecture");
    const appended = calls.requests[1]?.json as { children: unknown[] };
    expect(appended.children).toHaveLength(1);
  });

  it("uploads a stored image and attaches it before creating the page", async () => {
    const calls = installFetch();
    const outcome = await exportNoteDocument({
      document: {
        title: "Diagram",
        sections: [
          {
            heading: "Slide 1",
            level: 1,
            blocks: [
              { type: "paragraph", content: "Seen on the slide.", provenance: "source" },
              { type: "image", assetId, caption: "Figure", provenance: "source" },
            ],
          },
        ],
      },
      token,
      parentPageId: `https://www.notion.so/Notes-${parentPageId.replaceAll("-", "")}`,
      storage: memoryStorage({
        [assetId]: { bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" },
      }),
      fetch: calls.fetch,
    });

    expect(outcome).toEqual({ ok: true, pageUrl: "https://www.notion.so/Lecture" });
    expect(calls.requests.map((request) => request.path)).toEqual([
      "/v1/file_uploads",
      "/v1/file_uploads/upload-1/send",
      "/v1/pages",
    ]);
    expect(calls.requests[2]?.json).toMatchObject({
      parent: { page_id: parentPageId },
      children: [
        { type: "heading_1" },
        { type: "paragraph" },
        { type: "image", image: { type: "file_upload", file_upload: { id: "upload-1" } } },
      ],
    });
    expect(calls.requests[1]?.form).toBe(true);
  });

  it("stops on a rejected chunk and does not return a page URL", async () => {
    const calls = installFetch({ appendStatus: 400, appendMessage: `nope ${token}` });
    const outcome = await exportNoteDocument({
      document: paragraphDocument("Lecture", ARRAY_LIMIT + 1),
      token,
      parentPageId,
      storage: memoryStorage({}),
      fetch: calls.fetch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("[redacted]");
    expect(outcome.message).not.toContain(token);
    expect(calls.requests.map((request) => request.path)).toEqual(["/v1/pages", `/v1/blocks/page-1/children`]);
  });

  it("does not create a page when a kept image is missing", async () => {
    const calls = installFetch();
    const outcome = await exportNoteDocument({
      document: {
        title: "Diagram",
        sections: [{ blocks: [{ type: "image", assetId, provenance: "source" }] }],
      },
      token,
      parentPageId,
      storage: memoryStorage({}),
      fetch: calls.fetch,
    });

    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(calls.requests).toHaveLength(0);
  });
});

describe("normalizeParentPageId", () => {
  it("accepts a dashed id and a Notion URL", () => {
    expect(normalizeParentPageId(parentPageId)).toBe(parentPageId);
    expect(normalizeParentPageId(`https://www.notion.so/workspace/Notes-${parentPageId.replaceAll("-", "")}`)).toBe(
      parentPageId,
    );
    expect(normalizeParentPageId("not-a-page")).toBeNull();
  });
});

function paragraphDocument(title: string, count = 1): NoteDocument {
  return {
    title,
    sections: [
      {
        blocks: Array.from({ length: count }, (_, index) => ({
          type: "paragraph" as const,
          content: `Paragraph ${index}`,
          provenance: "source" as const,
        })),
      },
    ],
  };
}

function installFetch(options?: { appendStatus?: number; appendMessage?: string }) {
  const requests: { path: string; headers: Headers; json?: unknown; form: boolean }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const form = init?.body instanceof FormData;
    const json = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path: url.pathname, headers, json, form });
    if (url.pathname === "/v1/file_uploads") {
      return jsonResponse({ id: "upload-1", status: "pending" });
    }
    if (url.pathname.endsWith("/send")) {
      return jsonResponse({ id: "upload-1", status: "uploaded" });
    }
    if (url.pathname === "/v1/pages") {
      return jsonResponse({ id: "page-1", url: "https://www.notion.so/Lecture" });
    }
    if (url.pathname.endsWith("/children")) {
      if (options?.appendStatus) {
        return jsonResponse({ message: options.appendMessage ?? "rejected" }, options.appendStatus);
      }
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ message: "unexpected" }, 500);
  };
  return { fetch: fetchImpl, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function memoryStorage(files: Record<string, { bytes: Uint8Array; contentType: string }>): Storage {
  return {
    async put(): Promise<StoredAsset> {
      throw new Error("unused");
    },
    async get(key) {
      return files[key]?.bytes ?? null;
    },
    async stat(key) {
      const file = files[key];
      if (!file) return null;
      return { key, contentType: file.contentType, byteLength: file.bytes.byteLength };
    },
    async delete() {},
  };
}
