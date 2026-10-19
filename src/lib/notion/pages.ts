import { notionFetch } from "@/lib/notion/client";

/**
 * Pages the current connection can see. With OAuth this is whatever the user
 * selected in Notion's page picker; with an internal token it is whatever was shared.
 */

export interface AccessiblePage {
  id: string;
  title: string;
  url: string;
  /** Id of the page this one sits under, when its parent is a page. */
  parentPageId?: string;
}

/**
 * The page the user selected in Notion's consent screen.
 * Notion also returns the children of a selected page, so keep only pages whose
 * parent is not itself in the results. Results are newest-edited first; the first
 * such page wins when several were selected.
 */
export function selectExportParent(pages: AccessiblePage[]): AccessiblePage | null {
  const ids = new Set(pages.map((page) => page.id));
  return pages.find((page) => !page.parentPageId || !ids.has(page.parentPageId)) ?? null;
}

export async function listAccessiblePages(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessiblePage[]> {
  const payload = await notionFetch(fetchImpl, token, "/v1/search", {
    method: "POST",
    json: {
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
    },
  });
  return mapSearchResults(payload);
}

export function mapSearchResults(payload: unknown): AccessiblePage[] {
  if (typeof payload !== "object" || payload === null || !("results" in payload)) {
    return [];
  }
  const results = Array.isArray(payload.results) ? payload.results : [];
  const pages: AccessiblePage[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (typeof result !== "object" || result === null) continue;
    if ("object" in result && result.object !== "page") continue;
    if (!("id" in result) || typeof result.id !== "string" || result.id.length === 0) {
      continue;
    }
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    pages.push({
      id: result.id,
      title: readPageTitle(result),
      url:
        "url" in result && typeof result.url === "string" && result.url.startsWith("https://")
          ? result.url
          : `https://www.notion.so/${result.id.replaceAll("-", "")}`,
      ...readParentPageId(result),
    });
  }
  return pages;
}

export function readPageTitle(page: unknown): string {
  if (typeof page !== "object" || page === null) return "Untitled";

  if ("title" in page && Array.isArray(page.title)) {
    const title = plainText(page.title);
    if (title) return title;
  }

  if ("properties" in page && typeof page.properties === "object" && page.properties !== null) {
    for (const property of Object.values(page.properties)) {
      if (typeof property !== "object" || property === null) continue;
      if ("type" in property && property.type === "title" && "title" in property) {
        const title = Array.isArray(property.title) ? plainText(property.title) : "";
        if (title) return title;
      }
    }
  }

  return "Untitled";
}

function readParentPageId(result: object): { parentPageId?: string } {
  if (!("parent" in result) || typeof result.parent !== "object" || result.parent === null) {
    return {};
  }
  const parent = result.parent;
  return "page_id" in parent && typeof parent.page_id === "string"
    ? { parentPageId: parent.page_id }
    : {};
}

function plainText(items: unknown[]): string {
  return items
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      if ("plain_text" in item && typeof item.plain_text === "string") {
        return [item.plain_text];
      }
      return [];
    })
    .join("")
    .trim();
}
