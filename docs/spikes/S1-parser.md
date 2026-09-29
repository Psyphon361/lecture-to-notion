# Spike S1 — PPTX parser

**Date:** Sep 29, 2026
**Sample:** `fixtures/private/sample.pptx` (946,979 bytes). Parsed locally only. Not sent to any external service.
**Recommendation:** adopt `ts-pptx@0.1.1` as the reader, and own a thin normalizer in `lib/ppt` that maps its shape tree onto `Presentation`. Do not take flattened text from `@cliftonc/pptx-to-json`, and do not adopt `pptxtojson` or `officeparser`.

## Sample inventory (OOXML ground truth)

Read from the package, not from a parser.

| Fact | Value |
|---|---|
| Slides | 18, in `p:sldIdLst` order. On this file that order matches `slide1.xml`…`slide18.xml`. Filenames are not a safe order source in general. |
| Size | 9,144,000 × 6,858,000 EMU, `screen4x3` (960 × 720 px at 96 dpi) |
| Hidden slides | 0 |
| Speaker notes | 1 part, related to slide 1. Body text is template boilerplate ("Presentation slide for courses…"), plus a slide-number field. |
| Pictures on slides | Slide 1: two `p:pic` PNGs (logos; `descr` is `MIET_icon.png` and `shrast.png`). Slides 5, 9, and 10: one PNG each. Those three are where the teaching content lives inside the image. |
| Other media | 11 files under `ppt/media/`. `image6.jpeg` is a slide-1 background relationship, not a `p:pic`. `image1`–`image3` are theme/master. `image4` is title-layout. `image5` is an unused layout. No EMF/WMF. |
| Text worth scoring | Entities (`&amp;` → `&`), en dash in the course code, British spelling `behaviour` in its own run, spaces that are their own runs, a soft line break (`a:br`) in a title, an `alphaLcPeriod` numbered list on slide 11 (a. b. c. d.), one real hyperlink plus a second URL that is plain text. |
| Not in this deck | Tables, grouped shapes, connectors, SmartArt, charts, OMML equations, hidden slides, merged cells, cropped images, nested bullet levels. Those stay untested. |

The deck is a course lecture: Marketing Management, course code BBALLB-203, topic "Consumer buying decision process", faculty Ms. Shivani Kanaria, Model Institute of Engineering & Technology, School of Law. Whether it is Vasu's lecture is still an open question for the user.

## Candidates run

| Package | Version | How it was called |
|---|---|---|
| `@cliftonc/pptx-to-json` | 0.2.1 | `PPTXParser.buffer2json` then `PowerPointParser.parseJson` |
| `pptxtojson` | 2.2.0 | `parse()` from `pptxtojson/dist/index.js` |
| `officeparser` | 8.0.0 | `parseOffice(path, { extractAttachments: true, ocr: false })` |
| `ts-pptx` | 0.1.1 | `Presentation.open(path)` then shape/paragraph/picture APIs |

`import "pptxtojson"` on Node returns an empty module. The package `main` is a UMD bundle and `"type": "module"`, so the named `parse` export never appears. The ESM build at `dist/index.js` works. That is a packaging bug, not a parse failure.

## What each parser handled

| Check | Ground truth | `@cliftonc/pptx-to-json` | `pptxtojson` | `officeparser` | `ts-pptx` |
|---|---|---|---|---|---|
| Slide count and order | 18, presentation order | Pass. `slideOrderSource: "presentation"` | Pass (18, content in order) | Pass (18 slide nodes) | Pass (iterates `sldIdLst`) |
| Text, entities, spelling | `&`, en dash, `behaviour` | Pass in `richText`. Flattened `content` drops spaces that are their own runs (`Marketing:1.1`, `behaviour2.4`) | Fail as stored. Text is HTML; words are separated by `&nbsp;`; `&amp;` left encoded | Pass | Pass, including inter-run spaces |
| Numbered list (slide 11, `alphaLcPeriod`) | ordered a. b. c. d. | Fail. `richText` emits `bulletList` | Not a structured list; options are inside HTML | Pass. `listType: "ordered"`, indent 0. Does not expose `alphaLcPeriod` | Pass via XML. `paragraph.element` has `a:buAutoNum/@type = alphaLcPeriod`. No first-class bullet property; `level` is 0, which matches a missing `lvl` |
| Soft line break | `a:br` inside the slide 6 title | Title string is one line | Inside HTML | Not separately checked | Pass. `paragraph.text` uses U+000B |
| Content images | 2 + 1 + 1 + 1 PNGs, correct slides | Pass, as data URLs. Alt text present. Mime in the data URL | Pass for `p:pic`, as data URLs. Both slide-1 images reported `image/png` | Pass for `p:pic`. Slide node points at `attachmentName` + alt text. Bytes in the attachment bag are base64, and the bag also contains master/theme images | Pass. Raw bytes, `image/png`, EMU geometry, shape name |
| Slide-1 background JPEG (not a `p:pic`) | Present in rels | Extracted (third image on slide 1) | Missed | In the attachment bag, not on the slide node | Missed. Not a shape. `fill.type` on the text boxes is `BACKGROUND`, not a picture |
| Positions | EMU on each shape | Pixels (slide reported 960 × 720). `zIndex` present | CSS-like `left`/`top`/`width`/`height` | None on slide content | EMU on pictures and shapes |
| Placeholders | title, body, subtitle, slide number | Title string for several slides (`titleSource` metadata) | Not exposed as roles | Some titles become `heading` level 1 | Pass. `title`, `body`, `subTitle`, `obj`, `sldNum` |
| Speaker notes | Slide 1 body only; ignore the notes slide-number field | Pass | Pass, but wrapped in HTML | One note node; not tied in this spike to a slide index | Pass via `hasNotesSlide` (does not create notes when absent) |
| Hyperlink | One `hlinkClick` on slide 17 | URL present because it is also the visible text | URL present in the HTML | URL present in text | Pass as `run.hyperlink.address` |
| Tables, groups, connectors, EMF, equations, hidden slides | Absent | Untested | Untested | Untested | Untested. API includes table, group, chart, SmartArt, and crop, not exercised here |
| Node fit | Server-side TypeScript | Good. Two deps (`jszip`, `fast-xml-parser`) | Poor default entry. Browser-first HTML model | Works, but a large multi-format stack. `ast.to("text")` is async and was easy to call wrong | Good. ESM, TypeScript, Node, no DOM |

## Recommendation

Use `ts-pptx` and normalize in our code.

- Paragraph text kept every space, entity, and the `behaviour` run. That is the fidelity bar.
- Geometry is already in EMU, which is the unit `Presentation` should store.
- Placeholder types let us drop slide-number shapes without guessing.
- Pictures are raw bytes with a mime type, which is what storage wants. Data URLs from the other libraries would bloat JSON state.
- Numbering is not a helper, but `a:pPr` / `a:buAutoNum` / `a:buNone` / `a:buChar` are on `paragraph.element`. The normalizer reads those. Confirmed `type="alphaLcPeriod"` on slide 11.
- Hyperlinks and notes are real fields.

`@cliftonc/pptx-to-json` is the fallback if a later deck breaks `ts-pptx`. Its `richText` tree keeps runs and it was the only library that pulled the slide-1 background JPEG. Do not use its flattened `content` string, and do not trust `bulletList` for `buAutoNum`. It is not a dependency of the app.

`pptxtojson` is out. The content model is HTML, the package entry does not import on Node, and it missed the background image.

`officeparser` is out as the extractor. Text and ordered-list detection were good, and there were no warnings, but there is no geometry, images are a package-wide attachment bag, and the dependency is a document-conversion platform rather than a slide model.

## Normalizer work for Phase 2

1. Walk `slide.shapes` in document order. Record EMU `left`/`top`/`width`/`height` and shape id.
2. Build `TextElement.paragraphs` from runs. Map `buNone` → `none`, `buChar` → `bullet`, `buAutoNum` → `number`. Keep `lvl` (default 0) as the 0-based level and store it as 1-based in our model only if we document that once.
3. Skip `sldNum` placeholders. Keep title/body role on `isTitle` / placeholder type.
4. Pictures → storage bytes, sha256 `contentHash`, mime, alt from `descr` when present, crop fractions when non-zero.
5. Notes from `hasNotesSlide` + notes body text, not the notes slide-number field.
6. Hyperlink URL on the run that owns it.
7. Slide background blip (the missed JPEG) is a follow-up, not a blocker for this deck: the content images are `p:pic`. Flag it in warnings if we skip it.
8. Pin `ts-pptx@0.1.1`. It is young (0.1.x). Re-spike tables, groups, and EMF when a deck that contains them shows up.

## Phase 0 plan for the other spikes

Not started. Both need something only the user can provide, and neither may send this PPTX out.

**S2 Gemini** — blocked on an API key and on explicit consent before any real slide is sent. When unblocked: confirm current free-tier model ids in AI Studio (the ids in `HANDOFF.md` section 5.2 are still `[VERIFY]`); send a small synthetic diagram and a synthetic screenshot that contain a planted technical token; request structured `SlideNotes` through a Zod schema converted to Gemini's JSON Schema subset; record model id, tokens, latency, and any 429. Success is: schema validates, the planted token is unchanged, and no relationship is described that was not in the image. Write `docs/spikes/S2-gemini.md`.

**S3 Notion** — blocked on an internal integration token and a parent page shared with that integration. The token-vs-OAuth choice is still `[ASSUMED]` and can wait until Phase 7. When unblocked: create a page, append blocks in chunks, upload one extracted PNG with the File Upload API and attach it within the hour, and record the required `Notion-Version` and the child-count / rich-text limits. This spike does not start the export feature. Write `docs/spikes/S3-notion.md`.
