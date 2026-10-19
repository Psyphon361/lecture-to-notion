import { describe, expect, it } from "vitest";

import type { NotionAuth } from "@/lib/notion/auth";
import { notionStatusFromAuth } from "@/lib/notion/status";

describe("notionStatusFromAuth", () => {
  it("reports no connection", () => {
    expect(notionStatusFromAuth({ mode: "none" }, false)).toEqual({
      ok: true,
      oauthConfigured: false,
      connected: false,
      mode: "none",
      workspaceName: null,
      parentPageId: null,
      needsParentPage: false,
      canPickParent: false,
    });
  });

  it("reports the server token and its parent page", () => {
    expect(
      notionStatusFromAuth(
        {
          mode: "token",
          accessToken: "server-token",
          parentPageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        false,
      ),
    ).toMatchObject({
      connected: true,
      mode: "token",
      parentPageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      needsParentPage: false,
      canPickParent: false,
    });
  });

  it("reports an OAuth workspace and asks for a page when missing", () => {
    const auth: NotionAuth = {
      mode: "oauth",
      accessToken: "oauth-token",
      session: {
        v: 1,
        accessToken: "oauth-token",
        botId: "bot-id",
        workspaceId: "workspace-id",
        workspaceName: "Lecture workspace",
        connectedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    expect(notionStatusFromAuth(auth, true)).toMatchObject({
      oauthConfigured: true,
      connected: true,
      mode: "oauth",
      workspaceName: "Lecture workspace",
      parentPageId: null,
      needsParentPage: true,
      canPickParent: true,
    });
  });
});
