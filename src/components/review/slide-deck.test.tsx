/**
 * @vitest-environment happy-dom
 */
import { act, useState, type ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { contentFit, SlideDeck } from "@/components/review/slide-deck";
import type { NoteDocument } from "@/lib/documents/schema";

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
});

describe("contentFit", () => {
  it("leaves a short slide at full size", () => {
    expect(contentFit(400, 180)).toEqual({ scale: 1, height: 180 });
  });

  it("shrinks a tall slide to the open pane", () => {
    expect(contentFit(250, 500)).toEqual({ scale: 0.5, height: 250 });
  });
});

describe("slide deck", () => {
  it("moves one section at a time, clamps, and shows only the active section", async () => {
    const container = await render(<DeckHarness />);

    expect(position(container)).toBe("1 / 3");
    expect(container.querySelectorAll("[data-deck-section][data-active='true']")).toHaveLength(1);
    expect(active(container).textContent).toContain("Alpha");
    expect(active(container).textContent).not.toContain("Beta");
    expect(active(container).textContent).not.toContain("Gamma");
    expect(active(container).querySelector("h2")).toBeNull();
    expect(button(container, "Previous slide").disabled).toBe(true);

    await click(container, "Next slide");
    expect(position(container)).toBe("2 / 3");
    expect(container.querySelectorAll("[data-deck-section][data-active='true']")).toHaveLength(1);
    expect(active(container).textContent).toContain("Beta");
    expect(active(container).querySelector("h2")?.textContent).toBe("Course Outcomes (COs) Alignment");
    expect(active(container).textContent).not.toContain("Alpha");

    await click(container, "Next slide");
    expect(position(container)).toBe("3 / 3");
    expect(button(container, "Next slide").disabled).toBe(true);
    expect(active(container).textContent).toContain("Gamma");

    await click(container, "Next slide");
    expect(position(container)).toBe("3 / 3");

    await click(container, "Previous slide");
    await click(container, "Previous slide");
    expect(position(container)).toBe("1 / 3");
    expect(button(container, "Previous slide").disabled).toBe(true);

    await click(container, "Previous slide");
    expect(position(container)).toBe("1 / 3");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(position(container)).toBe("2 / 3");
    expect(active(container).textContent).toContain("Beta");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 / 3");
  });
});

function DeckHarness() {
  const [index, setIndex] = useState(0);
  return (
    <SlideDeck filename="lecture.pptx" document={threeSections()} index={index} onIndexChange={setIndex} />
  );
}

function threeSections(): NoteDocument {
  return {
    title: "Lecture notes",
    sections: [
      {
        heading: "Slide 1",
        level: 1,
        blocks: [{ type: "paragraph", content: "Alpha", provenance: "source" }],
      },
      {
        heading: "Course Outcomes (COs) Alignment",
        level: 1,
        blocks: [{ type: "paragraph", content: "Beta", provenance: "source" }],
      },
      {
        heading: "Slide 3",
        level: 1,
        blocks: [{ type: "paragraph", content: "Gamma", provenance: "source" }],
      },
    ],
  };
}

async function render(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  return container;
}

function position(container: ParentNode): string {
  const match = container.textContent?.match(/\d+ \/ \d+/);
  return match?.[0] ?? "";
}

function active(container: ParentNode): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-deck-section][data-active='true']");
  if (!found) throw new Error("Missing active section");
  return found;
}

function button(container: ParentNode, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

async function click(container: ParentNode, label: string) {
  await act(async () => {
    button(container, label).click();
  });
}
