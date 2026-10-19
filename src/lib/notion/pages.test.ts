import { describe, expect, it } from "vitest";

import {
  listAccessiblePages,
  mapSearchResults,
  readPageTitle,
  selectExportParent,
} from "@/lib/notion/pages";

const pageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("mapSearchResults", () => {
  it("keeps pages, reads the title property, and falls back to Untitled", () => {
    const pages = mapSearchResults({
      results: [
        {
          object: "page",
          id: pageId,
          url: "https://www.notion.so/Lecture-Notes",
          properties: {
            Name: {
              type: "title",
              title: [{ plain_text: "Lecture" }, { plain_text: " Notes" }],
            },
          },
        },
        {
          object: "page",
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          properties: { Name: { type: "rich_text", rich_text: [] } },
        },
        { object: "database", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        { object: "page", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: [{ plain_text: "Top level" }] },
      ],
    });

    expect(pages).toEqual([
      {
        id: pageId,
        title: "Lecture Notes",
        url: "https://www.notion.so/Lecture-Notes",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Untitled",
        url: `https://www.notion.so/${"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".replaceAll("-", "")}`,
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        title: "Top level",
        url: `https://www.notion.so/${"dddddddd-dddd-4ddd-8ddd-dddddddddddd".replaceAll("-", "")}`,
      },
    ]);
  });

  it("returns an empty list for a malformed payload", () => {
    expect(mapSearchResults(null)).toEqual([]);
    expect(mapSearchResults({ results: "nope" })).toEqual([]);
  });

  it("reads a title array directly", () => {
    expect(readPageTitle({ title: [{ plain_text: "Direct" }] })).toBe("Direct");
    expect(readPageTitle({})).toBe("Untitled");
  });
});

describe("listAccessiblePages", () => {
  it("asks search for pages and returns the mapped list", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const pages = await listAccessiblePages("token", async (input, init) => {
      request = { url: String(input), init: init ?? {} };
      return jsonResponse({
        results: [
          {
            object: "page",
            id: pageId,
            url: "https://www.notion.so/Lecture",
            properties: {
              title: { type: "title", title: [{ plain_text: "Lecture" }] },
            },
          },
        ],
      });
    });

    expect(pages).toEqual([
      { id: pageId, title: "Lecture", url: "https://www.notion.so/Lecture" },
    ]);
    expect(request?.url).toBe("https://api.notion.com/v1/search");
    expect(new Headers(request?.init.headers).get("authorization")).toBe(
      "Bearer token",
    );
    expect(JSON.parse(String(request?.init.body))).toEqual({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
    });
  });
});

describe("selectExportParent", () => {
  const page = (id: string, parentPageId?: string) => ({
    id,
    title: id,
    url: `https://www.notion.so/${id}`,
    ...(parentPageId ? { parentPageId } : {}),
  });

  it("picks the selected page, not its children", () => {
    const pages = [page("child-1", "root"), page("root"), page("child-2", "child-1")];
    expect(selectExportParent(pages)?.id).toBe("root");
  });

  it("treats a page under an unshared parent as a root", () => {
    expect(selectExportParent([page("a", "not-shared")])?.id).toBe("a");
  });

  it("returns null when nothing is shared", () => {
    expect(selectExportParent([])).toBeNull();
  });
});

describe("mapSearchResults parent", () => {
  it("reads the parent page id", () => {
    const [mapped] = mapSearchResults({
      results: [{ object: "page", id: pageId, parent: { type: "page_id", page_id: "p-1" } }],
    });
    expect(mapped?.parentPageId).toBe("p-1");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
