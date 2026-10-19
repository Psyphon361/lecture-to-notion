import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { isUploadPathname } from "@/lib/storage/blob-storage";
import { isBlobConfigured } from "@/lib/storage/default-storage";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/validate-pptx";

export const runtime = "nodejs";

const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Issues a short-lived token so the browser can send the deck straight to Blob.
 * This keeps the deck out of the function body, which Vercel caps at 4.5 MB.
 * Only `uploads/<uuid>/<name>.pptx` paths, up to the upload cap, get a token.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return Response.json({ error: "Direct upload is not configured." }, { status: 501 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "The upload request could not be read." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPathname(pathname)) {
          throw new Error("That upload path is not allowed.");
        }
        return {
          allowedContentTypes: [PPTX_TYPE],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
