# Lecture-to-Notes: Agent Handoff

**Audience:** the coding/orchestrating agent working in `C:\dev\lecture-to-notes`.
**Written:** Sep 29, 2026, at the end of the planning session in a different folder.
**Status:** Phase 1 gate met (Sep 29, 2026). Phase 2 extraction is in the app. Phase 3 image analysis is in the app: `POST /api/analyze-images` skips decorative images and reads the rest with Gemini. Phase 4 per-slide notes are local: `fallbackSlideNotes` builds every slide from extracted text plus that image reading. Gemini is image-only. `processSlide` rejects, and `POST /api/process-slide` is gone. Phase 5 organization is local: `organizeLocally` turns those notes into one `NoteDocument` in the browser. `organizeNotes` rejects, and `POST /api/organize` is gone. S2 ran on a synthetic image (`docs/spikes/S2-gemini.md`). S3 (Sep 30, 2026) confirmed `Notion-Version: 2026-03-11` and a single-part PNG upload (`docs/spikes/S3-notion.md`). Page creation, image attach, and the live chunk-limit checks are waiting on `NOTION_PARENT_PAGE_ID` and a parent page shared with the connection. The review screen can call `POST /api/notion/export`.

## 0. How to use this document

1. Read this file fully, then skim `docs/project-brief.md` (the original product/engineering spec, 44 sections).
2. Precedence: **this file overrides the brief** where they differ (Section 3 lists every deviation). The brief still governs product philosophy, scope, and out-of-scope items.
3. Things marked **[VERIFY]** were true when researched (Sep 29, 2026) but must be re-checked against official docs before implementation. Things marked **[ASSUMED]** are decisions the user has not explicitly confirmed.
4. You are the **orchestrating agent**. See Section 14 for the operating protocol.

---

## 1. Product in one paragraph

Lecture-to-Notes turns a student's lecture `.pptx` into a structured, editable draft of study notes, previewed in the browser and exported to Notion. It removes the mechanical work (copying text, handling images/diagrams, cleaning OCR, organizing) while the student stays in control of the final notes. **It is not a summarizer.** Information preservation is the core requirement: a 50-slide lecture should yield notes that retain the lecture's detail, better organized, not a 5-slide summary.

**Validation goal (the only thing that matters first):** would Vasu (a college student, the primary user) rather review AI-generated notes than manually build them? The success signal is Vasu saying, in effect, "this saves me enough work that I want to use it again." This is not a startup build; do not add features until real usage exposes a problem.

**Pipeline:**

```
PPTX -> Presentation -> assets (text/images/tables/layout)
     -> ImageAnalysis (vision; decorative images skipped; cached per run)
     -> SlideContext (slide + image analysis + neighbor summaries)
     -> SlideNotes (structured output)
     -> NoteDocument (organization pass)
     -> Preview -> Notion adapter -> Notion page
```

---

## 2. Non-negotiable principles

These come from the brief and apply to every design and prompt decision.

| # | Principle | Practical consequence |
|---|---|---|
| 1 | Preserve, then enhance | Default is faithful transcription plus structure. Interpretation is added only where it helps (diagrams). No aggressive summarizing. |
| 2 | Deterministic first | Text, image extraction, slide order, Notion block creation are code, not AI. AI only for diagrams, OCR/screenshots, structuring. |
| 3 | `NoteDocument` is the hub | `AI -> NoteDocument -> NotionAdapter -> Notion`. The AI never emits Notion JSON. No Notion concepts in prompts or core models. |
| 4 | Human-in-the-loop | Output is a draft. Preview is the trust and QA surface. |
| 5 | Fidelity | Never invent content. Never silently "correct" technical terms, numbers, equations, identifiers, code, or definitions. Prefer omission over fabrication. Distinguish extracted source content from AI interpretation. Don't claim OCR is perfect. |
| 6 | Traceability | Keep `SourceReference` (slide number, optional element id) on notes internally for debugging. Not necessarily shown in the UI. |
| 7 | Keep V1 small | One Next.js app. No DB, queue, auth, billing unless forced. Full out-of-scope list is brief section 30. Push back on scope creep. |
| 8 | Real data early | Use Vasu's real PPTX as soon as it is safe. Synthetic data alone is insufficient. |
| 9 | Surface uncertainty | If processing fails or content is uncertain, say so in the UI/logs. Never fabricate to fill gaps. |
| 10 | Separation of layers | PPT / AI / Document / Notion / UI / Storage stay separate. Avoid cross-layer leakage. |

---

## 3. Decisions made in planning (and deviations from the brief)

| Topic | Decision | Deviation from brief? |
|---|---|---|
| Project location | `C:\dev\lecture-to-notes`, outside OneDrive (avoids `node_modules`/`.next` sync and file-lock problems) | Not in brief |
| Package manager | **npm** (user confirmed). Node v24.13.0, npm 11.6.2, git 2.52.0 are installed | Brief left open |
| OS/shell | Windows 10 (build 26200), PowerShell. Use PowerShell-compatible commands; use `;` not `&&` in older PowerShell if needed | n/a |
| Hosting and runtime | Local (`npm run dev`) through Phase 6. Vercel Hobby (free) later, only when Vasu needs a URL | Brief said "Vercel reasonable"; we add local-first and design around Vercel limits |
| Upload path | Direct-to-storage upload, not through a Next.js function body (Vercel 4.5 MB body limit) | **Yes:** brief implies plain upload endpoint |
| Processing style | Client-driven short steps (parse, analyze images, process slide N, organize), each a short server call | **Yes:** brief allowed one long request |
| AI provider (V1) | **Gemini API, free tier**, behind the `AIProvider` interface | Brief left provider open |
| Notion auth (V1) | **[ASSUMED]** Internal integration token in `.env`, single workspace. OAuth deferred until others need to connect their own Notion | **Yes:** brief lists OAuth in V1 flow. The user has not explicitly confirmed this. Ask once, briefly, before Phase 7 |
| Notion images | Use Notion File Upload API to upload extracted images and attach to image blocks | Resolves an open risk in the brief |
| PPTX parser | **`ts-pptx@0.1.1`**, pinned, plus a normalizer we own in `lib/ppt`. Decided Sep 29, 2026 from spike S1 (`docs/spikes/S1-parser.md`). `@cliftonc/pptx-to-json` is the documented fallback, not a dependency. `pptxtojson` and `officeparser` are rejected | Brief left open |
| UI kit | Tailwind only for Phase 1. shadcn/ui is not installed | Brief recommended shadcn |
| Max upload | **50 MB** local cap (`MAX_UPLOAD_BYTES`). Phase 1 `/api/upload` validates and does not store the file. Direct-to-storage is still required before any Vercel deploy, because function bodies are capped at 4.5 MB | New |
| Database / queue | None in V1 | Same as brief |

**Explicitly decided against:** Cloudflare Workers (no Node runtime, 10 ms CPU), Fly.io (no free tier for new accounts). Render free tier is a fallback host only (sleeps after ~15 min idle, ~1 min cold start).

---

## 4. Current state

Updated Sep 29, 2026. Phase 2 parse route and extraction review landed the same day.

- Next.js 16.3.7 + React 19 + TypeScript + Tailwind 4 app. npm. Vitest. Zod 4 schemas for `Presentation`, `ImageAnalysis`, `SlideNotes`, and `NoteDocument`. `agentRules` is off so Next does not rewrite `AGENTS.md`.
- Git is initialized. Nothing has been committed.
- Phase 1 UI: PPTX validation (extension, 50 MB cap, ZIP magic bytes) on the client and `POST /api/upload`. The upload route does not store the file. Export to Notion is disabled.
- `POST /api/parse` repeats those checks, parses, stores images, and returns `Presentation` JSON plus warnings. Image `assetId`s are storage keys. A malformed package returns a user-facing error. `purgeExpiredRuns` runs at the start of the request.
- The upload screen calls `/api/parse`, then `/api/analyze-images`, then builds each slide's notes locally with `fallbackSlideNotes`, then assembles one document with `organizeLocally`. There is no organize request. Gemini is image-only: a text-only deck makes no Gemini calls, and a picture deck calls Gemini once per image that was not skipped. There is no structuring request and no structuring progress screen. "Extract slides" completes when parse returns. "Analyze images" completes when the analyze call returns. "Structure each slide" is done when that local list exists. "Organize notes" completes when `organizeLocally` returns. The review lists slide number, title or first line, text, and image boxes in reading order. Each image box shows a skip reason or the analysis. Interpretation is labeled as interpretation, and relationships are labeled as model output. The Notes view shows that one document and a list of section headings that jump down the page. Extracted stays one slide at a time. Organization does not run when image analysis stops the run. There is no organize retry and no organize rate-limit message. The fixture preview remains only when notes were not built.
- Slide notes are local, in `fallbackSlideNotes`. A title stays the title. Bullets and numbered lists keep their kind. Tables stay tables. Image text stays source. Image descriptions stay interpretation. A skipped image adds nothing. Nothing on the slide is reworded by a model. `processSlide` rejects before any generate call. `POST /api/process-slide` has been removed.
- Organization is local, in `organizeLocally`. The title is the first slide title, or the file name when no slide has a title. Each slide is one section. The heading is the slide title, or "Slide N" when it has none. Section blocks are the slide blocks, copied, and a slide warning stays on that section. `organizeNotes` rejects before any generate call. `POST /api/organize` has been removed. The theme control is a sun or moon icon. Its accessible name is still "Switch to light mode" or "Switch to dark mode".
- Image analysis uses `gemini-3.5-flash-lite` unless `GEMINI_MODEL` is set. Confirmed Sep 29, 2026 from the models page (updated 2026-09-24) and the pricing page: that id has a free tier, and new projects are pointed at 3.5 Flash-Lite or 3.8 Flash. `gemini-3.8-flash` returned 503 high demand on the synthetic image the same day. The key stays in `.env.local` as `GEMINI_API_KEY`.
- Consent (Sep 29, 2026): Vasu's lecture may be sent to the Gemini free tier, where Google may use the content to improve its products.
- `ts-pptx@0.1.1` is installed. `src/lib/ppt/parse-pptx.ts` normalizes a PPTX into `Presentation`, sha256 image bytes (`contentHash`, also the image `assetId` until storage assigns a key), and warnings. Slide order follows `p:sldIdLst`.
- Local storage (`createLocalStorage`) writes extracted images under `.data/runs/<runId>/<sha256>` (gitignored), with a `<sha256>.meta.json` sidecar for the content type. The run id comes from `createRunId()` (UUID). The storage key is `<runId>/<sha256>`, and `put` rejects a key whose hash does not match the bytes. `purgeExpiredRuns` deletes run directories older than 24 hours. Parse uses that key as the image `assetId`. `GET /api/assets/<runId>/<hash>` returns those bytes and the stored content type. A key that is not a run id plus a content hash is 400. A missing file is 404. The route does not list directories. The extraction review and the notes draft show the pictures, including skipped logos, by URL. Image bytes stay out of the parse and analyze JSON. The committed synthetic deck is `fixtures/synthetic.pptx` (rebuild with `node fixtures/synthetic-deck.mjs`).
- **Sample PPTX:** `fixtures/private/sample.pptx` (946,979 bytes). Original: `C:\Users\TanishSharma\OneDrive - TrnDigital\Desktop\sample.pptx`. Never modify the original. `fixtures/private/` is gitignored.
  - S1 inspected it. 18 slides, 4:3, Marketing Management / consumer buying decision process (Ms. Shivani Kanaria, MIET School of Law). Two logo PNGs, three content PNGs, one background JPEG, one boilerplate notes part, one hyperlink, one lettered quiz list. No tables, groups, connectors, charts, SmartArt, equations, EMF/WMF, or hidden slides. Details: `docs/spikes/S1-parser.md`.
  - Whether it is Vasu's lecture is still unanswered.
  - At about 0.9 MB it does not exercise the large-upload path.
- **Private corpus (Sep 29, 2026):** counted in `docs/spikes/corpus.md`. Five unique picture decks are one PNG per slide and have no native text. `child-conflict-need-meaning.pptx` is 35 slides with 2 tables and a notes part on every slide; parser cell text and speaker notes match the package. `Juvenile_Justice_and_ChildRights.pptx` is a byte-for-byte duplicate of `Juvenile_Justice_and_Child_Rights.pptx`. `Juvenile_Justice_and_Child_Rights.pptx.pdf` is not a deck. Parsed in-process only.
- Notion export maps a `NoteDocument` to blocks in `src/lib/notion/adapter.ts` (no network). `POST /api/notion/export` creates a child page under `NOTION_PARENT_PAGE_ID`, appends children in chunks of 100, splits rich text at 2,000 characters, and uploads kept images from local storage with the File Upload API. A missing token, missing parent id, or Notion error returns a message and no page URL. The notes review shows Export to Notion once a document exists, and shows the returned URL on success. `.env.local` holds `GEMINI_API_KEY` and `NOTION_TOKEN` (gitignored). `NOTION_PARENT_PAGE_ID` is still empty. `.env.example` lists the keys.

---

## 5. Research findings (verified Sep 29, 2026) [VERIFY before use]

### 5.1 Vercel Hobby (free)
- Function max duration: **300 s** (default and max on Hobby, with Fluid Compute).
- Request/response body max: **4.5 MB** for a Vercel Function; larger returns `413 FUNCTION_PAYLOAD_TOO_LARGE`. Real lecture PPTX files with images commonly exceed this.
- Hobby is **non-commercial** use only. Fine for validation; revisit before any paid product.
- Other included free usage (approximate, from Vercel's Hobby page): 1M function invocations, 4 CPU-hours active CPU, 360 GB-hrs memory, 1 GB Blob storage, 100 deployments/day.
- Design consequence: (a) upload direct to storage; (b) client-driven short steps so no request is long; (c) no reliance on in-memory state between requests (serverless instances are not sticky).

### 5.2 Gemini API (free tier)
- Free-tier models exist among the Flash family. Rechecked Sep 29, 2026: the models page (updated 2026-09-24) lists `gemini-3.8-flash` as the current stable Flash and tells new projects to use `gemini-3.5-flash-lite` or `gemini-3.8-flash`. The pricing page lists a free tier for both. The app default is `gemini-3.5-flash-lite` because `gemini-3.8-flash` returned 503 high demand during S2. Override with `GEMINI_MODEL`.
- Structured output: `response_format` with a JSON Schema (subset of JSON Schema). Supported on current Flash/Pro models. Keep schemas small and shallow; the API can reject large or deeply nested schemas, and unsupported keywords are ignored.
- Image and other multimodal input count against the same rate limits as text.
- **Rate limits (RPM/TPM/RPD) are only shown in Google AI Studio for the specific project.** Not a single documented number. Measure with a full-lecture run.
- **Privacy:** on the free tier, submitted content **may be used to improve Google products**; on paid tier it is not. Vasu's lecture content would be sent to Google. He must be told and agree before real slides are processed.
- Paid tier is inexpensive (Flash-class about $0.75 per 1M input tokens and $3.75 per 1M output tokens through Dec 31, 2026, doubling from Jan 1, 2027). One lecture is expected to cost cents, not measured yet. Record real token usage per lecture in the spike.
- Keys: create in Google AI Studio (restricted to the Gemini API by default). Google stopped accepting unrestricted keys on June 19, 2026. Keep the key server-side only.
- Free-tier limits have been reduced over time; treat free quota as unreliable and keep the provider abstraction so switching is cheap.

### 5.3 Notion API
- **File upload flow:** `POST /v1/file_uploads` (mode `single_part` default; `multi_part` for over 20 MB; `external_url` also exists) -> send bytes to the returned `upload_url` as `multipart/form-data` with field `file` -> attach using `{ type: "file_upload", file_upload: { id } }` in an `image` block via `PATCH /v1/blocks/{id}/children`. Uploaded files must be attached **within 1 hour**, and Notion-hosted file URLs expire after 1 hour (re-fetch to refresh).
- Header `Notion-Version: 2026-03-11` was accepted on Sep 30, 2026 by `GET /v1/users/me` and the File Upload API (`docs/spikes/S3-notion.md`).
- Connection types: internal connections, public connections (OAuth 2.0), and personal access tokens. Public connections can be created and used without a Marketplace listing (a security review is only needed for listing).
- Internal connections need pages explicitly shared with the integration (Content access tab or the "Add connections" menu in Notion). The V1 setup must document this step; otherwise export fails with a permissions/not-found error.
- Integration needs "insert content" capability at minimum.
- Block-children append calls accept at most **100** children. Rich text `text.content` is at most **2,000** characters. Both are from the request-limits page (checked Sep 30, 2026). A live rejection of 101 children and of 2,001 characters was not run, because the integration could see no parent page. The adapter chunks at those documented limits.

### 5.4 PPTX parser candidates (quality NOT verified; spike required)
| Library | Notes |
|---|---|
| `@cliftonc/pptx-to-json` 0.2.1 | Ran in S1. `richText` keeps runs; flattened `content` drops inter-run spaces. Mis-labels `buAutoNum` as `bulletList`. Only library that extracted the slide-1 background JPEG. Fallback, not a dependency. |
| `pptxtojson` 2.2.0 | Ran in S1. Rejected. Content is HTML (`&nbsp;` between words). `import "pptxtojson"` is empty on Node because `main` is UMD. |
| `officeparser` 8.0.0 | Ran in S1. Rejected as the extractor. Text and ordered lists were faithful; no geometry; images are a package-wide attachment bag. |
| `ts-pptx` 0.1.1 | **Chosen.** Node/TypeScript port of python-pptx. Faithful text, EMU geometry, placeholders, pictures as raw bytes, notes, hyperlinks. Numbering is read from `paragraph.element` (`a:buAutoNum`), not a helper. Young; pin the version. |
| Custom thin layer | Not needed as the base. `lib/ppt` is the normalizer over `ts-pptx`. |

Known hard OOXML cases: grouped shapes (child coordinates relative to the group), SmartArt (`dgm` parts), charts, EMF/WMF images (not browser-renderable), OMML equations, placeholder inheritance from layouts/masters, reading order vs z-order, hidden slides, slide notes, hyperlinks, cropped images (`srcRect`), tables with merged cells.

---

## 6. Architecture

### 6.1 Shape
A single Next.js (App Router) TypeScript app. Modules communicate through typed contracts only.

```
src/
  app/
    page.tsx                  # landing/upload
    (flow pages or components for processing + preview)
    api/
      upload/                 # issue upload target / receive small files
      parse/                  # PPTX -> Presentation (+ image assets)
      analyze-image/          # ImageAnalysis for one image
      notion/export/          # NoteDocument -> Notion page
  components/{upload,processing,preview,notion}/
  lib/
    ppt/                      # parsing + normalization (deterministic)
    ai/                       # AIProvider interface + gemini impl + prompts/
      prompts/                # image-analysis.ts, slide-processing.ts, note-organization.ts (versioned)
    documents/                # NoteDocument types, validation, organizeLocally
    notion/                   # adapter + client (NO AI logic)
    storage/                  # Storage interface: local temp FS impl, Blob impl later
  types/
fixtures/                     # real/sample PPTX (gitignored if private)
docs/
```

This layout is conceptual; adapt it to what `create-next-app` generates and to project conventions, but keep the layer boundaries.

### 6.2 Layer responsibilities and forbidden couplings
- **ppt:** reads PPTX, normalizes to `Presentation`. No AI, no Notion, no UI.
- **ai:** interpretation and structured generation only. Knows `Presentation`/`SlideContext`, outputs `ImageAnalysis`/`SlideNotes`/`NoteDocument`. **Never** produces Notion JSON.
- **documents:** canonical note model, validation, transforms.
- **notion:** OAuth/token, API client, `NoteDocument -> Notion blocks`, image upload. Isolated; nothing else imports Notion types.
- **ui:** upload, progress, preview, export trigger.
- **storage:** temp/persistent assets behind an interface so local FS and Vercel Blob are swappable.

### 6.3 Statelessness and the client-driven flow
No DB. State between steps lives in (a) the client (in memory / session storage for the `Presentation` JSON and `NoteDocument`) and (b) the storage layer for binaries (PPTX and extracted images), keyed by an unguessable run id with a TTL/cleanup.

Proposed flow (each server call is short and independently retryable):

```
1. client uploads PPTX -> storage (direct upload)          -> returns runId
2. POST /parse         -> Presentation JSON + image asset ids (images stored under runId)
3. for each useful image: POST /analyze-image -> ImageAnalysis   (cached by content hash within run)
4. for each slide:        local fallbackSlideNotes (no Gemini call)
5. local organizeLocally  -> NoteDocument (no Gemini call)
6. preview (client)
7. POST /notion/export    -> Notion page URL
```

Why: keeps every request far under the 300 s Vercel limit, makes progress genuinely accurate (the brief forbids fake progress), isolates errors per slide, allows retries, and lets the same code later move into a worker/queue without redesign. Concurrency of steps 3-4 should be bounded (small pool) to respect Gemini rate limits and 429 handling with backoff.

**Locally** the same endpoints run in-process; the storage interface points at a temp directory. Do not build a different code path for local vs deployed beyond the storage implementation.

---

## 7. Data contracts (starting point; refine after library/API validation)

Use TypeScript types plus runtime validation (recommend Zod, then derive JSON Schema for Gemini structured output; check that the Zod-to-JSON-Schema output fits Gemini's supported subset). Every boundary that receives AI output must be runtime-validated; on failure, retry once with the validation error, then surface a per-slide error.

```typescript
interface Presentation {
  id: string;
  filename: string;
  title?: string;
  slides: Slide[];
}

interface Slide {
  slideNumber: number;               // 1-based, presentation order
  hidden?: boolean;
  elements: SlideElement[];          // stable order; also carry z-order and reading-order hints
  speakerNotes?: string;
  imageAnalyses?: ImageAnalysis[];
}

type SlideElement = TextElement | ImageElement | TableElement | ShapeElement;

interface BaseElement {
  id: string;                        // stable within the slide, e.g. "s17-e3"
  x?: number; y?: number; width?: number; height?: number;   // normalized units (define once, e.g. EMU or % of slide)
  zIndex?: number;
}

interface TextElement extends BaseElement {
  type: "text";
  paragraphs: { text: string; level: number; bullet?: "bullet" | "number" | "none" }[];
  isTitle?: boolean;                 // placeholder role if known
}

interface ImageElement extends BaseElement {
  type: "image";
  assetId: string;                   // storage key
  contentHash: string;               // for cache/dedup
  mimeType: string;
  altText?: string;                  // from the PPTX descr attribute, if any
  cropped?: boolean;
}

interface TableElement extends BaseElement { type: "table"; rows: string[][]; /* merged cells TBD */ }
interface ShapeElement extends BaseElement { type: "shape"; shapeType?: string; text?: string; connectsFrom?: string; connectsTo?: string; }

interface ImageAnalysis {
  imageId: string;
  containsUsefulInformation: boolean;
  kind?: "diagram" | "screenshot" | "text" | "photo" | "chart" | "equation" | "code" | "decorative";
  extractedText?: string;            // verbatim as seen; uncertain spans flagged
  description?: string;
  relationships?: string[];          // only relationships actually visible
  uncertainties?: string[];          // things the model could not read or was unsure about
}

interface SourceReference { slideNumber: number; elementId?: string }

interface SlideNotes {
  slideNumber: number;
  title?: string;
  blocks: NoteBlock[];
  sourceReferences: SourceReference[];
  warnings?: string[];               // surfaced in preview/debug
}

interface NoteDocument {
  title: string;
  sections: NoteSection[];
  sourceReferences?: SourceReference[];
}
interface NoteSection { heading?: string; level?: 1 | 2 | 3; blocks: NoteBlock[] }

type NoteBlock =
  | { type: "paragraph"; content: string }
  | { type: "bullets"; items: NoteListItem[] }       // nested items allowed
  | { type: "numbered"; items: NoteListItem[] }
  | { type: "image"; assetId: string; caption?: string; alt?: string }
  | { type: "code"; language?: string; content: string }
  | { type: "table"; rows: string[][]; header?: boolean }
  | { type: "divider" };
```

Design notes:
- Add a `provenance` flag (e.g. `"source" | "interpretation"`) on blocks that are AI-authored commentary (like diagram descriptions), so the preview can visually distinguish them from transcribed source text (principle 5).
- Nested lists matter: bullet hierarchy from the PPT must be preserved where possible.
- The `NoteDocument` schema is the stable contract for preview, Notion, tests, and future exports (Markdown/PDF). Changes to it need care; add fields rather than reshaping.

---

## 8. AI layer

### 8.1 Provider abstraction
```typescript
interface AIProvider {
  analyzeImage(input: ImageInput): Promise<ImageAnalysis>;
  processSlide(input: SlideContext): Promise<SlideNotes>;
  organizeNotes(input: SlideNotes[]): Promise<NoteDocument>;
}
```
V1 implements Gemini only. Model IDs, temperature, and retry policy come from config, not code. No SDK types leak outside `lib/ai`.

### 8.2 Image triage (deterministic before AI)
Skip AI for images that are obviously decorative using cheap deterministic signals: very small dimensions, extreme aspect ratios (thin lines/banners), repeated across many slides (logos/backgrounds, via content hash), image is part of the slide master/layout, and PPTX `descr` alt text indicating decorative. Everything else is sent to the vision model, which also returns `containsUsefulInformation` (final decision). Cache by `contentHash` within a run. Record skip reasons for debugging. Do not build a separate OCR product.

### 8.3 Per-slide context
Send: native slide text (with hierarchy), positions summarized in a form the model can use (e.g. reading-ordered elements with coarse layout hints, connector `from -> to` edges where available), that slide's `ImageAnalysis` results, and short neighbor summaries (previous and next slide titles/first lines, not full content). Never send the whole deck per request. A second **organization pass** merges `SlideNotes[]` into a `NoteDocument` (may need chunking for long decks; organization should operate on compact representations, not re-send images).

### 8.4 Prompts
- Live in `lib/ai/prompts/*.ts`, versioned (e.g. `PROMPT_VERSION` constants recorded with each run for eval comparison).
- One prompt per stage; no mega-prompt.
- Each must state: task/role, available source material, expected schema, do-not-invent rule, how to express uncertainty (`uncertainties`/`warnings`, not guesses), verbatim preservation of technical terms/numbers/code/equations, and source references.
- Slide prompt must bias toward **preserve then organize**, not summarize: keep every meaningful point; cleaning is limited to obvious extraction artifacts.

### 8.5 Reliability behaviors
- Structured output validated with Zod; one repair retry; then per-slide failure with a visible warning and raw source text fallback (a failed slide should degrade to its deterministic text, not disappear).
- Handle 429/5xx with exponential backoff and bounded concurrency.
- Log prompt version, model id, token counts, latency per call (no secrets, and avoid logging full slide content in shared logs).
- Equations: best effort only (perfect reconstruction is not required). Handwriting: not guaranteed.

---

## 9. Phase plan with acceptance criteria and gates

Build in vertical slices. Do not start a phase until the previous phase's gate is met, except where noted as parallel.

### Pre-work (Phase 0): spikes, before scaffolding decisions harden
Run as parallel read-only research/experiment tasks; each returns a short written recommendation (add to `docs/spikes/`).
- **S1 PPTX parser:** run the top candidates on the user's real PPTX. Compare on: slide count, text fidelity, bullet levels, image extraction (incl. formats like EMF), tables, grouped shapes, connectors, reading order, placeholders, speaker notes, hidden slides. Recommend: adopt library / adopt with patches / custom layer. Include a table of failures.
- **S2 Gemini:** structured output with a realistic `SlideNotes` schema; a diagram image and a screenshot; measure tokens, latency, free-tier limits hit. Confirm model IDs. Test OCR of technical text without "auto-correction."
- **S3 Notion:** create an internal integration, verify page creation, block chunking limits, image upload + attach end to end. Note the exact required headers/capabilities.

### Phase 1: UI skeleton with mocked data
Scaffold with `create-next-app` (TypeScript, Tailwind, App Router; add shadcn/ui if wanted), git init, lint/typecheck/test setup (Vitest recommended). Build upload UI (PPTX-only validation, size cap, drag/drop), a processing-state UI driven by a real stage model (even if mocked), and a `NoteDocument` preview renderer with mocked data. Establish the layer folders and types.
**Gate:** upload -> fake processing -> preview works; types compile; lint/test pass.

### Phase 2: Real PPTX extraction (can start in parallel with Phase 1 once types exist)
Implement `PPTX -> Presentation` per the spike result, image extraction to storage, deterministic normalization, error handling for malformed files.
**Gate (against the user's real PPTX):** correct slide count and order, text matches the source, images extracted with correct slide association and placement, tables extracted, no crashes; unit tests with fixtures.

### Phase 3: Image analysis
`AIProvider.analyzeImage`, triage, cache, prompt v1.
**Gate:** on the real deck, useful images produce accurate OCR/diagram analysis; decorative images skipped; no invented relationships; token/cost logged.

### Phase 4: Slide processing
`SlideContext -> SlideNotes` with structured output validation and repair retry.
**Gate:** slides yield faithful, structured notes; failures degrade gracefully.

### Phase 5: Organization
`SlideNotes[] -> NoteDocument` with coherent hierarchy, preserving detail.
**Gate:** a whole lecture yields a coherent document without dropping content.

### Phase 6: Real preview and quality checkpoint
Preview renders the real `NoteDocument`, distinguishes source vs interpretation, shows warnings.
**Gate (human):** the user/Vasu evaluates quality. **Do not start Notion export work until this passes.** If quality is poor, iterate on prompts/extraction, not on Notion.

### Phase 7: Notion export
Adapter `NoteDocument -> Notion blocks` (headings, paragraphs, bulleted/numbered lists incl. nesting, code, tables, dividers, images via File Upload API), chunked appends, destination selection (V1: a configured parent page), error handling and retry. Token-based first; OAuth only if the user decides.
**Gate:** exported page opens in Notion and matches the preview.

### Phase 8: Real-world validation
Vasu uses multiple real lectures. Track: processing success rate, time saved, manual corrections, missing content, bad OCR, diagram errors, whether he exports and studies from it. Add nothing until this data identifies a problem.

### Deployment (when Vasu needs a link, after Phase 6 at the earliest)
Vercel Hobby: swap the storage implementation to Blob, set env vars, confirm `maxDuration`, confirm bodies stay under 4.5 MB. Note Hobby is non-commercial.

---

## 10. Testing and evaluation

- **Unit (deterministic):** parsing, normalization, image extraction, slide ordering, document transforms, Notion block mapping. Use Vitest.
- **Integration:** PPTX -> Presentation; Presentation -> provider (mockable); NoteDocument -> Notion blocks (snapshot tests on the block payloads).
- **AI eval harness (build early):** a small corpus of real slides covering normal text, bullets, tables, diagrams, screenshots, OCR-heavy images, technical terminology, code screenshots. For each run, record prompt version + model id and score: completeness, fidelity to source, OCR accuracy, structure, diagram interpretation, hallucination. Compare runs across prompt versions. "Looks nice" is not a passing criterion.
- AI calls in CI-style tests must be mocked; live-model evals are a separate, manually triggered script.

---

## 11. Errors, security, privacy

- Distinguish **user errors** (wrong type, malformed PPTX, too large, unsupported content) from **processing errors** (parse failure, image extraction failure, AI failure or invalid output, Notion failure). Actionable messages, retry where appropriate, useful logs, **never leak secrets**.
- Validate uploads server-side: extension and magic bytes (PPTX is a ZIP), size cap, zip-bomb/decompression limits (cap total uncompressed size and entry count), path traversal in entry names, and sanitize filenames.
- Secrets (`GEMINI_API_KEY`, `NOTION_TOKEN`) only in `.env.local` (gitignored) and never sent to the client. Provide `.env.example`.
- Run ids must be unguessable; temp files and stored assets get a TTL and cleanup.
- **Privacy:** lecture content goes to Google (Gemini) and, on export, to Notion. On the Gemini **free tier** it may be used to improve Google products. Consent for free-tier processing of Vasu's lecture was given Sep 29, 2026, and is recorded in Section 4. Don't log full slide content to shared/third-party logs.
- Optional later: a switch to a paid Gemini key for no-training processing.

---

## 12. Repo hygiene and conventions

- `git init`; `.gitignore` must include `node_modules`, `.next`, `.env*` (except `.env.example`), `fixtures/private/` (or the real PPTX itself), temp/output directories.
- Put the user's real sample at `fixtures/private/<name>.pptx` (gitignored). Keep only non-sensitive synthetic fixtures in tracked paths.
- TypeScript strict mode; ESLint + `tsc --noEmit` + tests wired into npm scripts (`lint`, `typecheck`, `test`).
- Avoid unnecessary dependencies. Prefer official docs for API contracts. Prefer boring, well-maintained libraries.
- Commit in small vertical slices with clear messages **only when the user asks you to commit.**
- Keep `docs/` current: update Section 13 (open items) and add spike notes under `docs/spikes/` as work proceeds.

---

## 13. Open items and immediate first actions

### First actions, in order
1. ~~Get the sample PPTX~~ **Done:** it is at `fixtures/private/sample.pptx`. More decks are counted in `docs/spikes/corpus.md`. Ask the user only whether the sample is Vasu's real lecture or a stand-in.
2. Ask the user to **confirm the Notion approach** ([ASSUMED] internal token first, OAuth later). Can wait until Phase 7, but note it.
3. ~~Run Spike S1~~ **Done** (`docs/spikes/S1-parser.md`). ~~S2~~ **Done** on a synthetic PNG only (`docs/spikes/S2-gemini.md`). S3 confirmed the version header and one PNG upload (`docs/spikes/S3-notion.md`). Do not send a lecture deck to Notion until a shared parent page accepts a throwaway page. The sample deck may go to Gemini only because consent was given Sep 29, 2026.
4. ~~Scaffold Phase 1~~ **Done.** Next.js 16.3.7, npm, lint / typecheck / test. Phase 2 parser, local image storage, `POST /api/parse`, and the extraction review are in place. Phase 3 image analysis is in place. Phase 4 per-slide notes are local (`fallbackSlideNotes`); Gemini is image-only. Phase 5 organization is local (`organizeLocally`); Gemini stays image-only. Phase 7 export code is in the app and stays idle until `NOTION_PARENT_PAGE_ID` is set.
5. ~~Shared types and Zod schemas~~ **Done** under `src/lib/`.

### Open items
- [x] Sample PPTX path (received; `fixtures/private/sample.pptx`)
- [ ] Is the sample Vasu's real lecture?
- [x] More decks are in `fixtures/private/`, including larger image-heavy ones. Counts: `docs/spikes/corpus.md`
- [x] Gemini API key (in `.env.local` as `GEMINI_API_KEY`; not committed)
- [x] Vasu's explicit consent for free-tier data use (Sep 29, 2026)
- [x] Notion approach: API token in `.env.local`. OAuth stays out (Sep 30, 2026)
- [ ] Notion parent page shared with the connection and with Vasu, then `NOTION_PARENT_PAGE_ID` set. The token works. Search on Sep 30, 2026 returned no pages
- [x] Parser spike result (S1): `ts-pptx@0.1.1` plus our normalizer. Hard OOXML cases were not in the sample
- [x] Current Gemini model id for this app: `gemini-3.5-flash-lite` (free tier). `gemini-3.8-flash` is the newer stable Flash and was returning 503 high demand on Sep 29, 2026. Rate limits are still project-specific and unmeasured for a full lecture
- [x] Max upload size cap: 50 MB locally. Vercel 4.5 MB still applies to function bodies
- [ ] Eval rubric and corpus (Section 10)
- [x] Table extraction against a real deck (Sep 29, 2026). `child-conflict-need-meaning.pptx` has 35 slides and 2 tables. Parser cell text matches the package, and speaker notes are kept on each slide that has a notes part. Counts: `docs/spikes/corpus.md`. The private sample and the picture-only decks have no tables. A hand-built package in the parser tests still covers a simple table; `fixtures/synthetic.pptx` does not.

### Known risks
1. **PPTX complexity:** SmartArt, grouped shapes, EMF/WMF, equations, charts may be poorly handled by libraries. Mitigation: spike first; degrade gracefully and flag in warnings.
2. **Free Gemini quota:** may be too small for a whole deck or may change. Mitigation: bounded concurrency, backoff, provider abstraction, cheap paid fallback.
3. **Hallucinated diagram relationships:** highest fidelity risk. Mitigation: prompts that forbid unseen relationships, `uncertainties` field, provenance flag, eval set of diagrams, prefer omission.
4. **Notion limits:** block counts, text length, rate limits, image expiry windows. Mitigation: chunked appends, upload-then-attach within the 1-hour window, retries.
5. **Serverless statelessness on Vercel:** any in-memory caching across requests is unreliable. Mitigation: state in client + storage only.
6. **Privacy/consent:** third-party processing of a student's material. Mitigation: explicit consent, paid-tier option.
7. **Scope creep:** the brief's out-of-scope list (chat, flashcards, RAG, multi-agent, accounts, billing, dashboards) is binding for V1.

---

## 14. Operating protocol for the orchestrating agent

- Treat the brief and this file as the spec; validate "conceptual" items against real runtime and current official docs before committing to them.
- Prefer **parallel, read-only research** for spikes; keep implementation in small vertical slices with clear acceptance criteria.
- Define contracts (types + Zod) before parallelizing UI and extraction work; the two meet only at those types.
- Respect phase gates, in particular the **Phase 6 quality checkpoint before Notion work.**
- After significant edits run lint/typecheck/tests and fix what you introduced.
- Ask the user only for decisions that are genuinely theirs (consent, keys, sample files, product trade-offs); otherwise choose sensible defaults and record them here.
- Do not commit, push, or deploy unless asked. Do not send the user's slides to any external service other than the agreed AI provider, and only after consent.
- Keep this document accurate: when a decision or finding changes, update the relevant section and note the date.

---

## 15. Glossary

- **Presentation / Slide / SlideElement:** normalized deterministic representation of the PPTX.
- **ImageAnalysis:** AI output describing one image (useful?, text, description, relationships, uncertainties).
- **SlideContext:** input assembled for the slide-processing step.
- **SlideNotes:** structured notes for one slide.
- **NoteDocument:** canonical, provider-neutral, destination-neutral note structure. The hub of the system.
- **Adapter:** converts `NoteDocument` to a destination format (Notion first).
- **Vasu:** the primary validation user, a college student whose real workflow defines V1.
