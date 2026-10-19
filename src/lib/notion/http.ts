import { NextResponse, type NextRequest } from "next/server";

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status });
}

/** Mutating Notion settings routes accept only same-origin requests. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === request.nextUrl.origin;
}
