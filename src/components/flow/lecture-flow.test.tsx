/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LectureFlow } from "@/components/flow/lecture-flow";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const presentation = {
  id: "deck",
  filename: "lecture.pptx",
  slides: [
    {
      slideNumber: 1,
      elements: [
        {
          id: "text-1",
          type: "text",
          paragraphs: [{ text: "Body 1", level: 0 }],
        },
      ],
    },
    {
      slideNumber: 2,
      elements: [
        {
          id: "text-2",
          type: "text",
          paragraphs: [{ text: "Body 2", level: 0 }],
        },
      ],
    },
  ],
};

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("lecture flow", () => {
  it("keeps a failed analysis off the lecture screen and retries the same run", async () => {
    const calls: { url: string; form: boolean; runId?: string }[] = [];
    let analyzeAttempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const form = init?.body instanceof FormData;
      let body: { runId?: string; slide?: { slideNumber: number } } | undefined;
      if (!form && typeof init?.body === "string") {
        body = JSON.parse(init.body) as { runId?: string; slide?: { slideNumber: number } };
      }
      calls.push({ url, form, runId: body?.runId });
      if (url.endsWith("/api/parse")) {
        return json({ ok: true, runId, presentation, warnings: [] });
      }
      if (url.endsWith("/api/analyze-images")) {
        analyzeAttempts += 1;
        if (analyzeAttempts === 1) {
          return json(
            {
              ok: false,
              message: "Gemini is rate limiting image analysis. Wait a moment and try again.",
            },
            429,
          );
        }
        return json({ ok: true, outcomes: [] });
      }
      if (url.endsWith("/api/organize") || url.endsWith("/api/process-slide")) {
        throw new Error(`Unexpected request ${url}`);
      }
      const slideNumber = body?.slide?.slideNumber ?? 1;
      return json({
        slideNumber,
        blocks: [{ type: "paragraph", content: `Note ${slideNumber}` }],
        sourceReferences: [{ slideNumber }],
      });
    });

    const container = await render(<LectureFlow />);
    await chooseFile(container);

    expect(container.textContent).toContain("lecture.pptx");
    expect(container.textContent).toContain(
      "Gemini is rate limiting image analysis. Wait a moment and try again.",
    );
    expect(textButton(container, "Try again")).toBeTruthy();
    expect(textButton(container, "View extracted slides")).toBeTruthy();
    expect(container.textContent).not.toContain("Export to Notion");
    expect(container.textContent).not.toContain("Structuring has not started.");
    expect(container.textContent).not.toContain("1 / 2");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeNull();
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();
    expect(container.querySelector("button[aria-label='Previous slide']")).toBeNull();
    expect(calls.some((call) => call.url.endsWith("/api/organize"))).toBe(false);

    await clickText(container, "View extracted slides");
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).toContain("Body 1");
    expect(container.textContent).not.toContain("Note 1");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeNull();
    expect(container.textContent).not.toContain("Export to Notion");
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();

    await clickText(container, "Try again");
    const active = container.querySelector("[data-deck-section][data-active='true']");
    expect(active?.textContent).toContain("Body 1");
    expect(active?.textContent).not.toContain("Body 2");
    expect(container.querySelector("h2")?.textContent ?? "").not.toMatch(/^Slide \d+/);
    expect(container.querySelector("a[href='#note-section-0']")).toBeNull();
    expect(container.querySelector("a[href='#note-section-1']")).toBeNull();
    expect(container.textContent).toContain("1 / 2");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeTruthy();
    expect(container.textContent).not.toContain("Export to Notion");

    await clickText(container, "Extracted");
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).toContain("Body 1");

    const parses = calls.filter((call) => call.url.endsWith("/api/parse"));
    const analyses = calls.filter((call) => call.url.endsWith("/api/analyze-images"));
    expect(parses).toHaveLength(1);
    expect(parses[0]?.form).toBe(true);
    expect(analyses).toHaveLength(2);
    expect(analyses.every((call) => call.form === false && call.runId === runId)).toBe(true);
    expect(calls.filter((call) => call.url.endsWith("/api/organize"))).toHaveLength(0);
    expect(calls.filter((call) => call.url.endsWith("/api/process-slide"))).toHaveLength(0);
  });

  it("assembles the document locally and does not call organize", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/parse")) {
        return json({ ok: true, runId, presentation, warnings: [] });
      }
      if (url.endsWith("/api/analyze-images")) {
        return json({ ok: true, outcomes: [] });
      }
      throw new Error(`Unexpected request ${url}`);
    });

    const container = await render(<LectureFlow />);
    await chooseFile(container);

    const active = container.querySelector("[data-deck-section][data-active='true']");
    expect(active?.textContent).toContain("Body 1");
    expect(active?.textContent).not.toContain("Body 2");
    expect(container.querySelector("h2")).toBeNull();
    expect(container.textContent).toContain("lecture.pptx");
    expect(container.textContent).toContain("1 / 2");
    expect(container.querySelector("a[href='#note-section-0']")).toBeNull();
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).not.toContain("rate limiting");
    expect(container.textContent).toContain("Organization is done.");
    expect(calls.filter((url) => url.endsWith("/api/organize"))).toHaveLength(0);
    expect(calls.filter((url) => url.endsWith("/api/process-slide"))).toHaveLength(0);
    expect(calls.filter((url) => url.endsWith("/api/parse"))).toHaveLength(1);
  });

  it("builds a text slide and a picture reading locally and does not structure them", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/parse")) {
        return json({ ok: true, runId, presentation: mixedDeck, warnings: [] });
      }
      if (url.endsWith("/api/analyze-images")) {
        return json({
          ok: true,
          outcomes: [
            {
              imageId: "img-1",
              status: "analyzed",
              analysis: {
                imageId: "img-1",
                containsUsefulInformation: true,
                extractedText: "Words in the picture",
                description: "A diagram of the conflict.",
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });

    const container = await render(<LectureFlow />);
    await chooseFile(container);

    expect(container.textContent).toContain("Need and meaning");
    expect(container.textContent).toContain("Conflict on the slide");
    expect(container.textContent).toContain("Words in the picture");
    expect(container.textContent).toContain("A diagram of the conflict.");
    expect(container.textContent).toContain("Structured.");
    expect(container.textContent).toContain("Organization is done.");
    expect(calls.filter((url) => url.endsWith("/api/process-slide"))).toHaveLength(0);
    expect(calls.filter((url) => url.endsWith("/api/analyze-images"))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/api/organize"))).toHaveLength(0);
  });
});

const hash = "a".repeat(64);

const mixedDeck = {
  id: "deck",
  filename: "lecture.pptx",
  slides: [
    {
      slideNumber: 1,
      elements: [
        {
          id: "text-1",
          type: "text",
          isTitle: true,
          paragraphs: [{ text: "Need and meaning", level: 0 }],
        },
        {
          id: "text-body",
          type: "text",
          paragraphs: [{ text: "Conflict on the slide", level: 0, bullet: "bullet" }],
        },
      ],
    },
    {
      slideNumber: 2,
      elements: [
        {
          id: "img-1",
          type: "image",
          assetId: `${runId}/${hash}`,
          contentHash: hash,
          mimeType: "image/png",
        },
      ],
    },
  ],
};

async function render(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  return container;
}

async function chooseFile(container: ParentNode) {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) throw new Error("Missing file input");
  const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "lecture.pptx");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function clickText(container: ParentNode, label: string) {
  const target = textButton(container, label);
  await act(async () => {
    target.click();
  });
  await settle();
}

function textButton(container: ParentNode, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((button) => button.textContent === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${label}`);
  return found;
}

async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
