import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { PptxParseError, parsePptx } from "@/lib/ppt/parse-pptx";
import type { Slide, TextParagraph } from "@/lib/ppt/schema";

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("parsePptx", () => {
  it("rejects a missing name and a package that is not a presentation", async () => {
    await expect(
      parsePptx({ filename: "   ", bytes: new Uint8Array([1, 2, 3]) }),
    ).rejects.toBeInstanceOf(PptxParseError);

    await expect(
      parsePptx({ filename: "notes.pptx", bytes: new Uint8Array([1, 2, 3, 4]) }),
    ).rejects.toThrow(PptxParseError);

    const zip = new JSZip();
    zip.file("hello.txt", "not a presentation");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(parsePptx({ filename: "notes.pptx", bytes })).rejects.toThrow(
      /could not be read/,
    );
  });

  it("reads list-style bullets and fully bold paragraphs", async () => {
    const result = await parsePptx({
      filename: "formatting.pptx",
      bytes: await formattingPptx(),
      id: "formatting",
    });

    const slide = result.presentation.slides[0];
    const inheritedBullet = slide?.elements.find(
      (element) => element.type === "text" && elementText(element) === "Styled bullet",
    );
    expect(inheritedBullet?.type).toBe("text");
    if (inheritedBullet?.type !== "text") return;
    expect(inheritedBullet.paragraphs).toEqual([
      { text: "Styled bullet", level: 0, bullet: "bullet" },
    ] satisfies TextParagraph[]);

    const plainFromStyle = slide?.elements.find(
      (element) => element.type === "text" && elementText(element) === "Plain from buNone",
    );
    expect(plainFromStyle?.type).toBe("text");
    if (plainFromStyle?.type !== "text") return;
    expect(plainFromStyle.paragraphs).toEqual([
      { text: "Plain from buNone", level: 0, bullet: "none" },
    ] satisfies TextParagraph[]);

    const boldLines = slide?.elements.find(
      (element) => element.type === "text" && elementText(element).includes("Stage 3"),
    );
    expect(boldLines?.type).toBe("text");
    if (boldLines?.type !== "text") return;
    expect(boldLines.paragraphs).toEqual([
      { text: "Stage 3: Considering the alternatives", level: 0, bold: true },
      { text: "Bold and plain", level: 0 },
    ] satisfies TextParagraph[]);

    const explicitNone = slide?.elements.find(
      (element) => element.type === "text" && elementText(element) === "Explicit buNone",
    );
    expect(explicitNone?.type).toBe("text");
    if (explicitNone?.type !== "text") return;
    expect(explicitNone.paragraphs).toEqual([
      { text: "Explicit buNone", level: 0, bullet: "none" },
    ] satisfies TextParagraph[]);
  });

  it("inherits bullets from slide master txStyles when shape list style is empty", async () => {
    const result = await parsePptx({
      filename: "master-bullets.pptx",
      bytes: await masterBulletPptx(),
      id: "master-bullets",
    });

    const slide = result.presentation.slides[0];
    const fromMaster = slide?.elements.find(
      (element) => element.type === "text" && elementText(element) === "Master bullet",
    );
    expect(fromMaster?.type).toBe("text");
    if (fromMaster?.type !== "text") return;
    expect(fromMaster.paragraphs).toEqual([
      { text: "Master bullet", level: 0, bullet: "bullet" },
    ] satisfies TextParagraph[]);

    const explicitNone = slide?.elements.find(
      (element) => element.type === "text" && elementText(element) === "Master buNone wins",
    );
    expect(explicitNone?.type).toBe("text");
    if (explicitNone?.type !== "text") return;
    expect(explicitNone.paragraphs).toEqual([
      { text: "Master buNone wins", level: 0, bullet: "none" },
    ] satisfies TextParagraph[]);
  });

  it("keeps presentation order, lists, pictures, notes, and a group", async () => {
    const result = await parsePptx({
      filename: " lecture.pptx ",
      bytes: await syntheticPptx(),
      id: "run-test",
    });

    expect(result.presentation.id).toBe("run-test");
    expect(result.presentation.filename).toBe("lecture.pptx");
    expect(result.presentation.title).toBe("Synthetic Lecture");
    expect(result.presentation.slides.map((slide) => slide.slideNumber)).toEqual([
      1, 2,
    ]);

    const first = result.presentation.slides[0];
    expect(first?.hidden).toBeUndefined();
    expect(first?.speakerNotes).toBe("Keep this note.");
    expect(texts(first)).toEqual([
      "Line one\nLine two",
      "Marketing & behaviour",
      "plain",
      "dot",
      "letter",
      "See the notes https://example.com/notes",
      "https://example.com/already",
      "inside group",
    ]);
    expect(first?.elements.some((element) => elementText(element) === "4")).toBe(
      false,
    );

    const title = first?.elements[0];
    expect(title).toMatchObject({
      id: "s1-e1",
      type: "text",
      isTitle: true,
      zIndex: 0,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });

    const list = first?.elements.find(
      (element) =>
        element.type === "text" &&
        element.paragraphs.some((paragraph) => paragraph.text === "letter"),
    );
    expect(list?.type).toBe("text");
    if (list?.type === "text") {
      expect(list.paragraphs).toEqual([
        { text: "plain", level: 0, bullet: "none" },
        { text: "dot", level: 0, bullet: "bullet" },
        { text: "letter", level: 2, bullet: "number" },
      ] satisfies TextParagraph[]);
    }

    const connector = first?.elements.find((element) => element.type === "shape");
    expect(connector).toMatchObject({
      type: "shape",
      connectsFrom: "s1-e1",
      connectsTo: "s1-e2",
    });

    const image = first?.elements.find((element) => element.type === "image");
    expect(image).toMatchObject({
      type: "image",
      mimeType: "image/png",
      altText: "diagram.png",
      cropped: true,
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    if (image?.type === "image") {
      expect(image.assetId).toBe(image.contentHash);
      expect(result.images).toEqual([
        {
          contentHash: image.contentHash,
          mimeType: "image/png",
          bytes: new Uint8Array(PNG),
        },
      ]);
    }

    const grouped = first?.elements.find(
      (element) => element.type === "text" && element.paragraphs[0]?.text === "inside group",
    );
    expect(grouped).toMatchObject({ x: 1100, y: 2200, width: 300, height: 400 });

    const table = first?.elements.find((element) => element.type === "table");
    expect(table).toMatchObject({
      type: "table",
      rows: [
        ["A1", "B1"],
        ["A2", "B2"],
      ],
    });

    expect(result.warnings).toEqual([
      "Slide 1 has a picture background that is not a picture shape, so it was not extracted.",
    ]);

    const second = result.presentation.slides[1];
    expect(second).toMatchObject({
      slideNumber: 2,
      hidden: true,
      elements: [
        expect.objectContaining({
          type: "text",
          paragraphs: [{ text: "Second slide", level: 0 }],
        }),
      ],
    });
    expect(second?.speakerNotes).toBeUndefined();
    expect(elementText(second?.elements[0])).not.toBe("9");
  });

  const samplePath = path.join(process.cwd(), "fixtures/private/sample.pptx");

  it.skipIf(!existsSync(samplePath))(
    "parses the private sample without changing source text",
    async () => {
      const result = await parsePptx({
        filename: "sample.pptx",
        bytes: new Uint8Array(readFileSync(samplePath)),
        id: "sample",
      });
      const slides = result.presentation.slides;
      expect(slides).toHaveLength(18);
      expect(slides.map((slide) => slide.slideNumber)).toEqual(
        Array.from({ length: 18 }, (_, index) => index + 1),
      );

      const joined = slides
        .flatMap((slide) => slide.elements.map(elementText))
        .join("\n");
      expect(joined).toContain("Engineering & Technology");
      expect(joined).toContain("Marketing: 1.1");
      expect(joined).toContain("buying behaviour");
      expect(joined).toContain("BBALLB- 203");
      expect(joined).not.toContain("\u000b");

      const counts = slides.map(
        (slide) => slide.elements.filter((element) => element.type === "image").length,
      );
      expect(counts).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);

      const slide1Images = slides[0]?.elements.filter((element) => element.type === "image");
      expect(slide1Images?.map((element) => element.type === "image" && element.altText)).toEqual([
        "MIET_icon.png",
        "shrast.png",
      ]);
      expect(
        slides
          .flatMap((slide) => slide.elements)
          .filter((element) => element.type === "image")
          .every((element) => element.type === "image" && element.mimeType === "image/png" && !element.cropped),
      ).toBe(true);

      expect(slides[0]?.speakerNotes).toBe(
        "Presentation slide for courses, classes, lectures et al. ",
      );
      expect(slides.slice(1).every((slide) => slide.speakerNotes === undefined)).toBe(
        true,
      );

      const slide6 = slides[5]?.elements.find((element) => element.type === "text" && element.isTitle);
      expect(slide6?.type === "text" && slide6.paragraphs[0]?.text).toBe(
        "5 important stages of the consumer decision-making process\n",
      );

      const slide7 = slides[6]?.elements.find(
        (element) =>
          element.type === "text" &&
          element.paragraphs.some((paragraph) =>
            paragraph.text.startsWith("Stage 3: Considering the alternatives"),
          ),
      );
      expect(slide7?.type).toBe("text");
      if (slide7?.type === "text") {
        expect(slide7.paragraphs).toEqual([
          {
            text: "Stage 3: Considering the alternatives",
            level: 0,
            bullet: "none",
            bold: true,
          },
          {
            text: "At this stage, the consumer compares options based on price, product quality, quantity, value-added features, or other essential factors. Before choosing the product that best meets your needs, look at customer reviews and compare prices for the alternatives. ",
            level: 0,
            bullet: "bullet",
          },
          {
            text: "After finding helpful information, the consumer chooses the best product on the market based on their taste, style, income, or preference.",
            level: 0,
            bullet: "bullet",
          },
          {
            text: "Stage 4: Buying the product or service",
            level: 0,
            bullet: "none",
            bold: true,
          },
          {
            text: "the customer decides what to buy and where to buy it. The consumer makes a smart choice to buy a product based on his needs and wants after he has looked at all the facts.",
            level: 0,
            bullet: "bullet",
          },
          {
            text: "Needs and wants are often sparked by marketing campaigns, recommendations from friends and family, or sometimes by both.",
            level: 0,
            bullet: "bullet",
          },
        ] satisfies TextParagraph[]);
      }

      const numbered = slides[10]?.elements.flatMap((element) =>
        element.type === "text"
          ? element.paragraphs.filter((paragraph) => paragraph.bullet === "number")
          : [],
      );
      expect(numbered).toEqual([
        { text: "Brand ", level: 0, bullet: "number" },
        { text: "Culture ", level: 0, bullet: "number" },
        { text: "Product", level: 0, bullet: "number" },
        { text: "Price", level: 0, bullet: "number" },
      ]);

      expect(slides[1]?.elements.some((element) => elementText(element) === "2")).toBe(
        false,
      );
      expect(slides[17]?.elements[0]).toMatchObject({
        type: "text",
        isTitle: true,
        paragraphs: [{ text: "Thank You", level: 0 }],
      });

      expect(result.warnings).toEqual([
        "Slide 1 has a picture background that is not a picture shape, so it was not extracted.",
      ]);
      expect(result.images).toHaveLength(5);
      for (const image of slides.flatMap((slide) =>
        slide.elements.filter((element) => element.type === "image"),
      )) {
        if (image.type !== "image") continue;
        expect(image.assetId).toBe(image.contentHash);
        expect(
          result.images.some(
            (stored) =>
              stored.contentHash === image.contentHash &&
              stored.mimeType === image.mimeType &&
              stored.bytes.byteLength > 0,
          ),
        ).toBe(true);
      }
    },
  );
});

function texts(slide: Slide | undefined): string[] {
  return (slide?.elements ?? []).flatMap((element) => {
    if (element.type === "text") return element.paragraphs.map((paragraph) => paragraph.text);
    return [];
  });
}

function elementText(element: Slide["elements"][number] | undefined): string {
  if (!element) return "";
  if (element.type === "text") {
    return element.paragraphs.map((paragraph) => paragraph.text).join("\n");
  }
  if (element.type === "shape") return element.text ?? "";
  if (element.type === "table") return element.rows.flat().join("\n");
  return "";
}

async function syntheticPptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
  );
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Synthetic Lecture</dc:title>
</cp:coreProperties>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );
  zip.file("ppt/media/image1.png", PNG);
  zip.file("ppt/media/background.jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  zip.file("ppt/slides/slide2.xml", firstSlideXml());
  zip.file(
    "ppt/slides/_rels/slide2.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/notes" TargetMode="External"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/already" TargetMode="External"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/background.jpeg"/>
</Relationships>`,
  );
  zip.file("ppt/notesSlides/notesSlide1.xml", notesXml());
  zip.file("ppt/slides/slide1.xml", secondSlideXml());
  zip.file("ppt/slides/_rels/slide1.xml.rels", emptyRels());
  return zip.generateAsync({ type: "uint8array" });
}

function emptyRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
}

function firstSlideXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:blipFill>
          <a:blip r:embed="rId5"/>
          <a:stretch><a:fillRect/></a:stretch>
        </a:blipFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      ${textShape({
        id: 2,
        name: "Title",
        ph: "title",
        x: 10,
        y: 20,
        cx: 30,
        cy: 40,
        paragraphs: `<a:p><a:r><a:t>Line one</a:t></a:r><a:br/><a:r><a:t>Line two</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Slide Number",
        ph: "sldNum",
        x: 0,
        y: 0,
        cx: 10,
        cy: 10,
        paragraphs: `<a:p><a:r><a:t>4</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 4,
        name: "Body",
        x: 50,
        y: 60,
        cx: 70,
        cy: 80,
        paragraphs: `<a:p><a:r><a:t>Marketing</a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:t>&amp;</a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:t>behaviour</a:t></a:r></a:p>`,
      })}
      <p:cxnSp>
        <p:nvCxnSpPr>
          <p:cNvPr id="5" name="Connector"/>
          <p:cNvCxnSpPr>
            <a:stCxn id="2" idx="0"/>
            <a:endCxn id="4" idx="0"/>
          </p:cNvCxnSpPr>
          <p:nvPr/>
        </p:nvCxnSpPr>
        <p:spPr>
          <a:xfrm><a:off x="1" y="2"/><a:ext cx="3" cy="4"/></a:xfrm>
          <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:cxnSp>
      ${textShape({
        id: 6,
        name: "List",
        x: 1,
        y: 1,
        cx: 1,
        cy: 1,
        paragraphs: `<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>plain</a:t></a:r></a:p>
          <a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>dot</a:t></a:r></a:p>
          <a:p><a:pPr lvl="2"><a:buAutoNum type="alphaLcPeriod"/></a:pPr><a:r><a:t>letter</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 7,
        name: "Links",
        x: 1,
        y: 1,
        cx: 1,
        cy: 1,
        paragraphs: `<a:p><a:r><a:rPr><a:hlinkClick r:id="rId2"/></a:rPr><a:t>See the notes</a:t></a:r></a:p>
          <a:p><a:r><a:rPr><a:hlinkClick r:id="rId3"/></a:rPr><a:t>https://example.com/already</a:t></a:r></a:p>`,
      })}
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="8" name="Picture" descr="diagram.png"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId1"/>
          <a:srcRect l="10000" t="0" r="0" b="0"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
      <p:grpSp>
        <p:nvGrpSpPr>
          <p:cNvPr id="9" name="Group"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="1000" y="2000"/>
            <a:ext cx="1000" cy="1000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="100" cy="100"/>
          </a:xfrm>
        </p:grpSpPr>
        ${textShape({
          id: 10,
          name: "Grouped",
          x: 10,
          y: 20,
          cx: 30,
          cy: 40,
          paragraphs: `<a:p><a:r><a:t>inside group</a:t></a:r></a:p>`,
        })}
      </p:grpSp>
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="11" name="Table"/>
          <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm><a:off x="5" y="6"/><a:ext cx="7" cy="8"/></p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
            <a:tbl>
              <a:tblGrid><a:gridCol w="50"/><a:gridCol w="50"/></a:tblGrid>
              <a:tr h="20">
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>A1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>B1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              </a:tr>
              <a:tr h="20">
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>A2</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>B2</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function secondSlideXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS} show="0">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      ${textShape({
        id: 2,
        name: "Body",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        paragraphs: `<a:p><a:r><a:t>Second slide</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Slide Number",
        ph: "sldNum",
        x: 0,
        y: 0,
        cx: 10,
        cy: 10,
        paragraphs: `<a:p><a:r><a:t>9</a:t></a:r></a:p>`,
      })}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function notesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      ${textShape({
        id: 2,
        name: "Notes",
        ph: "body",
        x: 0,
        y: 0,
        cx: 10,
        cy: 10,
        paragraphs: `<a:p><a:r><a:t>Keep this note.</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Slide Number",
        ph: "sldNum",
        x: 0,
        y: 0,
        cx: 10,
        cy: 10,
        paragraphs: `<a:p><a:r><a:t>99</a:t></a:r></a:p>`,
      })}
    </p:spTree>
  </p:cSld>
</p:notes>`;
}

function textShape(input: {
  id: number;
  name: string;
  ph?: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  lstStyle?: string;
  paragraphs: string;
}): string {
  const placeholder = input.ph
    ? `<p:nvPr><p:ph type="${input.ph}"/></p:nvPr>`
    : `<p:nvPr/>`;
  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${input.id}" name="${input.name}"/>
      <p:cNvSpPr/>
      ${placeholder}
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="${input.x}" y="${input.y}"/><a:ext cx="${input.cx}" cy="${input.cy}"/></a:xfrm>
    </p:spPr>
    <p:txBody>
      <a:bodyPr/>
      <a:lstStyle>${input.lstStyle ?? ""}</a:lstStyle>
      ${input.paragraphs}
    </p:txBody>
  </p:sp>`;
}

async function formattingPptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      ${textShape({
        id: 2,
        name: "Inherited bullet",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        lstStyle: `<a:lvl1pPr><a:buChar char="▪"/></a:lvl1pPr>`,
        paragraphs: `<a:p><a:r><a:t>Styled bullet</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Plain list style",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        lstStyle: `<a:lvl1pPr><a:buNone/></a:lvl1pPr>`,
        paragraphs: `<a:p><a:r><a:t>Plain from buNone</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 4,
        name: "Bold body",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        paragraphs: `<a:p><a:r><a:rPr b="1"/><a:t>Stage 3: Considering the alternatives</a:t></a:r></a:p>
          <a:p><a:r><a:rPr b="1"/><a:t>Bold</a:t></a:r><a:r><a:t> and plain</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 5,
        name: "Explicit buNone",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        lstStyle: `<a:lvl1pPr><a:buChar char="▪"/></a:lvl1pPr>`,
        paragraphs: `<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Explicit buNone</a:t></a:r></a:p>`,
      })}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );
  zip.file("ppt/slides/_rels/slide1.xml.rels", emptyRels());
  return zip.generateAsync({ type: "uint8array" });
}

async function masterBulletPptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`,
  );
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle/>
    <p:bodyStyle><a:lvl1pPr><a:buChar char="■"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle/>
  </p:txStyles>
</p:sldMaster>`,
  );
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} preserve="1">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`,
  );
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      ${textShape({
        id: 2,
        name: "Master bullet",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        lstStyle: "",
        paragraphs: `<a:p><a:r><a:t>Master bullet</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Master buNone wins",
        x: 1,
        y: 2,
        cx: 3,
        cy: 4,
        lstStyle: "",
        paragraphs: `<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Master buNone wins</a:t></a:r></a:p>`,
      })}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}
