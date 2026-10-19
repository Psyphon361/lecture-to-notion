import { describe, expect, it } from "vitest";

import {
  NotionOAuthConfigError,
  NotionOAuthError,
  buildAuthorizeUrl,
  exchangeCode,
  oauthConfig,
  parseEncryptionKey,
  refreshAccessToken,
  tryOAuthConfig,
} from "@/lib/notion/oauth";

const key = Buffer.alloc(32, 5);
const env = {
  NOTION_OAUTH_CLIENT_ID: "client-id",
  NOTION_OAUTH_CLIENT_SECRET: "client-secret",
  NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
  NOTION_OAUTH_ENCRYPTION_KEY: key.toString("base64"),
};

describe("oauthConfig", () => {
  it("reads the public-connection settings and parses a base64 or hex key", () => {
    expect(oauthConfig(env)).toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/notion/oauth/callback",
    });
    expect(parseEncryptionKey(key.toString("base64"))).toEqual(key);
    expect(parseEncryptionKey(key.toString("hex"))).toEqual(key);
    expect(parseEncryptionKey("not-a-key")).toBeNull();
    expect(tryOAuthConfig({})).toBeNull();
  });

  it("names the missing settings without printing values", () => {
    let error: unknown;
    try {
      oauthConfig({ NOTION_OAUTH_CLIENT_ID: "client-id" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NotionOAuthConfigError);
    expect((error as Error).message).toContain("NOTION_OAUTH_CLIENT_SECRET");
    expect((error as Error).message).toContain("NOTION_OAUTH_REDIRECT_URI");
    expect((error as Error).message).toContain("NOTION_OAUTH_ENCRYPTION_KEY");
    expect((error as Error).message).not.toContain("client-id");
  });

  it("rejects a redirect URI that is not an absolute http or https URL", () => {
    expect(() =>
      oauthConfig({ ...env, NOTION_OAUTH_REDIRECT_URI: "not-a-url" }),
    ).toThrow(/absolute http or https URL/);
  });
});

describe("buildAuthorizeUrl", () => {
  it("sends the required public-connection parameters", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:3000/api/notion/oauth/callback",
        state: "state-value",
      }),
    );

    expect(url.origin).toBe("https://api.notion.com");
    expect(url.pathname).toBe("/v1/oauth/authorize");
    expect(url.searchParams.get("owner")).toBe("user");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/notion/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-value");
  });
});

describe("exchangeCode", () => {
  it("uses Basic auth, the version header, and the code body", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const result = await exchangeCode(
      {
        code: "auth-code",
        redirectUri: "http://localhost:3000/api/notion/oauth/callback",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
      async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return jsonResponse({
          access_token: "access-token",
          token_type: "bearer",
          refresh_token: "refresh-token",
          bot_id: "bot-id",
          workspace_id: "workspace-id",
          workspace_name: "Vasu's workspace",
          owner: { type: "user", user: { name: "Vasu" } },
        });
      },
    );

    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      botId: "bot-id",
      workspaceId: "workspace-id",
      workspaceName: "Vasu's workspace",
      ownerName: "Vasu",
    });
    const request = requests[0];
    expect(request?.url).toBe("https://api.notion.com/v1/oauth/token");
    expect(request?.init.method).toBe("POST");
    const headers = new Headers(request?.init.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(headers.get("notion-version")).toBe("2026-03-11");
    expect(JSON.parse(String(request?.init.body))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "http://localhost:3000/api/notion/oauth/callback",
    });
  });

  it("turns an OAuth error into a safe message", async () => {
    let error: unknown;
    try {
      await exchangeCode(
        {
          code: "bad-code",
          redirectUri: "http://localhost:3000/api/notion/oauth/callback",
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        async () =>
          jsonResponse(
            {
              error: "invalid_grant",
              error_description: "bad code client-secret",
            },
            400,
          ),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NotionOAuthError);
    expect((error as NotionOAuthError).status).toBe(400);
    expect((error as Error).message).toContain("invalid_grant");
    expect((error as Error).message).not.toContain("client-secret");
    expect((error as Error).message).toContain("[redacted]");
  });

  it("rejects a response that does not match the token shape", async () => {
    await expect(
      exchangeCode(
        {
          code: "auth-code",
          redirectUri: "http://localhost:3000/api/notion/oauth/callback",
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        async () => jsonResponse({ access_token: "only-this" }),
      ),
    ).rejects.toBeInstanceOf(NotionOAuthError);
  });
});

describe("refreshAccessToken", () => {
  it("sends the refresh grant and keeps a missing refresh token optional", async () => {
    let body: unknown;
    const result = await refreshAccessToken(
      {
        refreshToken: "old-refresh",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
      async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          access_token: "new-access",
          token_type: "bearer",
          refresh_token: null,
          bot_id: "bot-id",
          workspace_id: "workspace-id",
        });
      },
    );

    expect(body).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
    expect(result).toEqual({
      accessToken: "new-access",
      botId: "bot-id",
      workspaceId: "workspace-id",
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
