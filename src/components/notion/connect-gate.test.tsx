/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectGate } from "@/components/notion/connect-gate";
import type { NotionStatus } from "@/lib/notion/contracts";

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("ConnectGate", () => {
  it("unlocks the upload step for a connected workspace", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse(status(true)));
    const container = await render(<ConnectGate initialStatus={status(true)} />);

    expect(container.textContent).not.toContain("Checking");
    const link = container.querySelector("a[href='/app']");
    expect(link?.textContent).toBe("Continue to upload");
    expect(container.querySelector("button:disabled")).toBeNull();
  });

  it("keeps the upload step locked until a connection exists", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse(status(false)));
    const container = await render(<ConnectGate initialStatus={status(false)} />);

    expect(container.textContent).not.toContain("Checking");
    expect(container.querySelector("a[href='/app']")).toBeNull();
    expect(container.querySelector("a[href='/api/notion/oauth/start']")?.textContent).toBe(
      "Connect Notion",
    );
    expect(container.querySelector("button:disabled")?.textContent).toBe(
      "Continue to upload",
    );
  });

  it("shows an error instead of staying on the checking line when status fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });

    const container = await render(<ConnectGate initialStatus={status(true)} />);
    await settle();

    expect(container.textContent).not.toContain("Checking");
    expect(container.textContent).toContain("Could not check the Notion connection.");
    expect(container.querySelector("a[href='/app']")).not.toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function status(connected: boolean): NotionStatus {
  return {
    ok: true,
    oauthConfigured: true,
    connected,
    mode: connected ? "token" : "none",
    workspaceName: null,
    parentPageId: connected ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    needsParentPage: false,
    canPickParent: false,
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

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
