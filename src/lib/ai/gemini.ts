import { ApiError, GoogleGenAI } from "@google/genai";

import { PROMPT_VERSION, imageAnalysisPrompt } from "@/lib/ai/prompts/image-analysis";
import type { AIProvider, ImageInput, SlideContext } from "@/lib/ai/provider";
import {
  imageAnalysisModelSchema,
  imageAnalysisRequestJsonSchema,
  imageAnalysisSchema,
  type ImageAnalysis,
} from "@/lib/ai/schema";
import type { NoteDocument, SlideNotes } from "@/lib/documents/schema";

/**
 * Free-tier Flash used when GEMINI_MODEL is unset.
 * The models page (updated 2026-09-24) tells new projects to use 3.5 Flash-Lite or 3.8 Flash.
 * On Sep 29, 2026, gemini-3.8-flash returned 503 (high demand) for the synthetic image,
 * and gemini-3.5-flash-lite completed structured output on the free tier.
 * Pricing lists that id as free of charge, and the call accepted an image.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const RATE_LIMIT_DELAYS_MS = [1000, 2000];

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set.");
    this.name = "MissingGeminiKeyError";
  }
}

export class GeminiCallError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail = "") {
    super(`Gemini request failed with status ${status}.`);
    this.name = "GeminiCallError";
    this.status = status;
    this.detail = detail;
  }
}

export class ImageAnalysisInvalidError extends Error {
  constructor() {
    super("Image analysis did not match the expected shape.");
    this.name = "ImageAnalysisInvalidError";
  }
}

/** Slide notes are built locally. This call must not reach Gemini. */
export class SlideNotesAreLocalError extends Error {
  constructor() {
    super("Slide notes are built locally. Gemini does not structure slides.");
    this.name = "SlideNotesAreLocalError";
  }
}

export interface ImageAnalysisSuccess {
  analysis: ImageAnalysis;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface GeminiContentRequest {
  model: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  mimeType?: string;
  bytes?: Uint8Array;
}

export interface GeminiContentResponse {
  text: string | undefined;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type GeminiGenerate = (request: GeminiContentRequest) => Promise<GeminiContentResponse>;

export interface AnalyzeDeps {
  generate: GeminiGenerate;
  model?: string;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  now?: () => number;
}

export function geminiModelId(configured = process.env.GEMINI_MODEL): string {
  const model = configured?.trim();
  return model ? model : DEFAULT_GEMINI_MODEL;
}

/**
 * One image, one repair retry, then ImageAnalysisInvalidError.
 * 429 is retried with backoff. 5xx is not retried.
 * The log line is model, prompt version, tokens, latency, and outcome.
 */
export async function analyzeImageDetailed(
  input: ImageInput,
  deps: AnalyzeDeps,
): Promise<ImageAnalysisSuccess> {
  const model = deps.model ?? geminiModelId();
  const sleep = deps.sleep ?? delay;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? logImageAnalysisLine;
  const responseJsonSchema = imageAnalysisRequestJsonSchema();
  let validationError: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = now();
    let response: GeminiContentResponse;
    try {
      response = await withRateLimitRetries(
        () =>
          deps.generate({
            model,
            prompt: imageAnalysisPrompt({
              altText: input.altText,
              validationError,
            }),
            mimeType: input.mimeType,
            bytes: input.bytes,
            responseJsonSchema,
          }),
        sleep,
      );
    } catch (error) {
      log(logLine({ model, inputTokens: null, outputTokens: null, latencyMs: now() - started, outcome: "error" }));
      throw error;
    }

    const latencyMs = now() - started;
    const parsed = readModelAnalysis(response.text, input.imageId);
    log(
      logLine({
        model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs,
        outcome: parsed.ok ? "ok" : "invalid",
      }),
    );
    if (parsed.ok) {
      return {
        analysis: parsed.analysis,
        model,
        promptVersion: PROMPT_VERSION,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs,
      };
    }
    validationError = parsed.message;
  }

  throw new ImageAnalysisInvalidError();
}

export async function analyzeImageWithGemini(input: ImageInput): Promise<ImageAnalysisSuccess> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new MissingGeminiKeyError();
  const ai = new GoogleGenAI({ apiKey });
  return analyzeImageDetailed(input, {
    model: geminiModelId(),
    generate: (request) => generateWithClient(ai, request),
  });
}

/** Rejects before any model call. Slide notes come from `fallbackSlideNotes`. */
export async function processSlideWithGemini(input: SlideContext): Promise<never> {
  void input;
  throw new SlideNotesAreLocalError();
}

/** The study document is assembled locally. This call must not reach Gemini. */
export class NoteOrganizationIsLocalError extends Error {
  constructor() {
    super("Notes are organized locally. Gemini does not organize the document.");
    this.name = "NoteOrganizationIsLocalError";
  }
}

/** Rejects before any model call. The document comes from `organizeLocally`. */
export async function organizeNotesWithGemini(notes: SlideNotes[]): Promise<never> {
  void notes;
  throw new NoteOrganizationIsLocalError();
}

export function createGeminiProvider(): AIProvider {
  return {
    async analyzeImage(input: ImageInput): Promise<ImageAnalysis> {
      const result = await analyzeImageWithGemini(input);
      return result.analysis;
    },
    async processSlide(input: SlideContext): Promise<SlideNotes> {
      return processSlideWithGemini(input);
    },
    async organizeNotes(input: SlideNotes[]): Promise<NoteDocument> {
      return organizeNotesWithGemini(input);
    },
  };
}

export function analyzeErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof MissingGeminiKeyError) {
    return {
      status: 500,
      message: "Image analysis needs a Gemini API key on the server.",
    };
  }
  if (error instanceof GeminiCallError && error.status === 429) {
    return {
      status: 429,
      message: "Gemini is rate limiting image analysis. Wait a moment and try again.",
    };
  }
  if (error instanceof GeminiCallError) {
    return {
      status: 502,
      message: "Gemini could not analyze the images. Try again in a moment.",
    };
  }
  return { status: 500, message: "Image analysis failed. Try again." };
}

function contentParts(
  request: GeminiContentRequest,
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: request.prompt },
  ];
  if (request.bytes !== undefined && request.mimeType) {
    parts.push({
      inlineData: {
        mimeType: request.mimeType,
        data: Buffer.from(request.bytes).toString("base64"),
      },
    });
  }
  return parts;
}

async function generateWithClient(
  ai: GoogleGenAI,
  request: GeminiContentRequest,
): Promise<GeminiContentResponse> {
  try {
    const response = await ai.models.generateContent({
      model: request.model,
      contents: [
        {
          role: "user",
          parts: contentParts(request),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: request.responseJsonSchema,
      },
    });
    return {
      text: response.text,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    };
  } catch (error) {
    throw new GeminiCallError(statusOf(error), sanitizedErrorText(error));
  }
}

function readModelAnalysis(
  text: string | undefined,
  imageId: string,
): { ok: true; analysis: ImageAnalysis } | { ok: false; message: string } {
  if (!text?.trim()) return { ok: false, message: "The model returned no JSON." };
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, message: "The model returned text that is not JSON." };
  }
  const fields = imageAnalysisModelSchema.safeParse(payload);
  if (!fields.success) return { ok: false, message: fields.error.message };
  const analysis = imageAnalysisSchema.safeParse({ ...fields.data, imageId });
  if (!analysis.success) return { ok: false, message: analysis.error.message };
  return { ok: true, analysis: analysis.data };
}

async function withRateLimitRetries(
  run: () => Promise<GeminiContentResponse>,
  sleep: (ms: number) => Promise<void>,
): Promise<GeminiContentResponse> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      const delayMs = RATE_LIMIT_DELAYS_MS[attempt];
      if (!(error instanceof GeminiCallError) || error.status !== 429 || delayMs === undefined) {
        throw error;
      }
      attempt += 1;
      await sleep(delayMs);
    }
  }
}

function statusOf(error: unknown): number {
  if (error instanceof ApiError) return error.status;
  if (error instanceof GeminiCallError) return error.status;
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return 0;
}

function sanitizedErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const key = process.env.GEMINI_API_KEY?.trim();
  const stripped = key ? message.split(key).join("[redacted]") : message;
  return stripped.replace(/AIza[0-9A-Za-z_-]{8,}/g, "[redacted]").slice(0, 240);
}

function logLine(input: {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  outcome: "ok" | "invalid" | "error";
}): string {
  return [
    "image-analysis",
    `model=${input.model}`,
    `prompt=${PROMPT_VERSION}`,
    `inputTokens=${input.inputTokens ?? "unknown"}`,
    `outputTokens=${input.outputTokens ?? "unknown"}`,
    `latencyMs=${input.latencyMs}`,
    `outcome=${input.outcome}`,
  ].join(" ");
}

function logImageAnalysisLine(line: string): void {
  console.info(line);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
