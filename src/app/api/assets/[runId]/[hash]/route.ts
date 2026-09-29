import { createLocalStorage, parseImageKey, StorageError } from "@/lib/storage/storage";

export const runtime = "nodejs";

type AssetRouteContext = {
  params: Promise<{ runId: string; hash: string }>;
};

/**
 * Serves one image already stored for a run.
 * The key is `<runId>/<sha256>`. No directory listing.
 */
export async function GET(_request: Request, context: AssetRouteContext): Promise<Response> {
  const { runId, hash } = await context.params;
  let key: string;
  try {
    const parsed = parseImageKey(`${runId}/${hash}`);
    key = `${parsed.runId}/${parsed.contentHash}`;
  } catch (error) {
    if (error instanceof StorageError) return invalidKey();
    throw error;
  }

  const storage = createLocalStorage();
  let bytes: Uint8Array | null;
  let info: { contentType: string } | null;
  try {
    [bytes, info] = await Promise.all([storage.get(key), storage.stat(key)]);
  } catch (error) {
    if (error instanceof StorageError) return missingImage();
    throw error;
  }
  if (!bytes || !info) return missingImage();

  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": info.contentType,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

function invalidKey(): Response {
  return Response.json({ ok: false, message: "That image key is not valid." }, { status: 400 });
}

function missingImage(): Response {
  return Response.json({ ok: false, message: "That image is not stored." }, { status: 404 });
}
