/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ProcessingStatus } from "@/components/processing/processing-status";
import { SlideWorkspace } from "@/components/review/slide-workspace";
import type { SlideNotes } from "@/lib/documents/schema";
import {
  initialStages,
  stagesAfterExtract,
  stagesAfterStructure,
  stagesAfterStructureStopped,
} from "@/lib/pipeline/stages";
import type { Presentation } from "@/lib/ppt/schema";

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
});

describe("slide workspace", () => {
  it("moves one slide at a time and clamps at the ends", async () => {
    const container = await renderWorkspace(3);

    expect(position(container)).toBe("1 of 3");
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();
    expect(container.textContent).toContain("Note 1");
    expect(container.textContent).not.toContain("Note 2");
    expect(container.textContent).not.toContain("Note 3");
    expect(container.textContent).not.toContain("Export to Notion");
    expect(button(container, "Previous slide").disabled).toBe(true);
    expect(button(container, "Next slide").disabled).toBe(false);

    await click(container, "Next slide");
    expect(position(container)).toBe("2 of 3");
    expect(container.textContent).toContain("Note 2");
    expect(container.textContent).not.toContain("Note 1");

    await click(container, "Next slide");
    expect(position(container)).toBe("3 of 3");
    expect(button(container, "Next slide").disabled).toBe(true);

    await click(container, "Next slide");
    expect(position(container)).toBe("3 of 3");

    await click(container, "Previous slide");
    await click(container, "Previous slide");
    expect(position(container)).toBe("1 of 3");
    expect(button(container, "Previous slide").disabled).toBe(true);

    await click(container, "Previous slide");
    expect(position(container)).toBe("1 of 3");
  });

  it("disables previous and next on a one-slide deck", async () => {
    const container = await renderWorkspace(1);
    expect(position(container)).toBe("1 of 1");
    expect(button(container, "Previous slide").disabled).toBe(true);
    expect(button(container, "Next slide").disabled).toBe(true);
  });

  it("hides notes and shows the extracted slide when notes are absent", async () => {
    const container = await render(
      <SlideWorkspace presentation={deck(3)} outcomes={[]} />,
    );
    expect(position(container)).toBe("1 of 3");
    expect(container.textContent).toContain("Body 1");
    expect(container.textContent).not.toContain("Body 2");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeNull();
    expect(container.textContent).not.toContain("Structuring has not started.");
    expect(container.textContent).not.toContain("Export to Notion");
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();

    await click(container, "Next slide");
    expect(position(container)).toBe("2 of 3");
    expect(container.textContent).toContain("Body 2");
    expect(container.textContent).not.toContain("Body 1");
  });

  it("switches the open slide between notes and extracted text", async () => {
    const container = await renderWorkspace(3);
    expect(container.textContent).toContain("Note 1");
    expect(container.textContent).not.toContain("Body 1");
    expect(container.textContent).not.toContain("What was extracted");
    expect(container.textContent).not.toContain("Slide notes");

    await click(container, "Slide 1 extracted");
    expect(container.textContent).toContain("Body 1");
    expect(container.textContent).not.toContain("Note 1");
    expect(container.textContent).not.toContain("Body 2");
    expect(container.textContent).not.toContain("Note 2");

    await click(container, "Next slide");
    expect(position(container)).toBe("2 of 3");
    expect(container.textContent).toContain("Body 2");
    expect(container.textContent).not.toContain("Body 1");
  });

  it("ignores arrow keys while a text field is focused", async () => {
    const container = await renderWorkspace(3);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(position(container)).toBe("1 of 3");

    input.blur();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(position(container)).toBe("2 of 3");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 of 3");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 of 3");
  });
});

describe("review status", () => {
  it("collapses the review stage list to one line", async () => {
    const container = await render(
      <ProcessingStatus compact stages={stagesAfterStructure()} />,
    );
    expect(container.textContent).toBe("Structured. Organization has not started.");
    expect(container.querySelector("ol")).toBeNull();

    const stopped = await render(
      <ProcessingStatus compact stages={stagesAfterStructureStopped()} />,
    );
    expect(stopped.textContent).toBe("Structuring stopped. Organization has not started.");

    const extracted = await render(
      <ProcessingStatus compact stages={stagesAfterExtract()} />,
    );
    expect(extracted.textContent).toBe("Extracted. Organization has not started.");
  });

  it("keeps the full stage list on a processing screen", async () => {
    const container = await render(
      <ProcessingStatus
        title="Extracting slides"
        summary="Reading the file."
        stages={initialStages()}
      />,
    );
    expect(container.querySelectorAll("ol li")).toHaveLength(4);
    expect(container.textContent).toContain("Extract slides");
    expect(container.textContent).toContain("Organize notes");
  });
});

async function renderWorkspace(count: number): Promise<HTMLDivElement> {
  return render(
    <SlideWorkspace presentation={deck(count)} notes={draftNotes(count)} outcomes={[]} />,
  );
}

async function render(node: ReactNode): Promise<HTMLDivElement> {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  return container;
}

function position(container: ParentNode): string {
  const match = container.textContent?.match(/\d+ of \d+/);
  return match?.[0] ?? "";
}

function button(container: ParentNode, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

async function click(container: ParentNode, label: string) {
  const target = button(container, label);
  await act(async () => {
    target.click();
  });
}

function deck(count: number): Presentation {
  return {
    id: "deck",
    filename: "lecture.pptx",
    slides: Array.from({ length: count }, (_, index) => {
      const slideNumber = index + 1;
      return {
        slideNumber,
        elements: [
          {
            id: `text-${slideNumber}`,
            type: "text" as const,
            paragraphs: [{ text: `Body ${slideNumber}`, level: 0 }],
          },
        ],
      };
    }),
  };
}

function draftNotes(count: number): SlideNotes[] {
  return Array.from({ length: count }, (_, index) => {
    const slideNumber = index + 1;
    return {
      slideNumber,
      title: `Title ${slideNumber}`,
      blocks: [{ type: "paragraph" as const, content: `Note ${slideNumber}` }],
      sourceReferences: [{ slideNumber }],
    };
  });
}
