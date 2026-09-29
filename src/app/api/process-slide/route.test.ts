import { afterEach, describe, expect, it, vi } from "vitest";

import { handleProcessSlide } from "@/app/api/process-slide/route";
import { GeminiCallError, MissingGeminiKeyError } from "@/lib/ai/gemini";
import type { SlideContext } from "@/lib/ai/provider";
import type { SlideNotes } from "@/lib/documents/schema";
import type { Slide } from "@/lib/ppt/schema";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/process-slide", () => {
  it("returns notes for one slide and drops image bytes", async () => {
    const seen: SlideContext[] = [];
    const response = await handleProcessSlide(jsonRequest(requestBody()), async (input) => {
      seen.push(input);
      return notes(4);
    });
    const payload = (await response.json()) as SlideNotes;

    expect(response.status).toBe(200);
    expect(payload).toEqual(notes(4));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.slide.slideNumber).toBe(4);
    expect(seen[0]?.previousLine).toBe("Previous title");
    expect(seen[0]?.nextLine).toBe("Next line");
    expect(JSON.stringify(seen[0])).not.toContain("iVBORw0KGgo");
    expect(JSON.stringify(payload)).not.toContain("iVBORw0KGgo");
  });

  it("rejects a whole deck", async () => {
    let calls = 0;
    const response = await handleProcessSlide(
      jsonRequest({
        slides: [textSlide(1, "One"), textSlide(2, "Two")],
        outcomes: [],
      }),
      async () => {
        calls += 1;
        return notes(1);
      },
    );
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("turns a missing key, a rate limit, and a server error into a visible failure", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    const missing = await handleProcessSlide(jsonRequest(requestBody()), async () => {
      throw new MissingGeminiKeyError();
    });
    const limited = await handleProcessSlide(jsonRequest(requestBody()), async () => {
      throw new GeminiCallError(429);
    });
    const unavailable = await handleProcessSlide(jsonRequest(requestBody()), async () => {
      throw new GeminiCallError(503);
    });

    expect(missing.status).toBe(500);
    expect(((await missing.json()) as { message: string }).message).toMatch(/API key/);
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { message: string }).message).toMatch(/rate limiting/);
    expect(unavailable.status).toBe(502);
    expect(((await unavailable.json()) as { message: string }).message).toMatch(/could not structure/);
    expect(JSON.stringify(logs)).not.toContain("Buying process");
    expect(logs.join("\n")).not.toContain("GEMINI_API_KEY");
  });
});

function requestBody(): Record<string, unknown> {
  return {
    slide: {
      ...textSlide(4, "Buying process"),
      elements: [
        ...textSlide(4, "Buying process").elements,
        {
          id: "s4-img",
          type: "image",
          assetId: "run/hash",
          contentHash: "c".repeat(64),
          mimeType: "image/png",
          bytes: "iVBORw0KGgo",
        },
      ],
    },
    outcomes: [],
    previousLine: "Previous title",
    nextLine: "Next line",
  };
}

function textSlide(slideNumber: number, title: string): Slide {
  return {
    slideNumber,
    elements: [
      {
        id: `s${slideNumber}-title`,
        type: "text",
        isTitle: true,
        paragraphs: [{ text: title, level: 0, bullet: "none" }],
      },
    ],
  };
}

function notes(slideNumber: number): SlideNotes {
  return {
    slideNumber,
    title: "Buying process",
    blocks: [{ type: "paragraph", content: "Kept as written", provenance: "source" }],
    sourceReferences: [{ slideNumber }],
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/process-slide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
