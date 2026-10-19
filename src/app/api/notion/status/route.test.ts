import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { handleNotionStatus } from "@/app/api/notion/status/route";
import {
  NOTION_SESSION_COOKIE,
  sealSession,
  type NotionSession,
} from "@/lib/notion/session";

const key = Buffer.alloc(32, 9);
const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /api/notion/status", () => {
  it("reports no connection without leaking anything", async () => {
    const response = await handleNotionStatus(request(), {});
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      ok: true,
      oauthConfigured: false,
      connected: false,
      mode: "none",
      workspaceName: null,
      parentPageId: null,
      needsParentPage: false,
      canPickParent: false,
    });
    expect(JSON.stringify(payload)).not.toContain("token");
  });

  it("reports the server token mode and its parent page", async () => {
    const response = await handleNotionStatus(request(), {
      NOTION_TOKEN: "server-token",
      NOTION_PARENT_PAGE_ID: parentPageId,
    });
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      connected: true,
      mode: "token",
      parentPageId,
      needsParentPage: false,
      canPickParent: false,
    });
    expect(JSON.stringify(payload)).not.toContain("server-token");
  });

  it("reports an OAuth workspace and asks for a parent page when missing", async () => {
    const response = await handleNotionStatus(
      request(sessionCookie(sample(), key)),
      oauthEnv(key),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      oauthConfigured: true,
      connected: true,
      mode: "oauth",
      workspaceName: "Lecture workspace",
      parentPageId: null,
      needsParentPage: true,
      canPickParent: true,
    });
    expect(JSON.stringify(payload)).not.toContain("oauth-access");
  });
});

function oauthEnv(encryptionKey: Buffer): Record<string, string | undefined> {
  return {
    NOTION_OAUTH_CLIENT_ID: "client-id",
    NOTION_OAUTH_CLIENT_SECRET: "client-secret",
    NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
    NOTION_OAUTH_ENCRYPTION_KEY: encryptionKey.toString("base64"),
  };
}

function sample(): NotionSession {
  return {
    v: 1,
    accessToken: "oauth-access",
    refreshToken: "oauth-refresh",
    botId: "bot-id",
    workspaceId: "workspace-id",
    workspaceName: "Lecture workspace",
    connectedAt: "2026-01-01T00:00:00.000Z",
  };
}

function sessionCookie(session: NotionSession, encryptionKey: Buffer): string {
  return `${NOTION_SESSION_COOKIE}=${sealSession(session, encryptionKey)}`;
}

function request(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/notion/status", {
    headers: cookie ? { cookie } : undefined,
  });
}
