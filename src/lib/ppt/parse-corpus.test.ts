import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { parsePptx } from "@/lib/ppt/parse-pptx";
import type { Slide } from "@/lib/ppt/schema";

/**
 * Each deck is checked against its own package.
 * These tests skip when the file is absent, and they do not paste slide text.
 */

const PRIVATE = path.join(process.cwd(), "fixtures/private");

const JUVENILE_NAMES = [
  "Juvenile_Justice_and_Child_Rights.pptx",
  "Juvenile_Justice_and_ChildRights.pptx",
] as const;

const juvenileName =
  JUVENILE_NAMES.find((name) => existsSync(path.join(PRIVATE, name))) ??
  JUVENILE_NAMES[0];

const PICTURE_DECKS = [
  "4.6 Transnational Organised Crime.pptx",
  "5.1 Victimology Meaning and Scope.pptx",
  "5.11 Judicial Trends in Victim Compensation.pptx",
  "5.8 Victimisation Meaning and Types.pptx",
  juvenileName,
] as const;

const CHILD = "child-conflict-need-meaning.pptx";
const SAMPLE = "sample.pptx";

describe("private corpus", () => {
  for (const filename of PICTURE_DECKS) {
    const filePath = path.join(PRIVATE, filename);
    it.skipIf(!existsSync(filePath))(
      filename,
      async () => {
        const { pkg, slides } = await parseFile(filename);
        expect(slides).toHaveLength(pkg.length);
        expect(pkg.length).toBeGreaterThan(0);

        for (const [index, source] of pkg.entries()) {
          const slide = slides[index];
          expect(source.hasNativeText).toBe(false);
          expect(source.pictures.map((picture) => picture.extension)).toEqual(["png"]);
          expect(source.tables).toEqual([]);
          expect(source.notes).toBeUndefined();
          expect(slide?.elements.map((element) => element.type)).toEqual(["image"]);
          expect(slideText(slide)).toBe("");
          expect(slide?.speakerNotes).toBeUndefined();
          expectMatchesSlide(slide, source);
        }
      },
      120_000,
    );
  }

  const childPath = path.join(PRIVATE, CHILD);

  it.skipIf(!existsSync(childPath))(
    CHILD,
    async () => {
      const { pkg, slides } = await parseFile(CHILD);
      expect(pkg).toHaveLength(35);
      expect(slides).toHaveLength(35);
      expect(pkg.reduce((count, source) => count + source.tables.length, 0)).toBe(2);

      for (const [index, source] of pkg.entries()) {
        expect(source.notes).toBeDefined();
        expectMatchesSlide(slides[index], source);
      }
    },
    60_000,
  );

  const samplePath = path.join(PRIVATE, SAMPLE);

  it.skipIf(!existsSync(samplePath))(
    SAMPLE,
    async () => {
      const { pkg, slides } = await parseFile(SAMPLE);
      expect(pkg.length).toBeGreaterThan(0);
      expect(slides).toHaveLength(pkg.length);
      for (const [index, source] of pkg.entries()) {
        expectMatchesSlide(slides[index], source);
      }
    },
    60_000,
  );
});

interface PackagePicture {
  extension: string;
  sha256: string;
  altText?: string;
}

interface PackageSlide {
  pictures: PackagePicture[];
  hasNativeText: boolean;
  tables: string[][][];
  /** Body text when a notes part exists and is non-blank. */
  notes: string | undefined;
}

async function parseFile(filename: string): Promise<{
  pkg: PackageSlide[];
  slides: Slide[];
}> {
  const bytes = new Uint8Array(readFileSync(path.join(PRIVATE, filename)));
  const pkg = await readPackage(bytes);
  const result = await parsePptx({ filename, bytes, id: "corpus" });
  expect(result.presentation.slides.map((slide) => slide.slideNumber)).toEqual(
    pkg.map((_, index) => index + 1),
  );
  return { pkg, slides: result.presentation.slides };
}

function expectMatchesSlide(slide: Slide | undefined, source: PackageSlide): void {
  expect(slide?.speakerNotes).toBe(source.notes);

  const images = slide?.elements.filter((element) => element.type === "image") ?? [];
  expect(images).toHaveLength(source.pictures.length);
  images.forEach((image, index) => {
    if (image.type !== "image") return;
    const picture = source.pictures[index];
    expect(image.mimeType).toBe(mimeFor(picture?.extension ?? ""));
    expect(image.contentHash).toBe(picture?.sha256);
    expect(image.assetId).toBe(image.contentHash);
    expect(image.altText).toBe(picture?.altText);
  });

  const tables =
    slide?.elements.flatMap((element) => (element.type === "table" ? [element.rows] : [])) ??
    [];
  expect(tables).toEqual(source.tables);
}

function slideText(slide: Slide | undefined): string {
  return (slide?.elements ?? [])
    .flatMap((element) => {
      if (element.type === "text") return element.paragraphs.map((paragraph) => paragraph.text);
      if (element.type === "shape") return [element.text ?? ""];
      if (element.type === "table") return element.rows.flat();
      return [];
    })
    .join("");
}

async function readPackage(bytes: Uint8Array): Promise<PackageSlide[]> {
  const zip = await JSZip.loadAsync(bytes);
  const presentation = await partText(zip, "ppt/presentation.xml");
  const rels = await partText(zip, "ppt/_rels/presentation.xml.rels");
  const slideRels = relationshipMap(rels);
  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(
    (match) => match[1],
  );

  const slides: PackageSlide[] = [];
  for (const slideId of slideIds) {
    const target = slideRels.get(slideId ?? "");
    if (!target) throw new Error("Slide relationship is missing.");
    const slidePath = resolvePart("ppt", target.target);
    const xml = await partText(zip, slidePath);
    const relPath = `${slidePath.slice(0, slidePath.lastIndexOf("/"))}/_rels/${path.posix.basename(slidePath)}.rels`;
    const slideRelXml = zip.file(relPath) ? await partText(zip, relPath) : "";
    const relMap = relationshipMap(slideRelXml);
    slides.push({
      pictures: await picturesOf(zip, xml, relMap, slidePath),
      hasNativeText: hasNativeText(xml),
      tables: tablesOf(xml),
      notes: await notesOf(zip, relMap, slidePath),
    });
  }
  return slides;
}

async function picturesOf(
  zip: JSZip,
  slideXml: string,
  rels: Map<string, Relationship>,
  slidePath: string,
): Promise<PackagePicture[]> {
  const pictures = [...slideXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)].map(
    (match) => match[0],
  );
  const found: PackagePicture[] = [];
  for (const picture of pictures) {
    const embed = picture.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
    const target = embed ? rels.get(embed)?.target : undefined;
    if (!target) throw new Error("Picture relationship is missing.");
    const mediaPath = resolvePart(slidePath.slice(0, slidePath.lastIndexOf("/")), target);
    const file = zip.file(mediaPath);
    if (!file) throw new Error("Picture part is missing.");
    const media = new Uint8Array(await file.async("uint8array"));
    const cNvPr = picture.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? "";
    const descr = attr(cNvPr, "descr");
    found.push({
      extension: mediaPath.split(".").pop()?.toLowerCase() ?? "",
      sha256: createHash("sha256").update(media).digest("hex"),
      ...(descr ? { altText: descr } : {}),
    });
  }
  return found;
}

async function notesOf(
  zip: JSZip,
  rels: Map<string, Relationship>,
  slidePath: string,
): Promise<string | undefined> {
  const notesTarget = [...rels.values()].find((relationship) =>
    relationship.type.endsWith("/notesSlide"),
  );
  if (!notesTarget) return undefined;
  const notesPath = resolvePart(
    slidePath.slice(0, slidePath.lastIndexOf("/")),
    notesTarget.target,
  );
  const xml = await partText(zip, notesPath);
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map((match) => match[0]);
  const body = shapes.find((shape) => /<p:ph\b[^>]*\btype="body"/.test(shape));
  const text = body ? textBody(body) : "";
  return text.trim().length > 0 ? text : undefined;
}

function tablesOf(slideXml: string): string[][][] {
  return [...slideXml.matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/g)].map((table) =>
    [...table[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((row) =>
      [...row[0].matchAll(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g)].map((cell) => cellText(cell[0])),
    ),
  );
}

function cellText(cellXml: string): string {
  const open = cellXml.slice(0, cellXml.indexOf(">"));
  if (isSpanned(open)) return "";
  return textBody(cellXml);
}

function textBody(xml: string): string {
  // Notes and slide shapes use p:txBody. Table cells use a:txBody.
  const body =
    xml.match(/<p:txBody\b[\s\S]*?<\/p:txBody>/)?.[0] ??
    xml.match(/<a:txBody\b[\s\S]*?<\/a:txBody>/)?.[0] ??
    "";
  const paragraphs = [...body.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((match) =>
    inlineText(match[0]),
  );
  return paragraphs.join("\n").replaceAll("\u000b", "\n");
}

function inlineText(paragraphXml: string): string {
  const withoutProps = paragraphXml
    .replace(/<a:pPr\b[\s\S]*?<\/a:pPr>/g, "")
    .replace(/<a:endParaRPr\b[\s\S]*?\/>/g, "");
  let text = "";
  const token = /<a:br\b[^>]*\/>|<a:br\b[^>]*>[\s\S]*?<\/a:br>|<a:t\b[^>]*>([^<]*)<\/a:t>/g;
  for (const match of withoutProps.matchAll(token)) {
    if (match[0].startsWith("<a:br")) text += "\n";
    else text += decodeXml(match[1] ?? "");
  }
  return text;
}

function hasNativeText(slideXml: string): boolean {
  return [...slideXml.matchAll(/<a:t\b[^>]*>([^<]*)<\/a:t>/g)].some(
    (match) => decodeXml(match[1] ?? "").trim().length > 0,
  );
}

function isSpanned(openTag: string): boolean {
  const horizontal = openTag.match(/\bhMerge="([^"]+)"/)?.[1];
  const vertical = openTag.match(/\bvMerge="([^"]+)"/)?.[1];
  return horizontal === "1" || horizontal === "true" || vertical === "1" || vertical === "true";
}

interface Relationship {
  target: string;
  type: string;
}

function relationshipMap(relsXml: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  for (const tag of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(tag[0], "Id");
    const target = attr(tag[0], "Target");
    const type = attr(tag[0], "Type");
    if (!id || !target || !type) continue;
    map.set(id, { target, type });
  }
  return map;
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeXml(match[1] ?? "") : undefined;
}

function resolvePart(base: string, target: string): string {
  if (target.startsWith("/")) return decodeURIComponent(target.slice(1));
  const parts = `${base}/${target}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  return decodeURIComponent(stack.join("/"));
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function mimeFor(extension: string): string {
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  return `image/${extension}`;
}

async function partText(zip: JSZip, partPath: string): Promise<string> {
  const file = zip.file(partPath);
  if (!file) throw new Error(`Missing package part ${partPath}`);
  return file.async("string");
}
