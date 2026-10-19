import { NextResponse, type NextRequest } from "next/server";

import {
  exchangeCode,
  NotionOAuthConfigError,
  NotionOAuthError,
  oauthConfig,
  type NotionEnv,
} from "@/lib/notion/oauth";
import {
  clearState,
  readState,
  sessionFromToken,
  statesMatch,
  writeSession,
} from "@/lib/notion/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  return handleOAuthCallback(request);
}

export async function handleOAuthCallback(
  request: NextRequest,
  deps: { env?: NotionEnv; fetch?: typeof fetch } = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const params = request.nextUrl.searchParams;

  if (!statesMatch(params.get("state") ?? undefined, readState(request.cookies))) {
    return errorRedirect(
      request,
      "The Notion connection request expired. Try again.",
    );
  }

  const oauthError = params.get("error");
  if (oauthError) {
    return errorRedirect(
      request,
      oauthError === "access_denied"
        ? "Notion access was not granted."
        : "Notion did not authorize the connection.",
    );
  }

  const code = params.get("code");
  if (!code) {
    return errorRedirect(request, "Notion did not return an authorization code.");
  }

  let config;
  try {
    config = oauthConfig(env);
  } catch (error) {
    return errorRedirect(
      request,
      error instanceof NotionOAuthConfigError
        ? error.message
        : "Notion OAuth is not configured.",
    );
  }

  try {
    const token = await exchangeCode(
      {
        code,
        redirectUri: config.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
      fetchImpl,
    );
    const response = NextResponse.redirect(
      new URL("/notion/connected", request.nextUrl.origin),
    );
    clearState(response);
    writeSession(response, sessionFromToken(token), config.encryptionKey);
    return response;
  } catch (error) {
    return errorRedirect(
      request,
      error instanceof NotionOAuthError
        ? error.message
        : "Notion could not complete the connection. Try again.",
    );
  }
}

function errorRedirect(request: NextRequest, message: string): NextResponse {
  const target = new URL("/notion/connected", request.nextUrl.origin);
  target.searchParams.set("error", message);
  const response = NextResponse.redirect(target);
  clearState(response);
  return response;
}
