/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ProcessingStatus } from "@/components/processing/processing-status";
import { SlideWorkspace } from "@/components/review/slide-workspace";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";
import {
  initialStages,
  stagesAfterExtract,
  stagesAfterOrganize,
  stagesAfterOrganizeFailed,
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

    expect(position(container)).toBe("1 / 3");
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();
    expect(container.textContent).toContain("Note 1");
    expect(container.textContent).not.toContain("Note 2");
    expect(container.textContent).not.toContain("Note 3");
    expect(container.textContent).not.toContain("Export to Notion");
    expect(button(container, "Previous slide").disabled).toBe(true);
    expect(button(container, "Next slide").disabled).toBe(false);

    await click(container, "Next slide");
    expect(position(container)).toBe("2 / 3");
    expect(container.textContent).toContain("Note 2");
    expect(container.textContent).not.toContain("Note 1");

    await click(container, "Next slide");
    expect(position(container)).toBe("3 / 3");
    expect(button(container, "Next slide").disabled).toBe(true);

    await click(container, "Next slide");
    expect(position(container)).toBe("3 / 3");

    await click(container, "Previous slide");
    await click(container, "Previous slide");
    expect(position(container)).toBe("1 / 3");
    expect(button(container, "Previous slide").disabled).toBe(true);

    await click(container, "Previous slide");
    expect(position(container)).toBe("1 / 3");
  });

  it("disables previous and next on a one-slide deck", async () => {
    const container = await renderWorkspace(1);
    expect(position(container)).toBe("1 / 1");
    expect(button(container, "Previous slide").disabled).toBe(true);
    expect(button(container, "Next slide").disabled).toBe(true);
  });

  it("hides notes and shows the extracted slide when notes are absent", async () => {
    const container = await render(
      <SlideWorkspace presentation={deck(3)} outcomes={[]} />,
    );
    expect(position(container)).toBe("1 / 3");
    expect(container.textContent).toContain("Body 1");
    expect(container.textContent).not.toContain("Body 2");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeNull();
    expect(container.textContent).not.toContain("Structuring has not started.");
    expect(container.textContent).not.toContain("Export to Notion");
    expect(container.querySelector("[aria-label='Slides']")).toBeNull();

    await click(container, "Next slide");
    expect(position(container)).toBe("2 / 3");
    expect(container.textContent).toContain("Body 2");
    expect(container.textContent).not.toContain("Body 1");
  });

  it("shows notes and does not offer an extracted tab", async () => {
    const container = await renderWorkspace(3);
    expect(container.textContent).toContain("Note 1");
    expect(container.textContent).not.toContain("Body 1");
    expect(container.textContent).not.toContain("What was extracted");
    expect(container.querySelector("[aria-label='Slide 1 notes']")).toBeNull();
    expect(container.querySelector("[aria-label='Slide 1 extracted']")).toBeNull();
    expect(buttonText(container, "Notes")).toBeNull();
    expect(buttonText(container, "Extracted")).toBeNull();
  });

  it("ignores arrow keys while a text field is focused", async () => {
    const container = await renderWorkspace(3);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(position(container)).toBe("1 / 3");

    input.blur();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(position(container)).toBe("2 / 3");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 / 3");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 / 3");
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

    const organized = await render(
      <ProcessingStatus compact stages={stagesAfterOrganize()} />,
    );
    expect(organized.textContent).toBe("Structured. Organization is done.");

    const failed = await render(
      <ProcessingStatus compact stages={stagesAfterOrganizeFailed()} />,
    );
    expect(failed.textContent).toBe("Structured. Organization failed.");
  });

  it("shows one notes document one slide at a time", async () => {
    const container = await render(
      <SlideWorkspace
        presentation={deck(2)}
        notes={draftNotes(2)}
        outcomes={[]}
        noteDocument={organizedDocument()}
      />,
    );

    expect(container.textContent).toContain("lecture.pptx");
    expect(container.textContent).not.toContain("Lecture notes");
    expect(container.querySelector("a[href='#note-section-0']")).toBeNull();
    expect(container.querySelectorAll("[data-deck-section][data-active='true']")).toHaveLength(1);
    expect(activeSection(container).textContent).toContain("Opening");
    expect(activeSection(container).textContent).toContain("Note 1");
    expect(activeSection(container).textContent).not.toContain("Note 2");
    expect(position(container)).toBe("1 / 2");
    expect(button(container, "Previous slide").disabled).toBe(true);

    await click(container, "Next slide");
    expect(position(container)).toBe("2 / 2");
    expect(activeSection(container).textContent).toContain("Closing");
    expect(activeSection(container).textContent).toContain("Note 2");
    expect(activeSection(container).textContent).not.toContain("Note 1");
    expect(buttonText(container, "Notes")).toBeNull();
    expect(buttonText(container, "Extracted")).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(position(container)).toBe("1 / 2");
    expect(activeSection(container).textContent).toContain("Note 1");
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
  const match = container.textContent?.match(/\d+ \/ \d+/);
  return match?.[0] ?? "";
}

function activeSection(container: ParentNode): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-deck-section][data-active='true']");
  if (!found) throw new Error("Missing active section");
  return found;
}

function buttonText(container: ParentNode, label: string): HTMLButtonElement | null {
  const found = [...container.querySelectorAll("button")].find((button) => button.textContent === label);
  return found instanceof HTMLButtonElement ? found : null;
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

function organizedDocument(): NoteDocument {
  return {
    title: "Lecture notes",
    sections: [
      {
        heading: "Opening",
        level: 1,
        blocks: [{ type: "paragraph", content: "Note 1", provenance: "source" }],
      },
      {
        heading: "Closing",
        level: 2,
        blocks: [{ type: "paragraph", content: "Note 2", provenance: "source" }],
      },
    ],
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
