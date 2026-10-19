import { z } from "zod";

import { readJson, redactSecrets } from "@/lib/notion/client";

/**
 * Notion public-connection OAuth. Pure helpers only: no cookies, no Next.js.
 * The client secret, authorization code, and tokens never leave the server.
 */

const NOTION_OAUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

/** Allows tests and callers to pass a partial env without NODE_ENV. */
export type NotionEnv = Record<string, string | undefined>;

export class NotionOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionOAuthConfigError";
  }
}

export class NotionOAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotionOAuthError";
    this.status = status;
  }
}

export interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  botId: string;
  workspaceId: string;
  workspaceName?: string;
  ownerName?: string;
}

const ownerSchema = z
  .object({
    type: z.string(),
    user: z
      .object({
        name: z.string().nullish(),
        id: z.string().nullish(),
        type: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().min(1),
    refresh_token: z.string().nullish(),
    bot_id: z.string().min(1),
    workspace_id: z.string().min(1),
    workspace_name: z.string().nullish(),
    workspace_icon: z.string().nullish(),
    owner: ownerSchema.nullish(),
    duplicated_template_id: z.string().nullish(),
    request_id: z.string().nullish(),
  })
  .passthrough();

/**
 * Accept a 32-byte key as base64 (openssl rand -base64 32) or 64 hex characters.
 * Returns null rather than throwing so env-token mode still works without OAuth.
 */
export function parseEncryptionKey(value: string | undefined): Buffer | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const decoded = Buffer.from(trimmed, "base64");
  return decoded.length === 32 ? decoded : null;
}

export function oauthConfig(env: NotionEnv = process.env): NotionOAuthConfig {
  const clientId = env.NOTION_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.NOTION_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.NOTION_OAUTH_REDIRECT_URI?.trim() ?? "";
  const encryptionKey = parseEncryptionKey(env.NOTION_OAUTH_ENCRYPTION_KEY);

  const missing: string[] = [];
  if (!clientId) missing.push("NOTION_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("NOTION_OAUTH_CLIENT_SECRET");
  if (!redirectUri) missing.push("NOTION_OAUTH_REDIRECT_URI");
  if (!encryptionKey) missing.push("NOTION_OAUTH_ENCRYPTION_KEY");

  if (missing.length > 0) {
    throw new NotionOAuthConfigError(
      `Notion OAuth is not configured. Add ${missing.join(", ")} on the server.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new NotionOAuthConfigError(
      "NOTION_OAUTH_REDIRECT_URI must be an absolute http or https URL.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new NotionOAuthConfigError(
      "NOTION_OAUTH_REDIRECT_URI must be an absolute http or https URL.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey: encryptionKey as Buffer,
  };
}

/** Try to build the config without throwing. Used by status and fallback paths. */
export function tryOAuthConfig(
  env: NotionEnv = process.env,
): NotionOAuthConfig | null {
  try {
    return oauthConfig(env);
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(NOTION_OAUTH_URL);
  url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeCode(
  input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResult> {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    },
    input.clientId,
    input.clientSecret,
    fetchImpl,
  );
}

export async function refreshAccessToken(
  input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResult> {
  return tokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
    input.clientId,
    input.clientSecret,
    fetchImpl,
  );
}

async function tokenRequest(
  body: Record<string, string>,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch,
): Promise<OAuthTokenResult> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetchImpl(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NotionOAuthError("Notion could not be reached.", 502);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new NotionOAuthError(
      redactSecrets(
        oauthErrorMessage(payload, response.status),
        clientSecret,
        body.code,
        body.refresh_token,
      ),
      response.status,
    );
  }

  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new NotionOAuthError(
      "Notion returned an unexpected token response.",
      502,
    );
  }

  return {
    accessToken: parsed.data.access_token,
    ...(parsed.data.refresh_token
      ? { refreshToken: parsed.data.refresh_token }
      : {}),
    botId: parsed.data.bot_id,
    workspaceId: parsed.data.workspace_id,
    ...(parsed.data.workspace_name
      ? { workspaceName: parsed.data.workspace_name }
      : {}),
    ...(parsed.data.owner?.user?.name
      ? { ownerName: parsed.data.owner.user.name }
      : {}),
  };
}

function oauthErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    if ("error" in payload && typeof payload.error === "string") {
      const description =
        "error_description" in payload &&
        typeof payload.error_description === "string"
          ? `: ${payload.error_description}`
          : "";
      return `${payload.error}${description}`.slice(0, 500);
    }
    if ("message" in payload && typeof payload.message === "string") {
      const message = payload.message.trim();
      if (message.length > 0) return message.slice(0, 500);
    }
  }
  return `Notion authorization failed with status ${status}.`;
}
