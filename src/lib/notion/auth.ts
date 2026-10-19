import {
  NotionApiError,
  notionFetch,
  redactSecrets,
} from "@/lib/notion/client";
import { normalizeParentPageId } from "@/lib/notion/export-document";
import {
  NotionOAuthError,
  refreshAccessToken,
  tryOAuthConfig,
  type NotionEnv,
} from "@/lib/notion/oauth";
import {
  readSession,
  type NotionCookieReader,
  type NotionSession,
} from "@/lib/notion/session";

/**
 * Who is allowed to talk to Notion for this request.
 * OAuth session first, then the server-side internal token.
 * An OAuth session has no configured parent: exports go to the page the user
 * selected in Notion's consent screen (see `selectExportParent`).
 * Only the internal token uses NOTION_PARENT_PAGE_ID.
 */

export type NotionAuthMode = "oauth" | "token" | "none";

export interface NotionAuth {
  mode: NotionAuthMode;
  accessToken?: string;
  refreshToken?: string;
  parentPageId?: string;
  session?: NotionSession;
  sessionKey?: Buffer;
}

export type FreshTokenResult =
  | { ok: true; auth: NotionAuth; session?: NotionSession }
  | {
      ok: false;
      status: number;
      reason: "reconnect" | "error";
      message: string;
    };

export interface NotionCookieSource {
  cookies: NotionCookieReader;
}

export function resolveNotionAuth(
  source: NotionCookieSource,
  env: NotionEnv = process.env,
): NotionAuth {
  const config = tryOAuthConfig(env);
  const session = config ? readSession(source.cookies, config.encryptionKey) : null;
  const envParentPageId = normalizeParent(env.NOTION_PARENT_PAGE_ID);

  if (session) {
    return {
      mode: "oauth",
      accessToken: session.accessToken,
      ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
      session,
      sessionKey: config?.encryptionKey,
    };
  }

  const token = env.NOTION_TOKEN?.trim();
  if (token) {
    return {
      mode: "token",
      accessToken: token,
      ...(envParentPageId ? { parentPageId: envParentPageId } : {}),
    };
  }

  return {
    mode: "none",
    ...(envParentPageId ? { parentPageId: envParentPageId } : {}),
  };
}

/**
 * Check an OAuth token before an export creates anything.
 * A 401 with a refresh token is refreshed once, and the new session is returned
 * so the route can re-seal the cookie. The internal token is left alone.
 */
export async function ensureFreshToken(
  auth: NotionAuth,
  env: NotionEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FreshTokenResult> {
  if (auth.mode !== "oauth" || !auth.accessToken || !auth.session) {
    return { ok: true, auth };
  }

  try {
    await notionFetch(fetchImpl, auth.accessToken, "/v1/users/me");
    return { ok: true, auth };
  } catch (error) {
    if (!(error instanceof NotionApiError) || error.status !== 401) {
      return {
        ok: false,
        status: 502,
        reason: "error",
        message: redactSecrets(
          "Notion could not verify the connection. Try again.",
          auth.accessToken,
          auth.refreshToken,
        ),
      };
    }
  }

  if (!auth.refreshToken) {
    return reconnect("The Notion connection expired. Connect Notion again.");
  }

  const config = tryOAuthConfig(env);
  if (!config) {
    return reconnect("The Notion connection expired. Connect Notion again.");
  }

  try {
    const token = await refreshAccessToken(
      {
        refreshToken: auth.refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
      fetchImpl,
    );
    const session: NotionSession = {
      ...auth.session,
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      ...(token.workspaceName ? { workspaceName: token.workspaceName } : {}),
      ...(token.ownerName ? { ownerName: token.ownerName } : {}),
    };
    const nextAuth: NotionAuth = {
      ...auth,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? auth.refreshToken,
      session,
      sessionKey: config.encryptionKey,
    };

    await notionFetch(fetchImpl, token.accessToken, "/v1/users/me");
    return { ok: true, auth: nextAuth, session };
  } catch (error) {
    return reconnect(
      error instanceof NotionOAuthError
        ? redactSecrets(error.message, auth.accessToken, auth.refreshToken)
        : "The Notion connection expired. Connect Notion again.",
    );
  }
}

function reconnect(message: string): FreshTokenResult {
  return { ok: false, status: 401, reason: "reconnect", message };
}

function normalizeParent(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return normalizeParentPageId(trimmed) ?? undefined;
}
