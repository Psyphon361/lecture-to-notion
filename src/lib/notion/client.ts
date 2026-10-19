import { NOTION_VERSION } from "@/lib/notion/adapter";

/**
 * Shared Notion REST plumbing. No OAuth flow, no note mapping.
 * A 401 is kept as 401 so callers can refresh a token or ask the user to reconnect.
 */

export class NotionApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotionApiError";
    this.status = status;
  }
}

export interface NotionRequestInit {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
}

export async function notionFetch(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  call: NotionRequestInit = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
  };

  let body: BodyInit | undefined;
  if (call.form) {
    body = call.form;
  } else if (call.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(call.json);
  }

  let response: Response;
  try {
    response = await fetchImpl(`https://api.notion.com${path}`, {
      method: call.method ?? "GET",
      headers,
      body,
    });
  } catch {
    throw new NotionApiError("Notion could not be reached.", 502);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new NotionApiError(notionMessage(payload, response.status), response.status);
  }
  return payload;
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function notionMessage(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    if ("message" in payload && typeof payload.message === "string") {
      const message = payload.message.trim();
      if (message.length > 0) return message.slice(0, 500);
    }
    if ("error" in payload && typeof payload.error === "string") {
      const description =
        "error_description" in payload && typeof payload.error_description === "string"
          ? `: ${payload.error_description}`
          : "";
      return `${payload.error}${description}`.slice(0, 500);
    }
  }
  return `Notion returned status ${status}.`;
}

/**
 * Remove known secrets and Notion token shapes from a message before it reaches a user or a log.
 * The caller passes the token it holds; patterns cover tokens that arrive in error bodies.
 */
export function redactSecrets(message: string, ...secrets: Array<string | undefined>): string {
  let output = message;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (value) output = output.split(value).join("[redacted]");
  }
  return output
    .replace(/ntn_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/secret_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
}
