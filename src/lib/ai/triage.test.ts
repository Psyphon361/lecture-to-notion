import { describe, expect, it } from "vitest";

import { SKIP_REASONS, triageImages, type TriageImage } from "@/lib/ai/triage";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("triageImages", () => {
  it("skips a very small box, an extreme ratio, decorative alt text, and a hash on many slides", () => {
    const skipped = triageImages([
      image({ imageId: "small", width: 1_000_000, height: 1_000_000 }),
      image({ imageId: "banner", width: 16_000_000, height: 2_000_000 }),
      image({
        imageId: "logo-alt",
        width: 8_000_000,
        height: 5_000_000,
        altText: "school logo.png",
      }),
      ...[1, 2, 3, 4].map((slideNumber) =>
        image({
          imageId: `repeat-${slideNumber}`,
          contentHash: HASH_B,
          slideNumber,
          width: 8_000_000,
          height: 5_000_000,
        }),
      ),
    ]);

    expect(skipped.get("small")).toBe(SKIP_REASONS.small);
    expect(skipped.get("banner")).toBe(SKIP_REASONS.aspect);
    expect(skipped.get("logo-alt")).toBe(SKIP_REASONS.alt);
    expect(skipped.get("repeat-1")).toBe(SKIP_REASONS.repeated);
  });

  it("analyzes the same hash twice and does not treat that as a skip", () => {
    const skipped = triageImages([
      image({ imageId: "one", slideNumber: 2, width: 8_000_000, height: 5_000_000 }),
      image({ imageId: "two", slideNumber: 3, width: 8_000_000, height: 5_000_000 }),
    ]);
    expect(skipped.size).toBe(0);
  });

  it("skips the sample logos and keeps the content pictures", () => {
    const skipped = triageImages([
      image({
        imageId: "miet",
        contentHash: "1".repeat(64),
        slideNumber: 1,
        width: 1_920_479,
        height: 2_959_894,
        altText: "MIET_icon.png",
      }),
      image({
        imageId: "shrast",
        contentHash: "2".repeat(64),
        slideNumber: 1,
        width: 653_653,
        height: 400_050,
        altText: "shrast.png",
      }),
      image({
        imageId: "slide-5",
        contentHash: "3".repeat(64),
        slideNumber: 5,
        width: 8_821_882,
        height: 2_427_753,
      }),
      image({
        imageId: "slide-9",
        contentHash: "4".repeat(64),
        slideNumber: 9,
        width: 6_026_460,
        height: 3_435_527,
      }),
      image({
        imageId: "slide-10",
        contentHash: "5".repeat(64),
        slideNumber: 10,
        width: 8_121_811,
        height: 4_997_835,
      }),
    ]);

    expect([...skipped.keys()].sort()).toEqual(["miet", "shrast"]);
    expect(skipped.get("miet")).toBe(SKIP_REASONS.small);
    expect(skipped.get("shrast")).toBe(SKIP_REASONS.small);
  });
});

function image(overrides: Partial<TriageImage> & { imageId: string }): TriageImage {
  return {
    contentHash: HASH_A,
    slideNumber: 1,
    ...overrides,
  };
}
