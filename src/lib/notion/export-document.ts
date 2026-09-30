import {
  ARRAY_LIMIT,
  NOTION_VERSION,
  chunkBlocks,
  isImagePlaceholder,
  mapNoteDocument,
  type ImagePlaceholder,
  type MappedBlock,
  type NotionBlock,
} from "@/lib/notion/adapter";
import type { NoteDocument } from "@/lib/documents/schema";
import type { Storage } from "@/lib/storage/storage";

export interface NotionExportInput {
  document: NoteDocument;
  token: string | undefined;
  parentPageId: string | undefined;
  storage: Storage;
  fetch?: typeof fetch;
}

export type NotionExportOutcome =
  | { ok: true; pageUrl: string }
  | { ok: false; status: number; message: string };

/**
 * Create a child page, upload kept images, and append blocks in chunks of 100.
 * A missing setting or a Notion error returns a message and no page URL.
 */
export async function exportNoteDocument(input: NotionExportInput): Promise<NotionExportOutcome> {
  const token = input.token?.trim() ?? "";
  const parentPageId = normalizeParentPageId(input.parentPageId ?? "");
  if (token.length === 0) {
    return { ok: false, status: 400, message: "Notion is not configured. Add NOTION_TOKEN on the server." };
  }
  if (!parentPageId) {
    return {
      ok: false,
      status: 400,
      message: "Notion is not configured. Add NOTION_PARENT_PAGE_ID on the server.",
    };
  }

  const mapped = mapNoteDocument(input.document);
  const fetchImpl = input.fetch ?? fetch;
  let apiBlocks: NotionBlock[];
  try {
    apiBlocks = asNotionBlocks(await attachImages(mapped.blocks, input.storage, token, fetchImpl));
  } catch (error) {
    return { ok: false, status: statusFor(error), message: publicMessage(error, token) };
  }

  const [first, ...rest] = chunkBlocks(apiBlocks, ARRAY_LIMIT);
  const createBody: Record<string, unknown> = {
    parent: { page_id: parentPageId },
    properties: {
      title: { title: mapped.title },
    },
  };
  if (first && first.length > 0) createBody.children = first;

  let created: unknown;
  try {
    created = await notionRequest(fetchImpl, token, "/v1/pages", {
      method: "POST",
      json: createBody,
    });
  } catch (error) {
    return { ok: false, status: statusFor(error), message: publicMessage(error, token) };
  }

  const page = readPage(created);
  if (!page) {
    return { ok: false, status: 502, message: "Notion did not return a page URL." };
  }

  try {
    for (const children of rest) {
      await notionRequest(fetchImpl, token, `/v1/blocks/${page.id}/children`, {
        method: "PATCH",
        json: { children },
      });
    }
  } catch (error) {
    return { ok: false, status: statusFor(error), message: publicMessage(error, token) };
  }

  return { ok: true, pageUrl: page.url };
}

function asNotionBlocks(blocks: MappedBlock[]): NotionBlock[] {
  return blocks.map((block) => {
    if (isImagePlaceholder(block)) {
      throw new ExportFailed("An image was not uploaded.", 502);
    }
    return block;
  });
}

async function attachImages(
  blocks: MappedBlock[],
  storage: Storage,
  token: string,
  fetchImpl: typeof fetch,
): Promise<MappedBlock[]> {
  const uploads = new Map<string, string>();
  for (const block of blocks) {
    if (!isImagePlaceholder(block) || uploads.has(block.assetId)) continue;
    uploads.set(block.assetId, await uploadImage(block, storage, token, fetchImpl));
  }
  return blocks.map((block) => {
    if (!isImagePlaceholder(block)) return block;
    const uploadId = uploads.get(block.assetId);
    if (!uploadId) throw new ExportFailed("An image was not uploaded.", 502);
    return imageBlock(uploadId, block.caption);
  });
}

async function uploadImage(
  block: ImagePlaceholder,
  storage: Storage,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const [bytes, info] = await Promise.all([storage.get(block.assetId), storage.stat(block.assetId)]);
  if (!bytes || !info) {
    throw new ExportFailed("A kept image is no longer available. Run the lecture again, then export.", 400);
  }

  const filename = filenameFor(block.assetId, info.contentType);
  let created: unknown;
  try {
    created = await notionRequest(fetchImpl, token, "/v1/file_uploads", {
      method: "POST",
      json: {
        mode: "single_part",
        filename,
        content_type: info.contentType,
      },
    });
  } catch (error) {
    throw new ExportFailed(publicMessage(error, token), statusFor(error));
  }
  const uploadId = readId(created);
  if (!uploadId) throw new ExportFailed("Notion did not accept an image upload.", 502);

  const form = new FormData();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  form.set("file", new Blob([copy], { type: info.contentType }), filename);
  try {
    await notionRequest(fetchImpl, token, `/v1/file_uploads/${uploadId}/send`, {
      method: "POST",
      form,
    });
  } catch (error) {
    throw new ExportFailed(publicMessage(error, token), statusFor(error));
  }
  return uploadId;
}

function imageBlock(uploadId: string, caption: ImagePlaceholder["caption"]): NotionBlock {
  return {
    object: "block",
    type: "image",
    image: {
      type: "file_upload",
      file_upload: { id: uploadId },
      ...(caption.length > 0 ? { caption } : {}),
    },
  };
}

function filenameFor(assetId: string, contentType: string): string {
  const hash = assetId.slice(assetId.lastIndexOf("/") + 1);
  const extension = EXTENSIONS[contentType] ?? "img";
  return `${hash}.${extension}`;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

interface NotionCall {
  method: "POST" | "PATCH";
  json?: unknown;
  form?: FormData;
}

async function notionRequest(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  call: NotionCall,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
  };
  let body: BodyInit | undefined;
  if (call.form) {
    body = call.form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(call.json ?? {});
  }

  let response: Response;
  try {
    response = await fetchImpl(`https://api.notion.com${path}`, {
      method: call.method,
      headers,
      body,
    });
  } catch {
    throw new ExportFailed("Notion could not be reached.", 502);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new ExportFailed(notionMessage(payload, response.status), 502);
  }
  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function notionMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    const message = payload.message.trim();
    if (message.length > 0) return message.slice(0, 500);
  }
  return `Notion returned status ${status}.`;
}

function readId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("id" in payload)) return null;
  return typeof payload.id === "string" && payload.id.length > 0 ? payload.id : null;
}

function readPage(payload: unknown): { id: string; url: string } | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("id" in payload) || typeof payload.id !== "string" || payload.id.length === 0) return null;
  if (!("url" in payload) || typeof payload.url !== "string" || !payload.url.startsWith("https://")) return null;
  return { id: payload.id, url: payload.url };
}

export function normalizeParentPageId(value: string): string | null {
  const trimmed = value.trim();
  const dashed = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (dashed.test(trimmed)) return trimmed.toLowerCase();
  const compact = trimmed.match(/[0-9a-f]{32}/i);
  if (!compact) return null;
  const hex = compact[0].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class ExportFailed extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ExportFailed";
    this.status = status;
  }
}

function statusFor(error: unknown): number {
  if (error instanceof ExportFailed) return error.status;
  return 502;
}

function publicMessage(error: unknown, token: string): string {
  const message = error instanceof Error ? error.message : "Notion rejected the export.";
  const redacted = token.length > 0 ? message.split(token).join("[redacted]") : message;
  return redacted.slice(0, 500);
}
