import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { handleNotionParent } from "@/app/api/notion/parent/route";
import {
  NOTION_SESSION_COOKIE,
  sealSession,
  type NotionSession,
} from "@/lib/notion/session";

const key = Buffer.alloc(32, 11);
const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST /api/notion/parent", () => {
  it("needs an OAuth connection to store a page", async () => {
    const response = await handleNotionParent(
      jsonRequest({ pageId: parentPageId }, { NOTION_TOKEN: "server-token" }),
      { env: { NOTION_TOKEN: "server-token" } },
    );
    expect(response.status).toBe(400);
  });

  it("rejects another origin", async () => {
    const response = await handleNotionParent(
      jsonRequest({ pageId: parentPageId }, {}, "https://example.com"),
      { env: oauthEnv(key) },
    );
    expect(response.status).toBe(403);
  });

  it("validates and stores the parent page in the session cookie", async () => {
    const calls: string[] = [];
    const response = await handleNotionParent(
      jsonRequest({ pageId: parentPageId }, sessionCookie(sample(), key)),
      {
        env: oauthEnv(key),
        fetch: async (input, init) => {
          const url = new URL(String(input));
          calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
          if (url.pathname === "/v1/users/me") {
            return jsonResponse({ object: "user" });
          }
          return jsonResponse({ object: "page", id: parentPageId });
        },
      },
    );
    const payload = (await response.json()) as { parentPageId: string };

    expect(response.status).toBe(200);
    expect(payload.parentPageId).toBe(parentPageId);
    expect(calls).toEqual([
      "GET /v1/users/me",
      `GET /v1/pages/${parentPageId}`,
    ]);
    expect(response.headers.get("set-cookie")).toContain(NOTION_SESSION_COOKIE);
  });

  it("reports a page that is not shared with the connection", async () => {
    const response = await handleNotionParent(
      jsonRequest({ pageId: parentPageId }, sessionCookie(sample(), key)),
      {
        env: oauthEnv(key),
        fetch: async (input) => {
          const url = new URL(String(input));
          if (url.pathname === "/v1/users/me") {
            return jsonResponse({ object: "user" });
          }
          return jsonResponse({ message: "not found" }, 404);
        },
      },
    );
    expect(response.status).toBe(400);
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

function jsonRequest(
  body: unknown,
  cookieOrEnv: string | Record<string, string | undefined>,
  origin?: string,
): NextRequest {
  const cookie = typeof cookieOrEnv === "string" ? cookieOrEnv : undefined;
  return new NextRequest("http://localhost/api/notion/parent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
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
