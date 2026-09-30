import { describe, expect, it } from "vitest";

import { PROMPT_VERSION, noteOrganizationPrompt } from "@/lib/ai/prompts/note-organization";
import type { SlideNotes } from "@/lib/documents/schema";

describe("noteOrganizationPrompt", () => {
  it("sends compact text for every slide and keeps image ids", () => {
    const prompt = noteOrganizationPrompt({ notes: twoSlides() });

    expect(PROMPT_VERSION).toBe("note-organization-v1");
    expect(prompt).toContain("Do not drop a slide");
    expect(prompt).toContain("Do not summarize the lecture away");
    expect(prompt).toContain("paragraph, bullets, numbered, code, table, image, or divider");
    expect(prompt).toContain("Source text stays source");
    expect(prompt).toContain("Interpretation stays interpretation");
    expect(prompt).toContain("Slide 1. Opening");
    expect(prompt).toContain("source: Four conditions");
    expect(prompt).toContain("source bullets:");
    expect(prompt).toContain("Mutual exclusion");
    expect(prompt).toContain("  Nested term");
    expect(prompt).toContain("interpretation: A diagram of the steps");
    expect(prompt).toContain("source image: run/chart Chart of the steps");
    expect(prompt).toContain("Slide 2. Closing");
    expect(prompt).toContain("source code: BBALLB-203 recieve");
    expect(prompt).toContain("Term | On the slide");
    expect(prompt).not.toContain("iVBORw0KGgo");
    expect(prompt).not.toContain("planted warning");
  });

  it("appends only the validation error on a repair", () => {
    const prompt = noteOrganizationPrompt({
      notes: twoSlides(),
      validationError: "Expected string, received number",
    });
    expect(prompt).toContain("failed validation: Expected string, received number");
  });
});

function twoSlides(): SlideNotes[] {
  return [
    {
      slideNumber: 1,
      title: "Opening",
      blocks: [
        { type: "paragraph", content: "Four conditions", provenance: "source" },
        {
          type: "bullets",
          provenance: "source",
          items: [{ text: "Mutual exclusion", children: [{ text: "Nested term" }] }],
        },
        {
          type: "paragraph",
          content: "A diagram of the steps",
          provenance: "interpretation",
        },
        {
          type: "image",
          assetId: "run/chart",
          caption: "Chart of the steps",
          provenance: "source",
        },
      ],
      sourceReferences: [{ slideNumber: 1 }],
      warnings: ["planted warning"],
    },
    {
      slideNumber: 2,
      title: "Closing",
      blocks: [
        { type: "code", content: "BBALLB-203 recieve", provenance: "source" },
        {
          type: "table",
          provenance: "source",
          header: true,
          rows: [
            ["Term", "On the slide"],
            ["Example", "Kept"],
          ],
        },
      ],
      sourceReferences: [{ slideNumber: 2 }],
    },
  ];
}
