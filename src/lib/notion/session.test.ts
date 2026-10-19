import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  NOTION_SESSION_COOKIE,
  NotionSessionError,
  createOAuthState,
  openSession,
  readSession,
  sealSession,
  sessionFromToken,
  statesMatch,
  type NotionSession,
} from "@/lib/notion/session";

const key = Buffer.alloc(32, 3);

describe("Notion session cookie", () => {
  it("round-trips a session without exposing the token in the cookie", () => {
    const session = sample();
    const sealed = sealSession(session, key);

    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("access-token");
    expect(openSession(sealed, key)).toEqual(session);
    expect(sealSession(session, key)).not.toBe(sealed);
  });

  it("treats a wrong key and a tampered value as no session", () => {
    const sealed = sealSession(sample(), key);
    expect(openSession(sealed, Buffer.alloc(32, 9))).toBeNull();
    expect(openSession(`${sealed}x`, key)).toBeNull();
    expect(openSession("v1.not.a.payload", key)).toBeNull();
    expect(openSession(undefined, key)).toBeNull();
    expect(openSession("", key)).toBeNull();
  });

  it("allows a session without a refresh token and reads it from a request", () => {
    const session: NotionSession = { ...sample() };
    delete session.refreshToken;
    const sealed = sealSession(session, key);
    const request = new NextRequest("http://localhost/api/notion/status", {
      headers: { cookie: `${NOTION_SESSION_COOKIE}=${sealed}` },
    });

    expect(readSession(request.cookies, key)).toEqual(session);
    expect(readSession(request.cookies, Buffer.alloc(32, 4))).toBeNull();
  });

  it("rejects a value that would overflow a cookie", () => {
    const session = { ...sample(), accessToken: "a".repeat(5000) };
    expect(() => sealSession(session, key)).toThrow(NotionSessionError);
  });

  it("requires a 32-byte key", () => {
    expect(() => sealSession(sample(), Buffer.alloc(16, 1))).toThrow(
      /32 bytes/,
    );
  });

  it("creates a random state and compares it without leaking length differences", () => {
    const first = createOAuthState();
    const second = createOAuthState();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(20);
    expect(statesMatch(first, first)).toBe(true);
    expect(statesMatch(first, second)).toBe(false);
    expect(statesMatch(first, `${first}x`)).toBe(false);
    expect(statesMatch(undefined, first)).toBe(false);
    expect(statesMatch(first, undefined)).toBe(false);
  });

  it("maps a token response to the stored shape", () => {
    const session = sessionFromToken(
      {
        accessToken: "access",
        refreshToken: "refresh",
        botId: "bot",
        workspaceId: "workspace",
        workspaceName: "Vasu",
        ownerName: "Vasu",
      },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(session).toEqual({
      v: 1,
      accessToken: "access",
      refreshToken: "refresh",
      botId: "bot",
      workspaceId: "workspace",
      workspaceName: "Vasu",
      ownerName: "Vasu",
      connectedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

function sample(): NotionSession {
  return {
    v: 1,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    botId: "bot-id",
    workspaceId: "workspace-id",
    workspaceName: "Lecture workspace",
    connectedAt: "2026-01-01T00:00:00.000Z",
  };
}
