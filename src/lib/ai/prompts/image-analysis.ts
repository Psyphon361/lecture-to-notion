export const PROMPT_VERSION = "image-analysis-v1";

/**
 * One prompt for one image. Slide body text is not included.
 * A repair attempt appends the validator message and nothing else from the bad response.
 */
export function imageAnalysisPrompt(input?: {
  altText?: string;
  validationError?: string;
}): string {
  const lines = [
    "You read a single image from a lecture slide and describe only what is visible.",
    "Copy technical text, codes, numbers, equations, and identifiers exactly as seen. Do not correct spelling.",
    "Do not add a relationship that is not visible. An arrow, label, or grouping has to be in the image.",
    "Put unread or unsure spots in uncertainties. Leave them out of extractedText and relationships.",
    "description is interpretation. It is not a transcription.",
    "extractedText is only text you can see in the image.",
  ];
  const altText = input?.altText?.trim();
  if (altText) {
    lines.push(
      `The file's alt text is: ${altText}. It may be a filename. Do not treat it as text in the image unless you can see it.`,
    );
  }
  const validationError = input?.validationError?.trim();
  if (validationError) {
    lines.push(
      `The previous response failed validation: ${validationError.slice(0, 800)}. Return JSON that matches the schema.`,
    );
  }
  return lines.join("\n\n");
}
