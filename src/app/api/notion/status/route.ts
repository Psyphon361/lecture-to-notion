import { NextResponse, type NextRequest } from "next/server";

import { resolveNotionAuth } from "@/lib/notion/auth";
import { tryOAuthConfig, type NotionEnv } from "@/lib/notion/oauth";
import { notionStatusFromAuth } from "@/lib/notion/status";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  return handleNotionStatus(request);
}

export async function handleNotionStatus(
  request: NextRequest,
  env: NotionEnv = process.env,
): Promise<Response> {
  const auth = resolveNotionAuth(request, env);
  return NextResponse.json(
    notionStatusFromAuth(auth, tryOAuthConfig(env) !== null),
  );
}
