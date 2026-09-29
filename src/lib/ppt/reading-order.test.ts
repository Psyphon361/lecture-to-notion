import { describe, expect, it } from "vitest";

import { elementsInReadingOrder, slideHeading } from "@/lib/ppt/reading-order";
import type { Slide, SlideElement } from "@/lib/ppt/schema";

describe("reading order", () => {
  it("sorts top to bottom, then left to right, and keeps missing positions last", () => {
    const elements: SlideElement[] = [
      { id: "low-right", type: "text", paragraphs: [{ text: "low", level: 0 }], x: 50, y: 20 },
      { id: "high-right", type: "text", paragraphs: [{ text: "right", level: 0 }], x: 30, y: 10 },
      { id: "high-left", type: "text", paragraphs: [{ text: "left", level: 0 }], x: 5, y: 10 },
      { id: "unplaced", type: "text", paragraphs: [{ text: "later", level: 0 }] },
    ];

    expect(elementsInReadingOrder(elements).map((element) => element.id)).toEqual([
      "high-left",
      "high-right",
      "low-right",
      "unplaced",
    ]);
  });

  it("uses the title, then the first line, then a placeholder label", () => {
    const titled: Slide = {
      slideNumber: 1,
      elements: [
        {
          id: "body",
          type: "text",
          y: 0,
          paragraphs: [{ text: "Body first on the page", level: 0 }],
        },
        {
          id: "title",
          type: "text",
          isTitle: true,
          y: 100,
          paragraphs: [{ text: "  Title line\nrest", level: 0 }],
        },
      ],
    };
    expect(slideHeading(titled)).toBe("Title line");

    const untitled: Slide = {
      slideNumber: 2,
      elements: [
        {
          id: "body",
          type: "text",
          paragraphs: [{ text: "\nFirst real line", level: 0 }],
        },
      ],
    };
    expect(slideHeading(untitled)).toBe("First real line");

    expect(slideHeading({ slideNumber: 3, elements: [] })).toBe("Untitled slide");
  });
});
