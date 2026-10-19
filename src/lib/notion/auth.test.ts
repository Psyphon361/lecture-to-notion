import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  ensureFreshToken,
  resolveNotionAuth,
  type NotionAuth,
} from "@/lib/notion/auth";
import {
  NOTION_SESSION_COOKIE,
  sealSession,
  type NotionSession,
} from "@/lib/notion/session";

const key = Buffer.alloc(32, 6);
const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("resolveNotionAuth", () => {
  it("prefers an encrypted OAuth session over the server token", () => {
    const session = sample();
    const auth = resolveNotionAuth(
      request(sessionCookie(session, key)),
      oauthEnv(key, { NOTION_TOKEN: "server-token" }),
    );

    expect(auth.mode).toBe("oauth");
    expect(auth.accessToken).toBe("oauth-access");
    expect(auth.refreshToken).toBe("oauth-refresh");
    expect(auth.sessionKey).toEqual(key);
    expect(auth.parentPageId).toBeUndefined();
    expect(auth.session).toEqual(session);
  });

  it("ignores NOTION_PARENT_PAGE_ID for an OAuth session", () => {
    const auth = resolveNotionAuth(
      request(sessionCookie(sample(), key)),
      oauthEnv(key, { NOTION_PARENT_PAGE_ID: parentPageId }),
    );
    expect(auth.mode).toBe("oauth");
    expect(auth.parentPageId).toBeUndefined();
  });

  it("falls back to the server token and then to no connection", () => {
    const token = resolveNotionAuth(request(), {
      NOTION_TOKEN: "server-token",
      NOTION_PARENT_PAGE_ID: parentPageId,
    });
    expect(token).toEqual({
      mode: "token",
      accessToken: "server-token",
      parentPageId,
    });

    expect(resolveNotionAuth(request(), {})).toEqual({ mode: "none" });
  });

  it("ignores a tampered session cookie", () => {
    const auth = resolveNotionAuth(
      request(`${NOTION_SESSION_COOKIE}=v1.bad.value.here`),
      oauthEnv(key, { NOTION_TOKEN: "server-token" }),
    );
    expect(auth.mode).toBe("token");
  });
});

describe("ensureFreshToken", () => {
  it("leaves the server token path alone", async () => {
    let calls = 0;
    const auth: NotionAuth = { mode: "token", accessToken: "server-token" };
    const result = await ensureFreshToken(auth, {}, async () => {
      calls += 1;
      throw new Error("should not call Notion");
    });

    expect(result).toEqual({ ok: true, auth });
    expect(calls).toBe(0);
  });

  it("accepts a working OAuth token", async () => {
    const auth = oauthAuth(sample());
    const result = await ensureFreshToken(auth, oauthEnv(key), async () =>
      jsonResponse({ object: "user" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.auth.accessToken).toBe("oauth-access");
  });

  it("refreshes once on 401 and returns the new session", async () => {
    const calls: string[] = [];
    let preflight = 0;
    const auth = oauthAuth(sample());
    const result = await ensureFreshToken(auth, oauthEnv(key), async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      if (url.pathname === "/v1/oauth/token") {
        return jsonResponse({
          access_token: "new-access",
          token_type: "bearer",
          refresh_token: "new-refresh",
          bot_id: "bot-id",
          workspace_id: "workspace-id",
        });
      }
      preflight += 1;
      if (preflight === 1) return jsonResponse({ message: "expired" }, 401);
      return jsonResponse({ object: "user" });
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual(["/v1/users/me", "/v1/oauth/token", "/v1/users/me"]);
    expect(result.auth.accessToken).toBe("new-access");
    expect(result.auth.refreshToken).toBe("new-refresh");
    expect(result.session?.accessToken).toBe("new-access");
    expect(result.session?.refreshToken).toBe("new-refresh");
  });

  it("asks for a reconnect when 401 cannot be refreshed", async () => {
    const withoutRefresh: NotionSession = { ...sample() };
    delete withoutRefresh.refreshToken;
    const noRefresh = await ensureFreshToken(
      oauthAuth(withoutRefresh),
      oauthEnv(key),
      async () => jsonResponse({ message: "expired" }, 401),
    );
    expect(noRefresh).toMatchObject({
      ok: false,
      status: 401,
      reason: "reconnect",
    });

    const failedRefresh = await ensureFreshToken(
      oauthAuth(sample()),
      oauthEnv(key),
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/v1/oauth/token") {
          return jsonResponse({ error: "invalid_grant" }, 400);
        }
        return jsonResponse({ message: "expired" }, 401);
      },
    );
    expect(failedRefresh).toMatchObject({
      ok: false,
      status: 401,
      reason: "reconnect",
    });
  });

  it("reports a non-auth failure without reconnecting", async () => {
    const result = await ensureFreshToken(
      oauthAuth(sample()),
      oauthEnv(key),
      async () => jsonResponse({ message: "server error" }, 500),
    );
    expect(result).toMatchObject({ ok: false, status: 502, reason: "error" });
  });
});

function oauthEnv(
  encryptionKey: Buffer,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NOTION_OAUTH_CLIENT_ID: "client-id",
    NOTION_OAUTH_CLIENT_SECRET: "client-secret",
    NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
    NOTION_OAUTH_ENCRYPTION_KEY: encryptionKey.toString("base64"),
    NOTION_PARENT_PAGE_ID: parentPageId,
    ...extra,
  };
}

function oauthAuth(session: NotionSession): NotionAuth {
  return {
    mode: "oauth",
    accessToken: session.accessToken,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    parentPageId,
    session,
    sessionKey: key,
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
  return new NextRequest("http://localhost/api/notion/status", {
    headers: cookie ? { cookie } : undefined,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
