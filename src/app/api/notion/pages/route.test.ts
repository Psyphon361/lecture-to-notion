import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { handleNotionPages } from "@/app/api/notion/pages/route";
import {
  NOTION_SESSION_COOKIE,
  sealSession,
  type NotionSession,
} from "@/lib/notion/session";

const key = Buffer.alloc(32, 10);
const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /api/notion/pages", () => {
  it("requires a connection", async () => {
    const response = await handleNotionPages(request(), {});
    expect(response.status).toBe(401);
  });

  it("returns the pages shared with the OAuth connection", async () => {
    const calls: string[] = [];
    const response = await handleNotionPages(
      request(sessionCookie(sample(), key)),
      {
        env: oauthEnv(key),
        fetch: async (input, init) => {
          const url = new URL(String(input));
          calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
          if (url.pathname === "/v1/users/me") {
            return jsonResponse({ object: "user" });
          }
          return jsonResponse({
            results: [
              {
                object: "page",
                id: parentPageId,
                url: "https://www.notion.so/Lecture",
                properties: {
                  title: { type: "title", title: [{ plain_text: "Lecture" }] },
                },
              },
            ],
          });
        },
      },
    );
    const payload = (await response.json()) as {
      pages: { id: string; title: string }[];
    };

    expect(response.status).toBe(200);
    expect(calls).toEqual(["GET /v1/users/me", "POST /v1/search"]);
    expect(payload.pages).toEqual([
      { id: parentPageId, title: "Lecture", url: "https://www.notion.so/Lecture" },
    ]);
    expect(JSON.stringify(payload)).not.toContain("oauth-access");
  });

  it("asks for a reconnect when the token is rejected", async () => {
    const response = await handleNotionPages(
      request(sessionCookie(sample(), key)),
      {
        env: oauthEnv(key),
        fetch: async () => jsonResponse({ message: "expired" }, 401),
      },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain(NOTION_SESSION_COOKIE);
  });
});

function oauthEnv(encryptionKey: Buffer): Record<string, string | undefined> {
  return {
    NOTION_OAUTH_CLIENT_ID: "client-id",
    NOTION_OAUTH_CLIENT_SECRET: "client-secret",
    NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
    NOTION_OAUTH_ENCRYPTION_KEY: encryptionKey.toString("base64"),
    NOTION_PARENT_PAGE_ID: parentPageId,
  };
}

function sample(): NotionSession {
  return {
    v: 1,
    accessToken: "oauth-access",
    refreshToken: "oauth-refresh",
    botId: "bot-id",
    workspaceId: "workspace-id",
    connectedAt: "2026-01-01T00:00:00.000Z",
  };
}

function sessionCookie(session: NotionSession, encryptionKey: Buffer): string {
  return `${NOTION_SESSION_COOKIE}=${sealSession(session, encryptionKey)}`;
}

function request(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/notion/pages", {
    headers: cookie ? { cookie } : undefined,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
