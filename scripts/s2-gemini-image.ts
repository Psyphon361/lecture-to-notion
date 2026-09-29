/**
 * Manual live check. Not part of `npm test`.
 * Sends fixtures/s2-planted-token.png only. Does not send a lecture deck.
 *
 *   npx vite-node --config vitest.config.mts scripts/s2-gemini-image.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_GEMINI_MODEL, analyzeImageWithGemini } from "@/lib/ai/gemini";
import { PROMPT_VERSION } from "@/lib/ai/prompts/image-analysis";
import { imageAnalysisSchema } from "@/lib/ai/schema";

loadEnvLocal();

const plantedToken = "BBALLB-203";
const plantedSpelling = "recieve";
const imagePath = path.join(process.cwd(), "fixtures/s2-planted-token.png");
const notePath = path.join(process.cwd(), "docs/spikes/S2-gemini.md");
const bytes = new Uint8Array(readFileSync(imagePath));

const started = Date.now();
let note: string;
let exitCode = 0;
try {
  const result = await analyzeImageWithGemini({
    imageId: "s2-planted",
    mimeType: "image/png",
    bytes,
  });
  const analysis = imageAnalysisSchema.parse(result.analysis);
  const extracted = analysis.extractedText ?? "";
  const tokenUnchanged = extracted.includes(plantedToken);
  const spellingUnchanged = extracted.includes(plantedSpelling);
  if (!tokenUnchanged || !spellingUnchanged) exitCode = 1;
  note = renderNote({
    model: result.model,
    promptVersion: result.promptVersion,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
    tokenUnchanged,
    spellingUnchanged,
    extractedText: extracted,
    kind: analysis.kind ?? "",
    useful: analysis.containsUsefulInformation,
  });
} catch (error) {
  exitCode = 1;
  const status =
    typeof error === "object" && error !== null && "status" in error ? String(error.status) : "";
  const detail =
    typeof error === "object" && error !== null && "detail" in error && typeof error.detail === "string"
      ? error.detail
      : "";
  note = renderFailure(status, Date.now() - started, detail);
}

writeFileSync(notePath, note, "utf8");
console.info(`wrote ${notePath}`);
process.exitCode = exitCode;

function renderNote(input: {
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  tokenUnchanged: boolean;
  spellingUnchanged: boolean;
  extractedText: string;
  kind: string;
  useful: boolean;
}): string {
  return `# Spike S2 — Gemini image analysis

**Date:** Sep 29, 2026
**Image:** \`fixtures/s2-planted-token.png\` only. The private lecture deck was not sent.
**Prompt:** \`${input.promptVersion}\`

| Check | Result |
|---|---|
| Model id | \`${input.model}\` |
| Schema parsed | yes |
| Planted token \`${plantedToken}\` unchanged in extractedText | ${input.tokenUnchanged ? "yes" : "no"} |
| Planted spelling \`${plantedSpelling}\` unchanged in extractedText | ${input.spellingUnchanged ? "yes" : "no"} |
| Input tokens | ${input.inputTokens ?? "unknown"} |
| Output tokens | ${input.outputTokens ?? "unknown"} |
| Latency | ${input.latencyMs} ms |
| containsUsefulInformation | ${input.useful} |
| kind | ${input.kind || "unset"} |

Extracted text from the synthetic image:

\`\`\`
${input.extractedText}
\`\`\`

Default model in code is \`${DEFAULT_GEMINI_MODEL}\` unless \`GEMINI_MODEL\` is set. The models page (updated 2026-09-24) recommends 3.5 Flash-Lite or 3.8 Flash for new projects. On Sep 29, 2026, \`gemini-3.8-flash\` returned 503 high demand for this image, and \`gemini-3.5-flash-lite\` completed the call on the free tier. Free-tier requests may be used to improve Google products.

This script is manual. \`npm test\` does not call Google.
`;
}

function renderFailure(status: string, latencyMs: number, detail: string): string {
  const safeDetail = detail.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]");
  return `# Spike S2 — Gemini image analysis

**Date:** Sep 29, 2026
**Image:** \`fixtures/s2-planted-token.png\` only. The private lecture deck was not sent.
**Prompt:** \`${PROMPT_VERSION}\`

The live call failed before a schema-valid analysis was returned.
Status: ${status || "unknown"}. Latency until failure: ${latencyMs} ms.
Detail: ${safeDetail || "none"}.
The API key is not recorded here.
`;
}

function loadEnvLocal(): void {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
