import { NextResponse, type NextRequest } from "next/server";

import { isSameOrigin, jsonError } from "@/lib/notion/http";
import { clearSession, clearState } from "@/lib/notion/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonError(403, "That request is not allowed.");
  }
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  clearState(response);
  return response;
}
