# Lecture-to-Notes — Product & Engineering Brief

**Status:** V1 planning  
**Purpose:** Source-of-truth context for Cursor / coding agents  
**Primary validation user:** Vasu, a college student  
**Core problem:** Manually converting lecture PowerPoint presentations into structured Notion notes is repetitive, slow, and error-prone.

---

## 1. Product Summary

Lecture-to-Notes is a tool that turns a student's lecture PowerPoint (`.pptx`) into a clean, structured, editable set of study notes.

The user currently has to:

1. Open a lecture PPT.
2. Open Notion.
3. Manually copy text from slide to slide.
4. Handle images and diagrams manually.
5. Use random online OCR tools when images contain text.
6. Correct OCR errors manually.
7. Organize everything in Notion.
8. Only after all of this can they begin reviewing, correcting, and enriching the notes.

The product should automate the mechanical transcription/structuring work while **keeping the student in control of the final notes**.

### Core product promise

> Upload a lecture PPT and get a structured draft of the lecture notes that can be reviewed and exported into Notion.

The system should **not** try to replace studying or guarantee that AI-generated notes are perfect. It creates a strong first draft that the student reviews and enriches.

---

# 2. The Initial User and Validation Goal

## Primary user

Vasu, a college student.

His workflow is the initial product specification because it is based on a real repeated workflow rather than an invented hypothetical problem.

## Validation question

The first important question is NOT:

- Can we build a SaaS?
- Can we get thousands of users?
- Can we monetize immediately?
- Can we build the most sophisticated AI note-taking system?

The first question is:

> **Would Vasu rather review AI-generated notes than manually create the notes himself?**

The first real milestone is therefore:

```text
Vasu's real lecture PPT
        ↓
Our processing pipeline
        ↓
High-quality structured notes
        ↓
Notion
        ↓
Vasu reviews/edits/enriches
```

If Vasu repeatedly uses this for real lectures, we have evidence of product value.

---

# 3. Product Philosophy

## Human-in-the-loop

The product should automate **mechanical work**, not remove the student from the learning process.

The intended workflow is:

```text
Lecture PPT
    ↓
Automated extraction
    ↓
AI processing
    ↓
Structured draft notes
    ↓
Human review
    ↓
Human edits / additional context
    ↓
Notion / personal study workspace
```

The AI output should be treated as a **draft**, not authoritative educational material.

## Avoid unnecessary AI

Use deterministic processing wherever possible.

For example:

- PPT text extraction should be deterministic.
- Image extraction should be deterministic.
- Slide ordering should be deterministic.
- Notion block creation should be deterministic.
- AI should be used where reasoning or multimodal understanding adds value:
  - interpreting diagrams
  - cleaning OCR
  - understanding screenshots
  - understanding the relationship between image and surrounding slide content
  - structuring notes
  - preserving technical meaning

Do not send an entire PPT blindly to an LLM and ask for generic notes.

---

# 4. V1 Scope

## Must-have

### 4.1 PPTX upload

User can upload a `.pptx` file.

Initial UI:

```text
--------------------------------------
        Turn lectures into notes

        Drop your PowerPoint here

             [ Upload PPTX ]
--------------------------------------
```

Validation:

- Accept `.pptx`.
- Reject unsupported file types.
- Have a reasonable maximum file size.
- Display upload/processing state.
- Handle malformed PPTX files gracefully.

---

### 4.2 Slide extraction

For every slide, extract as much deterministic information as possible:

- Slide number
- Text
- Text hierarchy where available
- Images
- Tables where possible
- Shapes where useful
- Basic positional information
- Image placement/order
- Other useful slide metadata

Internal representation should preserve slide ordering.

Example conceptual model:

```typescript
interface Slide {
  slideNumber: number;
  elements: SlideElement[];
}

type SlideElement =
  | TextElement
  | ImageElement
  | TableElement
  | ShapeElement;
```

The exact implementation can differ after repository/technology research.

---

### 4.3 Image processing

Slides can contain:

- diagrams
- screenshots
- scanned text
- photographs
- charts
- equations
- screenshots of code
- decorative images

The system should determine whether an image contains useful information.

Conceptually:

```text
Image
  ↓
Is it useful?
  ├── Decorative → ignore
  ├── Text-heavy → OCR / vision
  ├── Diagram → vision analysis
  ├── Screenshot → vision/OCR
  └── Photo → preserve/describe if relevant
```

Do not build a separate traditional OCR product unless it proves necessary.

For V1, a capable multimodal model can be used for OCR + visual interpretation.

---

### 4.4 AI slide processing

AI receives the extracted slide context.

A slide may be processed using:

- native PPT text
- extracted image(s)
- image analysis
- neighboring slide context where useful

Example conceptual input:

```text
SLIDE 17

Native text:
"Deadlock occurs when..."

Image:
[diagram]

Previous slide:
"Four necessary conditions..."

Next slide:
"Resource allocation graph..."
```

The AI should produce structured content rather than arbitrary prose.

---

### 4.5 Structured note output

Do NOT have the model generate Notion API JSON directly.

Use an internal canonical representation:

```text
PPT
 ↓
Extraction model
 ↓
AI processing
 ↓
NoteDocument
 ↓
Notion adapter
 ↓
Notion blocks
```

Conceptual `NoteDocument`:

```typescript
interface NoteDocument {
  title: string;
  sections: NoteSection[];
}

interface NoteSection {
  heading?: string;
  blocks: NoteBlock[];
}

type NoteBlock =
  | ParagraphBlock
  | BulletListBlock
  | NumberedListBlock
  | ImageBlock
  | CodeBlock
  | TableBlock
  | DividerBlock;
```

This is a conceptual contract, not a mandatory final schema. Cursor should refine it after evaluating the chosen libraries and APIs.

---

### 4.6 Preview/review

Before export, show the generated notes.

Example:

```text
Operating Systems — Lecture 04

# Process Synchronization

## Critical Section

A critical section is ...

### Requirements

- Mutual exclusion
- Progress
- Bounded waiting

[Diagram]

The diagram illustrates ...

--------------------------------

[ Export to Notion ]
```

The preview is important because:

1. AI output can be wrong.
2. Users need to trust what will be exported.
3. It gives us a debugging/quality-control surface.
4. It lets the student review before material is committed to Notion.

V1 does not necessarily need a sophisticated editor.

A readable preview is enough initially.

---

### 4.7 Notion export

The product should eventually allow the user to connect their Notion account and export the generated notes.

Expected flow:

```text
Connect Notion
      ↓
Notion OAuth
      ↓
User authorizes application
      ↓
User chooses destination
      ↓
Create Notion page
      ↓
Insert blocks
```

The resulting structure could resemble:

```text
Operating Systems
└── Lecture 04 - Process Synchronization
      ├── Overview
      ├── Critical Section
      ├── Requirements
      ├── Peterson's Solution
      ├── Semaphores
      └── Diagrams
```

Notion export should be implemented as an adapter over the canonical `NoteDocument`.

Do not tightly couple the AI output schema to Notion's API schema.

---

# 5. V1 User Journey

## Step 1 — Landing/upload

User visits the application.

They see a simple page with:

- Product name/value proposition
- PPT upload area
- Upload button

No complicated dashboard is necessary.

---

## Step 2 — Upload

User selects a `.pptx`.

The backend receives the file.

---

## Step 3 — Processing

Show progress such as:

```text
Operating Systems - Lecture 04

✓ 47 slides extracted
✓ 19 images detected
✓ 14 images processed
● Structuring notes...
○ Preparing Notion page
```

Progress should reflect actual stages where possible.

Do not fake granular progress if the backend cannot accurately provide it.

---

## Step 4 — Preview

User sees structured notes.

They can inspect the generated content.

---

## Step 5 — Export

User clicks:

```text
Export to Notion
```

If Notion is not connected:

```text
Connect Notion
```

Then authenticate/authorize.

---

## Step 6 — Human review

The user opens the resulting Notion page and:

- fixes errors
- adds additional explanations
- adds links
- adds personal notes
- highlights important concepts
- studies/reviews the material

---

# 6. High-Level Architecture

Initial architecture:

```text
                    ┌──────────────────────┐
                    │      Next.js UI      │
                    │                      │
                    │  Upload PPTX         │
                    │  Processing status   │
                    │  Preview notes       │
                    └──────────┬───────────┘
                               │
                         API / Server
                               │
              ┌────────────────┴────────────────┐
              │                                 │
       PPTX Processing                    AI Processing
              │                                 │
       ┌──────▼──────┐                ┌────────▼────────┐
       │ Extract text│                │ Vision / LLM     │
       │ Extract imgs│                │ OCR cleanup      │
       │ Slide layout│                │ Diagram context  │
       └──────┬──────┘                │ Note structure   │
              │                       └────────┬────────┘
              └────────────────┬──────────────┘
                               │
                         Structured notes
                               │
                               ▼
                      ┌─────────────────┐
                      │ Notion API      │
                      │ Create page     │
                      │ Add blocks      │
                      └─────────────────┘
```

---

# 7. Recommended V1 Technology Stack

| Component | Choice |
|---|---|
| Frontend | Next.js |
| Language | TypeScript |
| UI styling | Tailwind CSS |
| UI components | shadcn/ui |
| Backend | Next.js Route Handlers / server-side code |
| PPT processing | Node.js-compatible PPTX parser |
| AI | Multimodal LLM |
| OCR | Multimodal vision model initially |
| Notion | Notion API + OAuth |
| Database | None initially |
| Queue | None initially |
| Storage | Temporary filesystem or object storage as needed |
| Hosting | Vercel is a reasonable initial target |
| Source control | GitHub |

These are recommended defaults, not immutable requirements. Cursor should validate current library/API compatibility before implementation.

---

# 8. Next.js Architecture

The initial application can be a single Next.js application.

Suggested conceptual structure:

```text
src/
  app/
    page.tsx
    api/
      upload/
      process/
      notion/
        connect/
        callback/
        export/

  components/
    upload/
    processing/
    preview/
    notion/

  lib/
    ppt/
    ai/
    notion/
    documents/
    storage/

  types/
```

Exact directory structure should follow the project's conventions.

Avoid prematurely splitting the application into microservices.

---

# 9. Backend Processing Pipeline

The processing pipeline should be modular.

Conceptually:

```text
PPTX
  ↓
PPTX Parser
  ↓
Presentation Model
  ↓
Image Extraction
  ↓
Image Analysis
  ↓
Slide Context Assembly
  ↓
AI Slide Processing
  ↓
NoteDocument
  ↓
Preview
  ↓
Notion Adapter
  ↓
Notion Page
```

---

# 10. PPTX Extraction Layer

The extraction layer should be deterministic wherever possible.

Responsibilities:

1. Open/read the PPTX.
2. Enumerate slides.
3. Extract text.
4. Extract images.
5. Extract tables if library support is adequate.
6. Preserve ordering.
7. Preserve positional/layout metadata if available.
8. Produce normalized internal models.

Example:

```typescript
interface Presentation {
  title?: string;
  slides: Slide[];
}

interface Slide {
  slideNumber: number;
  elements: SlideElement[];
}

interface TextElement {
  type: "text";
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ImageElement {
  type: "image";
  id: string;
  sourcePath: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
```

The actual model can be improved during implementation.

---

# 11. Why Positional Information Matters

A PowerPoint slide is not merely a bag of text.

Example:

```text
                    TCP
                     │
        ┌────────────┴───────────┐
        │                         │
 Connection-oriented          Reliable
        │                         │
  3-way handshake          ACK / retransmission
```

A raw text extractor may produce:

```text
TCP
Connection-oriented
Reliable
3-way handshake
ACK / retransmission
```

The relationships are lost.

Therefore, preserve layout information wherever practical.

AI/vision processing can then help reconstruct the meaning.

This is especially important for:

- architecture diagrams
- flowcharts
- graphs
- network diagrams
- process diagrams
- annotated screenshots
- technical illustrations

---

# 12. AI Provider Abstraction

Do not hard-code the entire application around one model provider.

Use an internal abstraction.

Conceptually:

```typescript
interface AIProvider {
  analyzeImage(input: ImageInput): Promise<ImageAnalysis>;
  processSlide(input: SlideContext): Promise<SlideNotes>;
  organizeNotes(input: SlideCollection): Promise<NoteDocument>;
}
```

Possible providers:

```text
AIProvider
   │
   ├── OpenAI
   ├── Anthropic
   └── Gemini
```

V1 can implement only one provider.

The abstraction exists to prevent the rest of the system from becoming provider-specific.

---

# 13. AI Responsibilities

The AI should be used for tasks that require interpretation.

## Image analysis

Potential output:

```json
{
  "containsUsefulInformation": true,
  "extractedText": "...",
  "description": "...",
  "relationships": [
    "A connects to B",
    "B leads to C"
  ]
}
```

This is conceptual.

The exact structured schema should be finalized during implementation.

---

## OCR

The model should extract textual content from:

- screenshots
- scanned slides
- diagrams containing labels
- images with embedded text

Important requirement:

> Preserve technical terminology and do not silently "correct" technical text based on assumptions.

OCR output should be treated as potentially imperfect.

---

## Diagram understanding

For diagrams, text alone is insufficient.

The model should be able to describe:

- major components
- labels
- relationships
- arrows/flows
- relevant hierarchy
- what the diagram is communicating

Example:

```text
The diagram shows a client sending a request to a server.
The server forwards the request to a database and returns the result.
```

The system should avoid inventing relationships that are not visible.

---

## Slide structuring

AI should identify:

- title
- sections
- definitions
- explanations
- bullet points
- examples
- important relationships
- image/diagram context

---

# 14. AI Output Contract

The AI should produce structured output, not arbitrary Markdown only.

Conceptual:

```json
{
  "title": "Deadlock",
  "sections": [
    {
      "heading": "Definition",
      "blocks": [
        {
          "type": "paragraph",
          "content": "..."
        }
      ]
    },
    {
      "heading": "Necessary Conditions",
      "blocks": [
        {
          "type": "bullets",
          "items": [
            "Mutual exclusion",
            "Hold and wait",
            "No preemption",
            "Circular wait"
          ]
        }
      ]
    }
  ]
}
```

Structured output enables:

- validation
- preview rendering
- Notion conversion
- future exports
- future editing
- testing

---

# 15. Context Strategy

Do not automatically send all slides to the model in every request.

Prefer staged processing.

Potential strategy:

```text
Slide N
  + native text
  + relevant image analysis
  + previous slide summary
  + next slide summary
```

For complex presentations, a second organization pass can combine slide-level results.

Possible architecture:

```text
                    PPTX
                     │
                     ▼
             Slide-level processing
              /       |       \
           Slide 1  Slide 2  Slide N
              \       |       /
                     ▼
              Note organization
                     │
                     ▼
                NoteDocument
```

This helps with:

- context windows
- cost control
- error isolation
- retries
- structured debugging

---

# 16. Processing Stages

Suggested stages:

### Stage 1 — Parse

```text
PPTX → Presentation
```

### Stage 2 — Extract assets

```text
Presentation → text + images + tables + layout
```

### Stage 3 — Analyze images

```text
Images → ImageAnalysis
```

### Stage 4 — Build slide context

```text
Slide + image analysis + neighboring context
```

### Stage 5 — Generate slide notes

```text
SlideContext → SlideNotes
```

### Stage 6 — Organize

```text
SlideNotes[] → NoteDocument
```

### Stage 7 — Preview

```text
NoteDocument → Web UI
```

### Stage 8 — Export

```text
NoteDocument → Notion blocks
```

---

# 17. Notion Integration

Notion should be treated as an external destination, not as the internal data model.

## OAuth flow

Conceptually:

```text
User
 ↓
Connect Notion
 ↓
Notion authorization
 ↓
OAuth callback
 ↓
Store connection/token securely
 ↓
Allow destination selection
 ↓
Export
```

The implementation must follow the current official Notion API/OAuth requirements at development time.

Do not hard-code outdated Notion API assumptions.

---

# 18. Notion Block Adapter

The canonical `NoteDocument` should be converted to Notion blocks.

Example mapping:

```text
NoteDocument
    │
    ├── heading → Notion heading block
    ├── paragraph → Notion paragraph block
    ├── bullets → Notion bulleted list blocks
    ├── numbered list → Notion numbered list blocks
    ├── code → Notion code block
    ├── image → Notion image/file block
    ├── table → Notion table where supported
    └── divider → Notion divider
```

This adapter should be isolated in something like:

```text
lib/notion/
```

Do not put Notion-specific logic into AI prompts or core document models.

---

# 19. Authentication

Authentication is **not a V1 requirement** unless it becomes necessary for Notion OAuth or deployment constraints.

Do not build:

- email/password accounts
- social login
- user profiles
- organizations
- teams

unless required by an actual workflow.

Notion OAuth itself will necessarily introduce identity/authorization concerns.

Keep them minimal.

---

# 20. Database

### V1: no database unless required.

The initial flow can be stateless:

```text
Upload
 → Process
 → Preview
 → Export
```

A database becomes justified when we need persistent:

- users
- documents
- processing jobs
- usage
- Notion connections
- history

Do not add PostgreSQL simply because production applications usually have databases.

---

# 21. Storage

For early development, temporary storage may be enough.

If uploaded PPTX/image files need persistence or asynchronous processing, use object storage.

Potential providers:

- Cloudflare R2
- S3
- Azure Blob Storage
- Vercel-compatible storage

Choice should be based on the actual hosting/runtime requirements.

Do not introduce cloud storage complexity before it is needed.

---

# 22. Queue / Worker Architecture

### V1: no queue required if processing completes within acceptable request/runtime limits.

However, design the processing code so it can later be moved into a worker.

Future architecture:

```text
Next.js
   ↓
Job Queue
   ↓
Processing Worker
   ├── PPTX parser
   ├── image analysis
   ├── AI processing
   └── document generation
   ↓
Job result
```

Possible future technologies:

- BullMQ
- Inngest
- Trigger.dev
- managed queues
- cloud-native job systems

Do not choose one until processing constraints require it.

---

# 23. Error Handling

The system must distinguish between:

## User errors

Examples:

- invalid file type
- malformed PPTX
- file too large
- unsupported content

Show actionable messages.

## Processing errors

Examples:

- PPTX parsing failed
- image extraction failed
- AI request failed
- AI structured output invalid
- Notion export failed

The system should provide:

- meaningful error messages
- retry where appropriate
- enough logging for debugging
- no leakage of API secrets

---

# 24. AI Reliability Requirements

The system should explicitly account for hallucination and extraction errors.

Important principles:

1. Do not invent information that is absent from the lecture material.
2. Preserve source wording for technical terminology where practical.
3. Do not silently alter numbers, equations, identifiers, code, or definitions.
4. Clearly distinguish extracted source content from AI interpretation.
5. Do not claim that OCR is perfect.
6. Prefer omission over fabricated detail.
7. Preserve source slide references internally for debugging.

A useful internal model may contain:

```typescript
interface SourceReference {
  slideNumber: number;
  elementId?: string;
}
```

This can later support traceability such as:

> This paragraph came from slides 17–18.

Not necessarily required in the first UI.

---

# 25. Important Content Types

The implementation should consider these cases:

### Normal text

Easy deterministic extraction.

### Bullet lists

Preserve hierarchy where possible.

### Tables

Extract if supported.

### Images with text

Use multimodal processing/OCR.

### Diagrams

Use vision + contextual interpretation.

### Code screenshots

OCR carefully; preserve syntax where possible.

### Mathematical equations

Potentially difficult. V1 should support them as well as the chosen model/library permits, but perfect equation reconstruction is not a hard requirement.

### Handwritten annotations

Potentially useful but not a V1 guarantee.

### Decorative images

Avoid wasting AI calls on them.

---

# 26. Cost Control

The first version should prioritize correctness and product validation over aggressive cost optimization.

Nevertheless:

- Do not send duplicate images repeatedly.
- Avoid sending decorative images to expensive vision models.
- Cache image analysis during a processing run.
- Process only relevant images.
- Use deterministic extraction before AI.
- Use structured output.
- Keep prompts concise and task-specific.
- Process slides independently where possible.

Later optimization can include:

- model routing
- cheaper models for OCR
- stronger models only for difficult diagrams
- batching
- caching
- token budgeting

---

# 27. Prompting Strategy

Prompts should be versioned in code rather than scattered through business logic.

Conceptual:

```text
prompts/
  image-analysis.ts
  slide-processing.ts
  note-organization.ts
```

Prompts should explicitly state:

- role/task
- available source material
- expected schema
- do-not-invent constraints
- handling of uncertainty
- technical terminology preservation
- source references

Do not write one giant prompt that attempts to solve every stage.

---

# 28. Testing Strategy

Testing should cover deterministic and AI portions differently.

## Unit tests

For deterministic logic:

- PPT parsing
- normalization
- image extraction
- slide ordering
- document transformations
- Notion block mapping

## Integration tests

- PPTX → normalized presentation
- normalized presentation → AI provider
- NoteDocument → Notion blocks

## AI evaluation tests

Create a small corpus of real/sample lecture slides containing:

- normal text
- bullet lists
- diagrams
- screenshots
- OCR-heavy images
- tables
- technical terminology

Evaluate:

- completeness
- factual fidelity to source
- OCR accuracy
- structure
- diagram interpretation
- absence of hallucinations

Do not judge only by whether the output "looks nice."

---

# 29. Development Strategy

Build in vertical slices.

## Phase 1 — UI skeleton

Build:

- Next.js app
- upload UI
- processing UI
- preview UI
- mocked data

No AI yet.

Goal:

```text
Upload → fake processing → preview
```

---

## Phase 2 — Real PPTX extraction

Implement:

```text
PPTX → Presentation
```

Test using Vasu's actual PPT.

Goal:

- correct slide count
- correct text
- extracted images
- slide ordering
- useful metadata

---

## Phase 3 — AI image processing

Implement:

```text
Image → ImageAnalysis
```

Test against real lecture images.

Goal:

- OCR
- diagrams
- screenshots
- technical labels

---

## Phase 4 — AI slide processing

Implement:

```text
SlideContext → SlideNotes
```

Use structured outputs.

---

## Phase 5 — Document organization

Implement:

```text
SlideNotes[] → NoteDocument
```

Generate a coherent note hierarchy.

---

## Phase 6 — Preview

Render the actual `NoteDocument`.

Goal:

```text
Real PPT
 ↓
Real AI
 ↓
Real preview
```

At this point Vasu can evaluate quality.

---

## Phase 7 — Notion integration

Implement:

- Notion OAuth
- destination selection
- page creation
- block conversion
- export
- error handling

---

## Phase 8 — Real-world validation

Give Vasu multiple real lectures.

Track:

- processing success
- time saved
- manual corrections
- missing content
- bad OCR
- diagram errors
- whether he actually exports to Notion
- whether he uses the notes to study

Do not add features until real usage identifies a problem.

---

# 30. V1 Explicitly Out of Scope

Do NOT build these unless validation demands them.

### Product features

- Mobile application
- Desktop application
- Browser extension
- Collaborative editing
- Sharing
- Public note marketplace
- Social features
- Comments
- Teams
- Organizations
- Teacher dashboards
- College administration dashboards

### AI features

- Automatic tutoring
- AI chat over notes
- Flashcards
- Quiz generation
- Exam prediction
- Personalized study plans
- Spaced repetition
- Web research
- Automatic citations/references
- RAG/vector database
- Multi-agent architecture

These may become future features, but they are not required to validate the core workflow.

### Infrastructure

- Microservices
- Kubernetes
- Complex job orchestration
- Event-driven architecture
- Multiple databases
- Elaborate observability platform
- Multi-region deployment

### Business

- Payment system
- Subscription plans
- Team billing
- Usage-based billing
- Marketing automation
- Referral system
- Affiliate system

### Authentication

- Full user account system

Notion OAuth may require limited identity/connection handling.

---

# 31. Future Product Direction

If the core workflow succeeds, the product can evolve from:

> PPT → Notion

into:

> Lecture material → Personal study workspace

Potential future capabilities:

```text
PPT
 ├── Structured notes
 ├── Diagrams
 ├── OCR
 ├── References
 ├── Flashcards
 ├── Practice questions
 ├── Summaries
 ├── Revision sheets
 └── AI tutor
```

Potential input sources:

- PowerPoint
- PDF
- lecture recordings
- screenshots
- handwritten notes
- course documents

Potential output destinations:

- Notion
- Markdown
- PDF
- other note systems

But none of this should distract from V1.

---

# 32. Important Product Boundary

The product is not:

> "AI summarizes your lecture."

That is generic and easy to replicate.

The initial product is:

> **"Remove the manual transcription work between a lecture PPT and the student's editable study notes."**

The product should preserve useful detail rather than aggressively summarize everything.

A student who currently manually copies every slide does not necessarily want a 5-slide summary of a 50-slide lecture.

They want:

```text
Original lecture material
        ↓
cleaner / structured / searchable representation
        ↓
their own review and enrichment
```

Therefore, **information preservation is a core requirement.**

---

# 33. UX Principle: Preserve, Then Enhance

The AI should generally prefer:

```text
Preserve source information
        ↓
Organize it
        ↓
Clean obvious extraction errors
        ↓
Add interpretation only when useful
```

rather than:

```text
Aggressively summarize
        ↓
Potentially lose important lecture content
```

This distinction is central to the product.

---

# 34. Potential Canonical Data Model

A more complete conceptual model:

```typescript
interface Presentation {
  id: string;
  filename: string;
  title?: string;
  slides: Slide[];
}

interface Slide {
  slideNumber: number;
  elements: SlideElement[];
  imageAnalyses?: ImageAnalysis[];
}

type SlideElement =
  | TextElement
  | ImageElement
  | TableElement
  | ShapeElement;

interface ImageAnalysis {
  imageId: string;
  containsUsefulInformation: boolean;
  extractedText?: string;
  description?: string;
  relationships?: string[];
}

interface SlideNotes {
  slideNumber: number;
  title?: string;
  blocks: NoteBlock[];
  sourceReferences: SourceReference[];
}

interface NoteDocument {
  title: string;
  sections: NoteSection[];
  sourceReferences?: SourceReference[];
}
```

This is a starting point, not a final API contract.

---

# 35. Suggested Project Boundaries

Keep responsibilities separate.

```text
PPT layer
  Responsible for reading PPTX and normalizing source data.

AI layer
  Responsible for interpretation and structured generation.

Document layer
  Responsible for canonical note representation.

Notion layer
  Responsible for OAuth and Notion API conversion.

UI layer
  Responsible for upload, progress, preview, and export.

Storage layer
  Responsible for temporary/persistent assets when required.
```

Avoid cross-layer leakage.

For example:

BAD:

```text
AI prompt directly generates Notion API block JSON.
```

GOOD:

```text
AI → NoteDocument → NotionAdapter → Notion API
```

---

# 36. Agent Instructions for Cursor

Cursor should treat this document as the initial product specification.

Before implementing major architecture:

1. Inspect the repository.
2. Identify existing framework/configuration.
3. Check current Node/Next.js versions.
4. Check package manager.
5. Check existing linting/type-checking/testing.
6. Research current compatibility of PPTX parsing libraries.
7. Research the current official Notion API/OAuth requirements.
8. Research the selected AI provider's current multimodal/structured-output APIs.
9. Prefer official documentation for API contracts.
10. Avoid introducing unnecessary dependencies.

Do not blindly implement every conceptual example in this document.

Where this document describes a possible implementation rather than a hard requirement, validate it against the actual runtime and current APIs.

---

# 37. Agent Development Rules

### Rule 1 — Keep V1 small

If a feature is not required for:

```text
PPT → structured notes → preview → Notion
```

do not implement it unless necessary.

### Rule 2 — Prefer simple architecture

Start as one Next.js application.

Do not create microservices.

### Rule 3 — Preserve separation of concerns

Keep:

- PPT parsing
- AI
- canonical document model
- Notion
- UI

separate.

### Rule 4 — Use types

TypeScript types should define important boundaries.

### Rule 5 — Validate external APIs

Do not assume undocumented behavior.

### Rule 6 — Test with real content early

Use Vasu's real lecture PPT as soon as technically safe.

Synthetic test data alone is insufficient.

### Rule 7 — Do not optimize prematurely

First make output good.

Then optimize cost/performance.

### Rule 8 — Don't hide AI uncertainty

If processing fails or information is uncertain, surface that appropriately rather than fabricating content.

---

# 38. Definition of Done for V1

V1 is successful technically when a user can:

1. Open the application.
2. Upload a real `.pptx`.
3. See the presentation being processed.
4. Have slide text extracted.
5. Have useful images identified.
6. Have image text/OCR processed.
7. Have diagrams/images interpreted where appropriate.
8. Receive structured notes.
9. Preview those notes.
10. Connect Notion.
11. Export the notes to a Notion page.
12. Open the page in Notion.
13. Continue editing/studying manually.

The product is successful from a validation standpoint when Vasu can use it on real lectures and says, in effect:

> "This saves me enough work that I want to use it again."

---

# 39. First Development Task

Do not start by building authentication, billing, dashboards, or a database.

Start with:

```text
Create a minimal Next.js TypeScript application with:

1. A clean upload page.
2. PPTX-only file validation.
3. A server-side upload endpoint.
4. A processing state UI.
5. A mocked NoteDocument.
6. A preview renderer for NoteDocument.
7. Clean separation between UI, PPT processing, AI, document model,
   and Notion integration.
```

After that, replace the mock pipeline with real PPTX extraction.

---

# 40. First Real Technical Milestone

The first meaningful end-to-end milestone should be:

```text
Vasu's actual PPTX
       ↓
PPTX parser
       ↓
Normalized slide data
       ↓
AI processing
       ↓
Structured NoteDocument
       ↓
Web preview
```

Only after this output is good should Notion export become the next major focus.

The product's core value is the **quality of the generated notes**, not the OAuth integration.

---

# 41. Product Evolution Hypothesis

The initial hypothesis is:

> Students spend unnecessary time manually transcribing and organizing lecture material because existing PPT-to-note workflows are poor, especially when slides contain images, screenshots, diagrams, or embedded text.

The product hypothesis is:

> Automating extraction, OCR, visual interpretation, and structuring can remove most of that mechanical work while allowing students to retain control through review.

The validation hypothesis is:

> A student who currently performs this workflow manually will repeatedly use the automated workflow if it produces sufficiently faithful, well-structured notes.

Do not assume these hypotheses are true.

Validate them.

---

# 42. What We Are Actually Building

At the simplest level:

```text
                ┌──────────────┐
                │   Student    │
                └──────┬───────┘
                       │
                  uploads PPT
                       │
                       ▼
              ┌─────────────────┐
              │ Lecture-to-Notes│
              └────────┬────────┘
                       │
        ┌──────────────┼───────────────┐
        │              │               │
        ▼              ▼               ▼
     PPT text        Images         Layout
        │              │               │
        │           Vision/OCR         │
        │              │               │
        └──────────────┼───────────────┘
                       ▼
                AI organization
                       │
                       ▼
                 NoteDocument
                       │
                 ┌─────┴─────┐
                 ▼           ▼
              Preview      Notion
                 │
                 ▼
           Student review
```

The fundamental goal is simple:

> **Take the boring transcription work out of studying. Let the student spend that time actually studying.**

---

# 43. Immediate Next Steps

1. Create the Next.js project.
2. Establish the repository conventions.
3. Implement the upload UI.
4. Implement PPTX validation/upload.
5. Research and select a suitable PPTX parsing library.
6. Build the normalized presentation/slide model.
7. Test extraction against a real lecture PPT.
8. Add image extraction.
9. Add the AI provider abstraction.
10. Implement image analysis.
11. Implement structured slide processing.
12. Implement `NoteDocument`.
13. Implement preview.
14. Validate output with Vasu.
15. Implement Notion OAuth/API export.
16. Validate end-to-end workflow again.
17. Only then decide what the next product feature should be.

---

# 44. Final Guiding Principle

Do not build this because "AI agents can build apps now."

Build it because **a real student has a repetitive problem that sucks time out of their life**.

Use AI coding agents as leverage to discover how quickly a small team—or one developer—can turn a real problem into useful software.

The first objective is not a startup.

The first objective is:

> **Make Vasu's next lecture easier to turn into notes.**

If that works repeatedly, follow the evidence.
