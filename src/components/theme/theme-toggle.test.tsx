/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme/theme-toggle";

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
  document.documentElement.classList.remove("dark");
});

describe("theme toggle", () => {
  it("shows an icon and keeps the mode name for screen readers", async () => {
    const container = await render(<ThemeToggle />);
    const button = container.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("Missing theme button");

    expect(button.className).toContain("size-9");
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    expect(button.querySelector("svg.dark\\:hidden")).toBeTruthy();
    expect(button.querySelector("svg.dark\\:block")).toBeTruthy();
    expect(button.textContent).toContain("Switch to dark mode");
    expect(button.textContent).toContain("Switch to light mode");
    for (const label of button.querySelectorAll("span")) {
      expect(label.className).toContain("sr-only");
    }
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

async function render(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  return container;
}
