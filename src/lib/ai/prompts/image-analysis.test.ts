import { describe, expect, it } from "vitest";

import { PROMPT_VERSION, imageAnalysisPrompt } from "@/lib/ai/prompts/image-analysis";

describe("imageAnalysisPrompt", () => {
  it("asks the model to skip crests and institution banners", () => {
    const prompt = imageAnalysisPrompt();

    expect(PROMPT_VERSION).toBe("image-analysis-v5");
    expect(prompt).toContain("Do not mention spelling");
    expect(prompt).toContain("designed lecture slide");
    expect(prompt).toContain("college crest");
    expect(prompt).toContain("institution name banner");
    expect(prompt).toContain("running header");
    expect(prompt).toContain("extractedText, lines, and description");
    expect(prompt).toContain("title");
    expect(prompt).toContain("heading");
    expect(prompt).toContain("body");
    expect(prompt).toContain("callout");
  });
});
