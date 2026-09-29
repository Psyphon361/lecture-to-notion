import { describe, expect, it } from "vitest";

import { PROMPT_VERSION, slideProcessingPrompt } from "@/lib/ai/prompts/slide-processing";
import type { Slide } from "@/lib/ppt/schema";

const HASH = "cd".repeat(32);

describe("slideProcessingPrompt", () => {
  it("sends native text, bullet kind, and table cells for this slide only", () => {
    const prompt = slideProcessingPrompt({
      slide: textSlide(),
      outcomes: [],
      previousLine: "Previous title only",
      nextLine: "Next first line only",
    });

    expect(PROMPT_VERSION).toBe("slide-processing-v1");
    expect(prompt).toContain("keep every point");
    expect(prompt).toContain("copy terms and numbers as written");
    expect(prompt).toContain("do not summarize the slide away");
    expect(prompt).toContain("slide 4");
    expect(prompt).toContain("Buying process");
    expect(prompt).toContain("text (bullet");
    expect(prompt).toContain("Mutual exclusion");
    expect(prompt).toContain("text (number");
    expect(prompt).toContain("First step");
    expect(prompt).toContain("Term | On the slide");
    expect(prompt).toContain("BBALLB-203 recieve");
    expect(prompt).toContain("Previous title only");
    expect(prompt).toContain("Next first line only");
    expect(prompt).not.toContain("the rest of the previous slide");
    expect(prompt).not.toContain("planted speaker note");
    expect(prompt).not.toContain("run/secret-asset");
  });

  it("sends a picture reading as source, interpretation, and warnings", () => {
    const prompt = slideProcessingPrompt({
      slide: pictureSlide(),
      outcomes: [
        {
          imageId: "s4-img",
          status: "analyzed",
          analysis: {
            imageId: "s4-img",
            containsUsefulInformation: true,
            extractedText: "BBALLB-203 recieve",
            description: "A course code on the slide.",
            relationships: ["The code sits under the heading."],
            uncertainties: ["The last digit is faint."],
          },
        },
      ],
    });

    expect(prompt).toContain("source text: BBALLB-203 recieve");
    expect(prompt).toContain("interpretation: A course code on the slide.");
    expect(prompt).toContain("interpretation: The code sits under the heading.");
    expect(prompt).toContain("uncertainty: The last digit is faint.");
    expect(prompt).not.toContain(HASH);
    expect(prompt).not.toContain("run/secret-asset");
  });

  it("does not send an image reading from another slide", () => {
    const prompt = slideProcessingPrompt({
      slide: pictureSlide(),
      outcomes: [
        {
          imageId: "other-slide",
          status: "analyzed",
          analysis: {
            imageId: "other-slide",
            containsUsefulInformation: true,
            extractedText: "OTHER SLIDE TEXT",
          },
        },
      ],
    });

    expect(prompt).not.toContain("OTHER SLIDE TEXT");
  });

  it("adds no body text for a skipped decorative image", () => {
    const prompt = slideProcessingPrompt({
      slide: pictureSlide(),
      outcomes: [{ imageId: "s4-img", status: "skipped", reason: "Treated as a logo." }],
    });

    expect(prompt).not.toContain("Treated as a logo.");
    expect(prompt).not.toContain("source text:");
    expect(prompt).not.toContain(HASH);
  });

  it("appends the validation error on a repair", () => {
    const prompt = slideProcessingPrompt({
      slide: pictureSlide(),
      outcomes: [],
      validationError: "Expected object, received string",
    });

    expect(prompt).toContain("failed validation");
    expect(prompt).toContain("Expected object, received string");
  });
});

function textSlide(): Slide {
  return {
    slideNumber: 4,
    speakerNotes: "Say this aloud: planted speaker note",
    elements: [
      {
        id: "s4-title",
        type: "text",
        isTitle: true,
        paragraphs: [{ text: "Buying process", level: 0, bullet: "none" }],
      },
      {
        id: "s4-body",
        type: "text",
        paragraphs: [
          { text: "Mutual exclusion", level: 0, bullet: "bullet" },
          { text: "First step", level: 0, bullet: "number" },
        ],
      },
      {
        id: "s4-table",
        type: "table",
        rows: [
          ["Term", "On the slide"],
          ["Code", "BBALLB-203 recieve"],
        ],
      },
    ],
  };
}

function pictureSlide(): Slide {
  return {
    slideNumber: 4,
    elements: [
      {
        id: "s4-img",
        type: "image",
        assetId: "run/secret-asset",
        contentHash: HASH,
        mimeType: "image/png",
      },
    ],
  };
}
