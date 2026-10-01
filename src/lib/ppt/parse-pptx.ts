import { createHash, randomUUID } from "node:crypto";

import {
  Connector,
  GraphicFrame,
  GroupShape,
  MSO_SHAPE_TYPE,
  Picture,
  PP_PLACEHOLDER,
  Presentation as PptxPresentation,
  Shape,
  nsmap,
  type BaseShape,
  type Paragraph as PptxParagraph,
  type Slide as PptxSlide,
} from "ts-pptx";

import {
  presentationSchema,
  type Presentation,
  type Slide,
  type SlideElement,
  type TextParagraph,
} from "@/lib/ppt/schema";

/**
 * Picture bytes pulled out of the package.
 * `contentHash` is the sha256 hex of those bytes. Image elements use the
 * same value as `assetId` until storage assigns a run-scoped key.
 */
export interface ExtractedImage {
  contentHash: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ParsePptxResult {
  presentation: Presentation;
  warnings: string[];
  images: ExtractedImage[];
}

export class PptxParseError extends Error {
  constructor(
    message = "That PowerPoint file could not be read.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PptxParseError";
  }
}

interface Box {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** Group `a:xfrm`: child coordinates map through chOff/chExt onto off/ext. */
interface GroupFrame {
  offX: number;
  offY: number;
  extX: number;
  extY: number;
  chOffX: number;
  chOffY: number;
  chExtX: number;
  chExtY: number;
}

interface Emitted {
  element: SlideElement;
  shapeId: number;
  fromShapeId?: number;
  toShapeId?: number;
}

interface BuildState {
  slideNumber: number;
  warnings: string[];
  images: Map<string, ExtractedImage>;
  frames: GroupFrame[];
  emitted: Emitted[];
  masterTxStyles: XmlElement | null;
}

/**
 * Read a PPTX package into the canonical `Presentation`.
 * Slides follow `p:sldIdLst` order. Picture bytes stay beside the
 * presentation so the JSON contract does not carry binaries.
 */
export async function parsePptx(input: {
  filename: string;
  bytes: Uint8Array;
  id?: string;
}): Promise<ParsePptxResult> {
  const filename = input.filename.trim();
  if (!filename) {
    throw new PptxParseError("A file name is required.");
  }

  let opened: PptxPresentation;
  try {
    opened = await PptxPresentation.open(input.bytes);
  } catch (error) {
    throw new PptxParseError("That PowerPoint file could not be read.", {
      cause: error,
    });
  }

  const warnings: string[] = [];
  const images = new Map<string, ExtractedImage>();
  const slides: Slide[] = [];
  let slideNumber = 0;

  for (const source of opened.slides) {
    slideNumber += 1;
    slides.push(normalizeSlide(source, slideNumber, warnings, images));
  }

  const presentation = presentationSchema.parse({
    id: input.id?.trim() || randomUUID(),
    filename,
    title: documentTitle(opened),
    slides,
  });

  return {
    presentation,
    warnings,
    images: [...images.values()],
  };
}

function documentTitle(opened: PptxPresentation): string | undefined {
  try {
    const title = opened.coreProperties.title.trim();
    return title.length > 0 ? title : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSlide(
  source: PptxSlide,
  slideNumber: number,
  warnings: string[],
  images: Map<string, ExtractedImage>,
): Slide {
  if (hasPictureBackground(source)) {
    warnings.push(
      `Slide ${slideNumber} has a picture background that is not a picture shape, so it was not extracted.`,
    );
  }

  const state: BuildState = {
    slideNumber,
    warnings,
    images,
    frames: [],
    emitted: [],
    masterTxStyles: masterTxStylesOf(source),
  };
  walkShapes(source.shapes, state);
  linkConnectors(state);

  const slide: Slide = {
    slideNumber,
    elements: state.emitted.map((item) => item.element),
  };
  if (slideIsHidden(source)) slide.hidden = true;
  const notes = speakerNotes(source);
  if (notes !== undefined) slide.speakerNotes = notes;
  return slide;
}

function walkShapes(shapes: Iterable<BaseShape>, state: BuildState): void {
  for (const shape of shapes) {
    try {
      visitShape(shape, state);
    } catch {
      state.warnings.push(
        `Slide ${state.slideNumber} has a shape that could not be read.`,
      );
    }
  }
}

function visitShape(shape: BaseShape, state: BuildState): void {
  if (isSlideNumber(shape)) return;

  if (shape instanceof GroupShape) {
    const frame = readGroupFrame(shape);
    if (!frame) {
      state.warnings.push(
        `Slide ${state.slideNumber} has a group whose child positions could not be mapped onto the slide.`,
      );
      walkShapes(shape.shapes, state);
      return;
    }
    const parent = state.frames;
    state.frames = [...parent, frame];
    walkShapes(shape.shapes, state);
    state.frames = parent;
    return;
  }

  if (shape instanceof Picture) {
    emitPicture(shape, state);
    return;
  }

  if (shape instanceof GraphicFrame) {
    emitGraphicFrame(shape, state);
    return;
  }

  if (shape instanceof Connector) {
    emitConnector(shape, state);
    return;
  }

  if (shape instanceof Shape) {
    emitText(shape, state);
    return;
  }

  state.warnings.push(
    `Slide ${state.slideNumber} has a ${shape.element.localName} shape that was not extracted.`,
  );
}

function emitPicture(shape: Picture, state: BuildState): void {
  let blob: Uint8Array;
  let mimeType: string;
  try {
    const image = shape.image;
    blob = Uint8Array.from(image.blob);
    mimeType = image.contentType;
  } catch {
    state.warnings.push(
      `Slide ${state.slideNumber} has a picture that could not be read.`,
    );
    return;
  }

  const contentHash = createHash("sha256").update(blob).digest("hex");
  if (!state.images.has(contentHash)) {
    state.images.set(contentHash, { contentHash, mimeType, bytes: blob });
  }

  const cropped =
    shape.cropLeft !== 0 ||
    shape.cropTop !== 0 ||
    shape.cropRight !== 0 ||
    shape.cropBottom !== 0;
  const altText = descriptionOf(shape);

  emit(state, shape.shapeId, {
    ...stamp(state),
    type: "image",
    assetId: contentHash,
    contentHash,
    mimeType,
    ...(altText ? { altText } : {}),
    ...(cropped ? { cropped: true } : {}),
    ...positioned(geometry(shape, state.frames)),
  });
}

function emitGraphicFrame(shape: GraphicFrame, state: BuildState): void {
  if (shape.hasTable) {
    let rows: string[][];
    let merged = false;
    try {
      const table = shape.table;
      rows = table.rows.map((row) =>
        row.cells.map((cell) => {
          if (cell.isSpanned) {
            merged = true;
            return "";
          }
          if (cell.spanHeight > 1 || cell.spanWidth > 1) merged = true;
          return cell.text.replaceAll("\u000b", "\n");
        }),
      );
    } catch {
      state.warnings.push(
        `Slide ${state.slideNumber} has a table that could not be read.`,
      );
      return;
    }
    if (merged) {
      state.warnings.push(
        `Slide ${state.slideNumber} has a table with merged cells; spanned cells are left blank.`,
      );
    }
    emit(state, shape.shapeId, {
      ...stamp(state),
      type: "table",
      rows,
      ...positioned(geometry(shape, state.frames)),
    });
    return;
  }

  if (shape.hasChart) {
    state.warnings.push(
      `Slide ${state.slideNumber} has a chart that was not extracted.`,
    );
    return;
  }
  if (shape.hasSmartArt) {
    state.warnings.push(
      `Slide ${state.slideNumber} has SmartArt that was not extracted.`,
    );
    return;
  }
  if (
    shape.shapeType === MSO_SHAPE_TYPE.EMBEDDED_OLE_OBJECT ||
    shape.shapeType === MSO_SHAPE_TYPE.LINKED_OLE_OBJECT
  ) {
    state.warnings.push(
      `Slide ${state.slideNumber} has an embedded object that was not extracted.`,
    );
    return;
  }
  state.warnings.push(
    `Slide ${state.slideNumber} has a drawing that was not extracted.`,
  );
}

function emitConnector(shape: Connector, state: BuildState): void {
  const ends = connectorEnds(shape);
  if (ends.from === undefined && ends.to === undefined) return;
  emit(
    state,
    shape.shapeId,
    {
      ...stamp(state),
      type: "shape",
      shapeType: shape.shapeType,
      ...positioned(geometry(shape, state.frames)),
    },
    ends,
  );
}

function emitText(shape: Shape, state: BuildState): void {
  if (!shape.hasTextFrame) return;
  const listStyle = shape.element.find(nsmap.p, "txBody")?.find(nsmap.a, "lstStyle");
  const paragraphs: TextParagraph[] = [];
  for (const paragraph of shape.textFrame.paragraphs) {
    const text = paragraphText(paragraph);
    const bullet = bulletOf(paragraph, listStyle, state.masterTxStyles);
    if (text.length === 0) continue;
    const bold = paragraphIsFullyBold(paragraph);
    paragraphs.push({
      text,
      level: paragraphLevel(paragraph),
      ...(bullet ? { bullet } : {}),
      ...(bold ? { bold: true } : {}),
    });
  }
  if (paragraphs.length === 0) return;

  emit(state, shape.shapeId, {
    ...stamp(state),
    type: "text",
    paragraphs,
    ...(isTitlePlaceholder(shape) ? { isTitle: true } : {}),
    ...positioned(geometry(shape, state.frames)),
  });
}

function stamp(state: BuildState): { id: string; zIndex: number } {
  const index = state.emitted.length;
  return { id: `s${state.slideNumber}-e${index + 1}`, zIndex: index };
}

function emit(
  state: BuildState,
  shapeId: number,
  element: SlideElement,
  ends?: { from?: number; to?: number },
): void {
  state.emitted.push({
    shapeId,
    fromShapeId: ends?.from,
    toShapeId: ends?.to,
    element,
  });
}

function linkConnectors(state: BuildState): void {
  const ids = new Map(state.emitted.map((item) => [item.shapeId, item.element.id]));
  let unresolved = false;
  for (const item of state.emitted) {
    if (item.element.type !== "shape") continue;
    if (item.fromShapeId !== undefined) {
      const linked = ids.get(item.fromShapeId);
      if (linked) item.element.connectsFrom = linked;
      else unresolved = true;
    }
    if (item.toShapeId !== undefined) {
      const linked = ids.get(item.toShapeId);
      if (linked) item.element.connectsTo = linked;
      else unresolved = true;
    }
  }
  if (unresolved) {
    state.warnings.push(
      `Slide ${state.slideNumber} has a connector whose endpoints were not linked.`,
    );
  }
}

function speakerNotes(slide: PptxSlide): string | undefined {
  if (!slide.hasNotesSlide) return undefined;
  const text = slide.notesSlide.text.replaceAll("\u000b", "\n");
  return text.trim().length > 0 ? text : undefined;
}

function hasPictureBackground(slide: PptxSlide): boolean {
  const background = slide.element.find(nsmap.p, "cSld")?.find(nsmap.p, "bg");
  if (!background) return false;
  return background.findAllDeep(nsmap.a, "blip").length > 0;
}

function slideIsHidden(slide: PptxSlide): boolean {
  const show = slide.element.getAttr("show");
  return show === "0" || show === "false";
}

function isSlideNumber(shape: BaseShape): boolean {
  return (
    shape.isPlaceholder &&
    shape.placeholderFormat.type === PP_PLACEHOLDER.SLIDE_NUMBER
  );
}

function isTitlePlaceholder(shape: BaseShape): boolean {
  if (!shape.isPlaceholder) return false;
  const type = shape.placeholderFormat.type;
  return type === PP_PLACEHOLDER.TITLE || type === PP_PLACEHOLDER.CENTER_TITLE;
}

function descriptionOf(shape: BaseShape): string | undefined {
  const descr = shape.element.childElements[0]
    ?.find(nsmap.p, "cNvPr")
    ?.getAttr("descr");
  return descr && descr.length > 0 ? descr : undefined;
}

type XmlElement = {
  find: (ns: (typeof nsmap)[keyof typeof nsmap], name: string) => XmlElement | null | undefined;
};

function masterTxStylesOf(slide: PptxSlide): XmlElement | null {
  try {
    return slide.slideLayout.slideMaster.element.find(nsmap.p, "txStyles") ?? null;
  } catch {
    return null;
  }
}

/**
 * `buNone` / `buChar` / `buAutoNum` on paragraph `pPr`, then on shape `lstStyle`,
 * then on slide-master `p:txStyles` (`bodyStyle`, then `otherStyle`) for this level.
 * `alphaLcPeriod` and every other autonum type are `number`.
 * Explicit `buNone` on the paragraph wins over inherited bullets.
 */
function bulletOf(
  paragraph: PptxParagraph,
  listStyle?: XmlElement | null,
  masterTxStyles?: XmlElement | null,
): TextParagraph["bullet"] | undefined {
  const properties = paragraph.element.find(nsmap.a, "pPr");
  const own = bulletFromProperties(properties);
  if (own !== undefined) return own;
  const level = paragraphLevel(paragraph);
  const fromList = listStyle
    ? bulletFromProperties(listStyle.find(nsmap.a, `lvl${level + 1}pPr`))
    : undefined;
  if (fromList !== undefined) return fromList;
  if (!masterTxStyles) return undefined;
  const body = masterTxStyles.find(nsmap.p, "bodyStyle");
  const fromBody = bulletFromProperties(body?.find(nsmap.a, `lvl${level + 1}pPr`));
  if (fromBody !== undefined) return fromBody;
  const other = masterTxStyles.find(nsmap.p, "otherStyle");
  return bulletFromProperties(other?.find(nsmap.a, `lvl${level + 1}pPr`));
}

function bulletFromProperties(
  properties: XmlElement | null | undefined,
): TextParagraph["bullet"] | undefined {
  if (!properties) return undefined;
  if (properties.find(nsmap.a, "buNone")) return "none";
  if (properties.find(nsmap.a, "buChar")) return "bullet";
  if (properties.find(nsmap.a, "buAutoNum")) return "number";
  return undefined;
}

function paragraphIsFullyBold(paragraph: PptxParagraph): boolean {
  if (paragraph.runs.length === 0) return false;
  for (const run of paragraph.runs) {
    const bold = run.element.find(nsmap.a, "rPr")?.getAttr("b");
    if (bold !== "1" && bold !== "true") return false;
  }
  return true;
}

function paragraphLevel(paragraph: PptxParagraph): number {
  const level = paragraph.level;
  return Number.isInteger(level) && level >= 0 ? level : 0;
}

/**
 * Run text already joins spaces and decoded entities.
 * A soft break (`a:br`) arrives as U+000B and becomes a newline.
 * A hyperlink URL is appended when the visible run text does not already contain it.
 */
function paragraphText(paragraph: PptxParagraph): string {
  let text = paragraph.text.replaceAll("\u000b", "\n");
  const seen = new Set<string>();
  for (const run of paragraph.runs) {
    let address: string | undefined;
    try {
      address = run.hyperlink.address;
    } catch {
      address = undefined;
    }
    if (!address || seen.has(address) || text.includes(address)) continue;
    seen.add(address);
    text = text.length > 0 ? `${text} ${address}` : address;
  }
  return text;
}

function geometry(shape: BaseShape, frames: GroupFrame[]): Box {
  let box: Box;
  try {
    box = {
      x: finite(shape.left),
      y: finite(shape.top),
      width: finite(shape.width),
      height: finite(shape.height),
    };
  } catch {
    box = {};
  }
  return frames.reduceRight((current, frame) => applyFrame(current, frame), box);
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function applyFrame(box: Box, frame: GroupFrame): Box {
  const scaleX = frame.extX / frame.chExtX;
  const scaleY = frame.extY / frame.chExtY;
  return {
    x: box.x === undefined ? undefined : frame.offX + (box.x - frame.chOffX) * scaleX,
    y: box.y === undefined ? undefined : frame.offY + (box.y - frame.chOffY) * scaleY,
    width: box.width === undefined ? undefined : box.width * scaleX,
    height: box.height === undefined ? undefined : box.height * scaleY,
  };
}

function readGroupFrame(group: GroupShape): GroupFrame | undefined {
  const xfrm = group.element.find(nsmap.p, "grpSpPr")?.find(nsmap.a, "xfrm");
  if (!xfrm) return undefined;
  const off = xfrm.find(nsmap.a, "off");
  const ext = xfrm.find(nsmap.a, "ext");
  const chOff = xfrm.find(nsmap.a, "chOff");
  const chExt = xfrm.find(nsmap.a, "chExt");
  const extX = attrNumber(ext, "cx");
  const extY = attrNumber(ext, "cy");
  const chExtX = attrNumber(chExt, "cx");
  const chExtY = attrNumber(chExt, "cy");
  if (
    extX === undefined ||
    extY === undefined ||
    chExtX === undefined ||
    chExtY === undefined ||
    chExtX === 0 ||
    chExtY === 0
  ) {
    return undefined;
  }
  return {
    offX: attrNumber(off, "x") ?? 0,
    offY: attrNumber(off, "y") ?? 0,
    extX,
    extY,
    chOffX: attrNumber(chOff, "x") ?? 0,
    chOffY: attrNumber(chOff, "y") ?? 0,
    chExtX,
    chExtY,
  };
}

function attrNumber(
  element: { getAttr(name: string): string | null } | null | undefined,
  name: string,
): number | undefined {
  const raw = element?.getAttr(name);
  if (raw == null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function connectorEnds(shape: BaseShape): { from?: number; to?: number } {
  const properties = shape.element.childElements[0]?.find(nsmap.p, "cNvCxnSpPr");
  return {
    from: attrNumber(properties?.find(nsmap.a, "stCxn"), "id"),
    to: attrNumber(properties?.find(nsmap.a, "endCxn"), "id"),
  };
}

function positioned(box: Box): Box {
  const out: Box = {};
  if (box.x !== undefined) out.x = box.x;
  if (box.y !== undefined) out.y = box.y;
  if (box.width !== undefined) out.width = box.width;
  if (box.height !== undefined) out.height = box.height;
  return out;
}
