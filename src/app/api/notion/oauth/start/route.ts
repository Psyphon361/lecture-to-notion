import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthorizeUrl,
  NotionOAuthConfigError,
  oauthConfig,
  type NotionEnv,
} from "@/lib/notion/oauth";
import { createOAuthState, writeState } from "@/lib/notion/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  return handleOAuthStart(request);
}

export async function handleOAuthStart(
  request: NextRequest,
  env: NotionEnv = process.env,
): Promise<Response> {
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

  const state = createOAuthState();
  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    }),
  );
  writeState(response, state);
  return response;
}

function errorRedirect(request: NextRequest, message: string): NextResponse {
  const target = new URL("/notion/connected", request.nextUrl.origin);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}
