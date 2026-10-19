import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { handleOAuthCallback } from "@/app/api/notion/oauth/callback/route";
import { handleOAuthStart } from "@/app/api/notion/oauth/start/route";
import { NOTION_STATE_COOKIE } from "@/lib/notion/session";

const key = Buffer.alloc(32, 8);
const env = {
  NOTION_OAUTH_CLIENT_ID: "client-id",
  NOTION_OAUTH_CLIENT_SECRET: "client-secret",
  NOTION_OAUTH_REDIRECT_URI: "http://localhost:3000/api/notion/oauth/callback",
  NOTION_OAUTH_ENCRYPTION_KEY: key.toString("base64"),
};

describe("GET /api/notion/oauth/start", () => {
  it("sets a state cookie and redirects to Notion", async () => {
    const response = await handleOAuthStart(
      request("/api/notion/oauth/start"),
      env,
    );
    const location = new URL(String(response.headers.get("location")));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://api.notion.com");
    expect(location.pathname).toBe("/v1/oauth/authorize");
    expect(location.searchParams.get("owner")).toBe("user");
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(cookie).toContain(`${NOTION_STATE_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
  });

  it("redirects with a safe message when OAuth is not configured", async () => {
    const response = await handleOAuthStart(
      request("/api/notion/oauth/start"),
      {},
    );
    const location = new URL(String(response.headers.get("location")));

    expect(location.pathname).toBe("/notion/connected");
    expect(location.searchParams.get("error")).toContain(
      "NOTION_OAUTH_CLIENT_ID",
    );
    expect(location.searchParams.get("error")).not.toContain("client-id");
  });
});

describe("GET /api/notion/oauth/callback", () => {
  it("rejects a callback whose state does not match", async () => {
    const response = await handleOAuthCallback(
      request("/api/notion/oauth/callback?code=code&state=wrong", "state-value"),
      { env, fetch: async () => jsonResponse({}) },
    );
    expect(errorAt(response)).toContain("expired");
  });

  it("reports a cancelled authorization", async () => {
    const response = await handleOAuthCallback(
      request(
        "/api/notion/oauth/callback?error=access_denied&state=state-value",
        "state-value",
      ),
      { env, fetch: async () => jsonResponse({}) },
    );
    expect(errorAt(response)).toContain("not granted");
  });

  it("exchanges a code and stores an encrypted session cookie", async () => {
    const requests: string[] = [];
    const response = await handleOAuthCallback(
      request(
        "/api/notion/oauth/callback?code=auth-code&state=state-value",
        "state-value",
      ),
      {
        env,
        fetch: async (input, init) => {
          const url = new URL(String(input));
          requests.push(url.pathname);
          expect(new Headers(init?.headers).get("notion-version")).toBe(
            "2026-03-11",
          );
          return jsonResponse({
            access_token: "access-token",
            token_type: "bearer",
            refresh_token: "refresh-token",
            bot_id: "bot-id",
            workspace_id: "workspace-id",
            workspace_name: "Lecture workspace",
            owner: { type: "user", user: { name: "Vasu" } },
          });
        },
      },
    );
    const location = new URL(String(response.headers.get("location")));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(requests).toEqual(["/v1/oauth/token"]);
    expect(location.pathname).toBe("/notion/connected");
    expect(cookie).toContain("l2n_notion_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("access-token");
    expect(cookie).not.toContain("refresh-token");
  });

  it("returns a safe error when the token exchange fails", async () => {
    const response = await handleOAuthCallback(
      request(
        "/api/notion/oauth/callback?code=auth-code&state=state-value",
        "state-value",
      ),
      {
        env,
        fetch: async () =>
          jsonResponse(
            { error: "invalid_grant", error_description: "client-secret" },
            400,
          ),
      },
    );

    const error = errorAt(response);
    expect(error).toContain("invalid_grant");
    expect(error).not.toContain("client-secret");
    expect(error).toContain("[redacted]");
  });
});

function request(path: string, state?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: state
      ? { cookie: `${NOTION_STATE_COOKIE}=${state}` }
      : undefined,
  });
}

function errorAt(response: Response): string {
  const location = new URL(String(response.headers.get("location")));
  return location.searchParams.get("error") ?? "";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
