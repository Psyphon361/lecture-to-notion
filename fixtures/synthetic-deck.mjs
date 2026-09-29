/**
 * Rebuild the committed synthetic deck:
 *   node fixtures/synthetic-deck.mjs
 *
 * Presentation order is the sldId list, which points at slide2.xml first.
 * Filename order would put slide1.xml first.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const MARK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const zip = new JSZip();
const stamp = { date: new Date("2026-01-01T00:00:00Z") };
const file = (name, contents) => zip.file(name, contents, stamp);

file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
);
file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
);
file(
  "docProps/core.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Synthetic Lecture</dc:title>
</cp:coreProperties>`,
);
file(
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
file(
  "ppt/_rels/presentation.xml.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
);
file("ppt/media/image1.png", PNG);
file("ppt/media/image2.png", MARK);
file(
  "ppt/slides/_rels/slide2.xml.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`,
);
file("ppt/slides/slide2.xml", firstInDeckXml());
file("ppt/notesSlides/notesSlide1.xml", notesXml());
file("ppt/slides/slide1.xml", secondInDeckXml());
file(
  "ppt/slides/_rels/slide1.xml.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
);

const bytes = await zip.generateAsync({ type: "nodebuffer" });
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "synthetic.pptx");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, bytes);

function textShape(input) {
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
      <a:lstStyle/>
      ${input.paragraphs}
    </p:txBody>
  </p:sp>`;
}

function firstInDeckXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
        name: "Title",
        ph: "title",
        x: 10,
        y: 20,
        cx: 400,
        cy: 80,
        paragraphs: `<a:p><a:r><a:t>First in the deck</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 3,
        name: "Slide Number",
        ph: "sldNum",
        x: 0,
        y: 0,
        cx: 10,
        cy: 10,
        paragraphs: `<a:p><a:r><a:t>7</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 4,
        name: "Body",
        x: 10,
        y: 200000,
        cx: 400,
        cy: 80,
        paragraphs: `<a:p><a:r><a:t>Marketing</a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:t>&amp;</a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:t>behaviour</a:t></a:r></a:p>`,
      })}
      ${textShape({
        id: 5,
        name: "List",
        x: 10,
        y: 400000,
        cx: 400,
        cy: 80,
        paragraphs: `<a:p><a:pPr><a:buAutoNum type="alphaLcPeriod"/></a:pPr><a:r><a:t>Brand</a:t></a:r></a:p>
          <a:p><a:pPr lvl="1"><a:buAutoNum type="alphaLcPeriod"/></a:pPr><a:r><a:t>Culture</a:t></a:r></a:p>`,
      })}
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="6" name="Picture" descr="diagram.png"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="100" y="600000"/><a:ext cx="300" cy="400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="7" name="Mark" descr="mark.png"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId3"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="100" y="800000"/><a:ext cx="20" cy="20"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function secondInDeckXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
        name: "Title",
        ph: "title",
        x: 10,
        y: 20,
        cx: 400,
        cy: 80,
        paragraphs: `<a:p><a:r><a:t>Second in the deck</a:t></a:r></a:p>`,
      })}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function notesXml() {
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
        paragraphs: `<a:p><a:r><a:t>Keep the first note.</a:t></a:r></a:p>`,
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
