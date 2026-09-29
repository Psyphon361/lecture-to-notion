import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import { parseUpload } from "@/lib/ppt/parse-upload";
import { createLocalStorage, imageAssetKey, type Storage } from "@/lib/storage/storage";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("parseUpload", () => {
  const fixturePath = path.join(process.cwd(), "fixtures/synthetic.pptx");

  it("stores the synthetic deck in presentation order without image bytes", async () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const zip = await JSZip.loadAsync(bytes);
    const filenameSlide = await zip.file("ppt/slides/slide1.xml")?.async("string");
    expect(filenameSlide).toContain("Second in the deck");

    const root = await tempRoot();
    const storage = createLocalStorage(root);
    const result = await parseUpload(
      { filename: " lectures\\synthetic.pptx ", bytes },
      storage,
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.presentation.filename).toBe("synthetic.pptx");
    expect(result.presentation.title).toBe("Synthetic Lecture");
    expect(result.presentation.slides.map((slide) => slide.slideNumber)).toEqual([1, 2]);

    const first = result.presentation.slides[0];
    const firstText = textOf(first);
    expect(firstText).toContain("First in the deck");
    expect(firstText).toContain("Marketing & behaviour");
    expect(firstText).not.toContain("7");
    expect(first?.speakerNotes).toBe("Keep the first note.");
    expect(first?.speakerNotes).not.toContain("99");

    const numbered = first?.elements.flatMap((element) =>
      element.type === "text"
        ? element.paragraphs.filter((paragraph) => paragraph.bullet === "number")
        : [],
    );
    expect(numbered).toEqual([
      { text: "Brand", level: 0, bullet: "number" },
      { text: "Culture", level: 1, bullet: "number" },
    ]);

    const image = first?.elements.find((element) => element.type === "image");
    expect(image).toMatchObject({
      type: "image",
      mimeType: "image/png",
      altText: "diagram.png",
      x: 100,
      y: 600000,
      width: 300,
      height: 400,
    });
    if (image?.type !== "image") return;
    const key = imageAssetKey(result.runId, image.contentHash);
    expect(image.assetId).toBe(key);
    expect(image.assetId).not.toBe(image.contentHash);
    const stored = await storage.get(key);
    expect(stored).toBeInstanceOf(Uint8Array);
    expect(stored?.byteLength).toBeGreaterThan(0);
    expect(JSON.stringify(result.presentation)).not.toContain("iVBORw0KGgo");

    const second = result.presentation.slides[1];
    expect(textOf(second)).toContain("Second in the deck");
    expect(second?.speakerNotes).toBeUndefined();
    expect(second?.elements.some((element) => element.type === "image")).toBe(false);
  });

  it("returns a user-facing error for a package that is not a presentation", async () => {
    const root = await tempRoot();
    const zip = new JSZip();
    zip.file("hello.txt", "not a presentation");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const result = await parseUpload(
      { filename: "notes.pptx", bytes },
      createLocalStorage(root),
    );

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      reason: "parse",
      message: "That PowerPoint file could not be read.",
    });
    await expect(readdir(path.join(root, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes an image already written when a later save fails", async () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const root = await tempRoot();
    const real = createLocalStorage(root);
    let puts = 0;
    const deleted: string[] = [];
    const storage: Storage = {
      async put(key, body, contentType) {
        puts += 1;
        if (puts > 1) throw new Error("disk full");
        return real.put(key, body, contentType);
      },
      get: (key) => real.get(key),
      stat: (key) => real.stat(key),
      async delete(key) {
        deleted.push(key);
        await real.delete(key);
      },
    };

    const runId = "22222222-2222-4222-8222-222222222222";
    const result = await parseUpload(
      { filename: "synthetic.pptx", bytes },
      storage,
      runId,
    );

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      reason: "storage",
      message: "The slides were read, but an image could not be saved.",
    });
    expect(deleted).toHaveLength(1);
    await expect(readdir(path.join(root, "runs", runId))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  const samplePath = path.join(process.cwd(), "fixtures/private/sample.pptx");

  it.skipIf(!existsSync(samplePath))(
    "parses the private sample into stored images",
    async () => {
      const root = await tempRoot();
      const storage = createLocalStorage(root);
      const result = await parseUpload(
        {
          filename: "sample.pptx",
          bytes: new Uint8Array(readFileSync(samplePath)),
        },
        storage,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const slides = result.presentation.slides;
      expect(slides).toHaveLength(18);
      expect(slides.map((slide) => slide.slideNumber)).toEqual(
        Array.from({ length: 18 }, (_, index) => index + 1),
      );

      const joined = slides
        .flatMap((slide) => slide.elements.map(elementText))
        .join("\n");
      expect(joined).toContain("BBALLB- 203");
      expect(joined).toContain("behaviour");

      expect(
        slides.map(
          (slide) => slide.elements.filter((element) => element.type === "image").length,
        ),
      ).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(
        slides
          .filter((slide) => slide.elements.some((element) => element.type === "image"))
          .map((slide) => slide.slideNumber),
      ).toEqual([1, 5, 9, 10]);

      expect(slides[0]?.speakerNotes).toBe(
        "Presentation slide for courses, classes, lectures et al. ",
      );
      expect(slides.slice(1).every((slide) => slide.speakerNotes === undefined)).toBe(true);

      const images = slides.flatMap((slide) =>
        slide.elements.filter((element) => element.type === "image"),
      );
      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        if (image.type !== "image") continue;
        expect(image.assetId).toBe(imageAssetKey(result.runId, image.contentHash));
        const stored = await storage.get(image.assetId);
        expect(stored?.byteLength).toBeGreaterThan(0);
      }
      expect(JSON.stringify(result)).not.toMatch(/"bytes"/);
    },
  );
});

function textOf(slide: { elements: { type: string; paragraphs?: { text: string }[] }[] } | undefined): string {
  return (slide?.elements ?? [])
    .flatMap((element) =>
      element.type === "text" ? (element.paragraphs ?? []).map((paragraph) => paragraph.text) : [],
    )
    .join("\n");
}

function elementText(element: {
  type: string;
  paragraphs?: { text: string }[];
  text?: string;
  rows?: string[][];
}): string {
  if (element.type === "text") {
    return (element.paragraphs ?? []).map((paragraph) => paragraph.text).join("\n");
  }
  if (element.type === "shape") return element.text ?? "";
  if (element.type === "table") return (element.rows ?? []).flat().join("\n");
  return "";
}

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lecture-parse-"));
  directories.push(dir);
  return dir;
}
