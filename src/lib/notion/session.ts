import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { NextResponse } from "next/server";
import { z } from "zod";

import type { OAuthTokenResult } from "@/lib/notion/oauth";

/**
 * One Notion connection per browser. The payload is encrypted with a server-only key
 * and stored in an HttpOnly cookie; no database is involved.
 */

export const NOTION_SESSION_COOKIE = "l2n_notion_session";
export const NOTION_STATE_COOKIE = "l2n_notion_state";
export const NOTION_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const NOTION_STATE_MAX_AGE = 60 * 10;

/** Browsers reject cookies larger than about 4 KB, including the name and attributes. */
const MAX_SEALED_LENGTH = 4000;

export class NotionSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionSessionError";
  }
}

export const notionSessionSchema = z.object({
  v: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  botId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().optional(),
  ownerName: z.string().optional(),
  connectedAt: z.string().min(1),
  parentPageId: z.string().min(1).optional(),
});

export type NotionSession = z.infer<typeof notionSessionSchema>;

export function sessionFromToken(
  token: OAuthTokenResult,
  now = new Date(),
): NotionSession {
  return {
    v: 1,
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    botId: token.botId,
    workspaceId: token.workspaceId,
    ...(token.workspaceName ? { workspaceName: token.workspaceName } : {}),
    ...(token.ownerName ? { ownerName: token.ownerName } : {}),
    connectedAt: now.toISOString(),
  };
}

export function sealSession(session: NotionSession, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
  if (sealed.length > MAX_SEALED_LENGTH) {
    throw new NotionSessionError("The Notion session is too large for a cookie.");
  }
  return sealed;
}

/** A tampered, truncated, or wrong-key value is treated as no session, not an error. */
export function openSession(value: string | undefined, key: Buffer): NotionSession | null {
  if (!value) return null;
  try {
    assertKey(key);
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const iv = Buffer.from(parts[1] ?? "", "base64url");
    const tag = Buffer.from(parts[2] ?? "", "base64url");
    const ciphertext = Buffer.from(parts[3] ?? "", "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsed = notionSessionSchema.safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function statesMatch(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface NotionCookieReader {
  get(name: string): { value: string } | undefined;
}

export function readSession(
  cookies: NotionCookieReader,
  key: Buffer,
): NotionSession | null {
  return openSession(cookies.get(NOTION_SESSION_COOKIE)?.value, key);
}

export function writeSession(
  response: NextResponse,
  session: NotionSession,
  key: Buffer,
): void {
  response.cookies.set(NOTION_SESSION_COOKIE, sealSession(session, key), {
    ...cookieOptions(NOTION_SESSION_MAX_AGE),
  });
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(NOTION_SESSION_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
}

export function readState(cookies: NotionCookieReader): string | undefined {
  return cookies.get(NOTION_STATE_COOKIE)?.value;
}

export function writeState(response: NextResponse, state: string): void {
  response.cookies.set(NOTION_STATE_COOKIE, state, {
    ...cookieOptions(NOTION_STATE_MAX_AGE),
  });
}

export function clearState(response: NextResponse): void {
  response.cookies.set(NOTION_STATE_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new NotionSessionError(
      "The Notion session key must be 32 bytes.",
    );
  }
}
