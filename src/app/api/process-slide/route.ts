import { processSlideWithGemini, GeminiCallError, MissingGeminiKeyError } from "@/lib/ai/gemini";
import {
  processFailureSchema,
  processSlideRequestSchema,
  slideContextFromRequest,
} from "@/lib/ai/process-request";
import type { SlideContext } from "@/lib/ai/provider";
import { slideNotesSchema, type SlideNotes } from "@/lib/documents/schema";

export const runtime = "nodejs";

type ProcessFn = (input: SlideContext) => Promise<SlideNotes>;

export async function POST(request: Request): Promise<Response> {
  return handleProcessSlide(request, async (input) => {
    const result = await processSlideWithGemini(input);
    return result.notes;
  });
}

export async function handleProcessSlide(request: Request, processSlide: ProcessFn): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure(400, "The slide request could not be read.");
  }

  const parsed = processSlideRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(400, "The slide request could not be read.");
  }

  try {
    const notes = await processSlide(slideContextFromRequest(parsed.data));
    return Response.json(slideNotesSchema.parse(notes));
  } catch (error) {
    const mapped = processSlideErrorResponse(error);
    console.info(`slide-processing outcome=request-error status=${mapped.status}`);
    return failure(mapped.status, mapped.message);
  }
}

export function processSlideErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof MissingGeminiKeyError) {
    return {
      status: 500,
      message: "Slide structuring needs a Gemini API key on the server.",
    };
  }
  if (error instanceof GeminiCallError && error.status === 429) {
    return {
      status: 429,
      message: "Gemini is rate limiting slide structuring. Wait a moment and try again.",
    };
  }
  if (error instanceof GeminiCallError) {
    return {
      status: 502,
      message: "Gemini could not structure this slide. Try again in a moment.",
    };
  }
  return { status: 500, message: "Slide structuring failed. Try again." };
}

function failure(status: number, message: string): Response {
  return Response.json(processFailureSchema.parse({ ok: false, message }), { status });
}
