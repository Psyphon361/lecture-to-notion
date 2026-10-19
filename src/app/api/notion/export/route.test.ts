import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { handleNotionExport, POST } from "@/app/api/notion/export/route";
import {
  NOTION_SESSION_COOKIE,
  sealSession,
  type NotionSession,
} from "@/lib/notion/session";
import type { Storage, StoredAsset } from "@/lib/storage/storage";

const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST /api/notion/export", () => {
  it("rejects a body that is not a note document", async () => {
    const response = await handleNotionExport(jsonRequest({ title: "nope" }), {
      storage: unusedStorage(),
      env: { NOTION_TOKEN: "secret-token", NOTION_PARENT_PAGE_ID: parentPageId },
      fetch: async () => {
        throw new Error("Notion should not be called");
      },
    });
    const payload = (await response.json()) as { ok: boolean; pageUrl?: string; message: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.pageUrl).toBeUndefined();
  });

  it("reports a missing connection and does not invent a URL", async () => {
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
  });

  it("exports with the server token fallback", async () => {
    const calls: string[] = [];
    const response = await handleNotionExport(
      jsonRequest({ document: paragraphDocument("Lecture") }),
      {
        storage: unusedStorage(),
        env: { NOTION_TOKEN: "secret-token", NOTION_PARENT_PAGE_ID: parentPageId },
        fetch: async (input) => {
          const url = new URL(String(input));
          calls.push(url.pathname);
          return jsonResponse({ id: "page-1", url: "https://www.notion.so/Lecture" });
        },
      },
    );
    const payload = (await response.json()) as { ok: boolean; pageUrl: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, pageUrl: "https://www.notion.so/Lecture" });
    expect(calls).toEqual(["/v1/pages"]);
  });

  it("exports under the page selected in Notion, ignoring NOTION_PARENT_PAGE_ID", async () => {
    const key = Buffer.alloc(32, 7);
    const env = oauthEnv(key);
    const selectedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const calls: string[] = [];
    let createBody: { parent?: { page_id?: string } } = {};
    const response = await handleNotionExport(
      jsonRequest(
        { document: paragraphDocument("Lecture") },
        sessionCookie(session(), key),
      ),
      {
        storage: unusedStorage(),
        env,
        fetch: async (input, init) => {
          const url = new URL(String(input));
          calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
          if (url.pathname === "/v1/users/me") {
            return jsonResponse({ object: "user", id: "user-1" });
          }
          if (url.pathname === "/v1/search") {
            return jsonResponse({
              results: [
                { object: "page", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", parent: { type: "page_id", page_id: selectedId } },
                { object: "page", id: selectedId, parent: { type: "workspace", workspace: true } },
              ],
            });
          }
          createBody = JSON.parse(String(init?.body)) as typeof createBody;
          return jsonResponse({ id: "page-1", url: "https://www.notion.so/Lecture" });
        },
      },
    );
    const payload = (await response.json()) as { ok: boolean; pageUrl: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, pageUrl: "https://www.notion.so/Lecture" });
    expect(calls).toEqual(["GET /v1/users/me", "POST /v1/search", "POST /v1/pages"]);
    expect(createBody.parent?.page_id).toBe(selectedId);
    expect(JSON.stringify(payload)).not.toContain("oauth-token");
  });

  it("asks to reconnect when no page was shared during OAuth", async () => {
    const key = Buffer.alloc(32, 7);
    const response = await handleNotionExport(
      jsonRequest({ document: paragraphDocument("Lecture") }, sessionCookie(session(), key)),
      {
        storage: unusedStorage(),
        env: oauthEnv(key),
        fetch: async (input) =>
          new URL(String(input)).pathname === "/v1/search"
            ? jsonResponse({ results: [] })
            : jsonResponse({ object: "user" }),
      },
    );
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(400);
    expect(payload.message).toMatch(/select the page/);
  });

  it("asks the browser to reconnect when the OAuth token is rejected", async () => {
    const key = Buffer.alloc(32, 7);
    const env = oauthEnv(key);
    const rejected: NotionSession = { ...session() };
    delete rejected.refreshToken;
    const response = await handleNotionExport(
      jsonRequest({ document: paragraphDocument("Lecture") }, sessionCookie(rejected, key)),
      {
        storage: unusedStorage(),
        env,
        fetch: async () => jsonResponse({ message: "unauthorized" }, 401),
      },
    );
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toMatch(/Connect Notion again/);
    expect(response.headers.get("set-cookie")).toContain(NOTION_SESSION_COOKIE);
  });
});

function oauthEnv(key: Buffer): Record<string, string | undefined> {
  return {
    NOTION_OAUTH_CLIENT_ID: "client-id",
    NOTION_OAUTH_CLIENT_SECRET: "client-secret",
    NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
    NOTION_OAUTH_ENCRYPTION_KEY: key.toString("base64"),
    NOTION_PARENT_PAGE_ID: parentPageId,
  };
}

function session(): NotionSession {
  return {
    v: 1,
    accessToken: "oauth-token",
    refreshToken: "refresh-token",
    botId: "bot-id",
    workspaceId: "workspace-id",
    connectedAt: "2026-01-01T00:00:00.000Z",
  };
}

function sessionCookie(value: NotionSession, key: Buffer): string {
  return `${NOTION_SESSION_COOKIE}=${sealSession(value, key)}`;
}

function paragraphDocument(title: string) {
  return {
    title,
    sections: [
      {
        blocks: [
          { type: "paragraph" as const, content: "One point.", provenance: "source" as const },
        ],
      },
    ],
  };
}

function jsonRequest(body: unknown, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/notion/export", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
