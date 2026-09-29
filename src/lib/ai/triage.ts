/**
 * Deterministic skip, before any model call.
 * Same hash on two or three slides is one analysis, not a skip.
 * Same hash on four or more slides is treated as a logo or background.
 *
 * "Very small" is an area under 12 square inches (914400 EMU = 1 inch).
 * On the sample deck the logos are about 0.3 and 6.8 square inches.
 * The content pictures on slides 5, 9, and 10 are about 25 square inches or larger.
 * Extreme aspect is 8:1 or more. The widest content picture on that deck is about 3.6:1.
 */

const EMU_PER_INCH = 914400;
const SMALL_AREA_EMU = 12 * EMU_PER_INCH * EMU_PER_INCH;
const EXTREME_ASPECT = 8;
export const REPEATED_SLIDE_COUNT = 4;

const DECORATIVE_ALT = /\b(decorative|decoration|logo|watermark|background)\b/i;

export const SKIP_REASONS = {
  alt: "The alt text says the image is decorative.",
  small: "The image is very small, so it was treated as decorative.",
  aspect: "The image is extremely wide or tall, so it was treated as a line or banner.",
  repeated: "The same image appears on many slides, so it was treated as a logo or background.",
} as const;

export interface TriageImage {
  imageId: string;
  contentHash: string;
  slideNumber: number;
  width?: number;
  height?: number;
  altText?: string;
}

export function triageImages(images: TriageImage[]): Map<string, string> {
  const slidesByHash = new Map<string, Set<number>>();
  for (const image of images) {
    const slides = slidesByHash.get(image.contentHash) ?? new Set<number>();
    slides.add(image.slideNumber);
    slidesByHash.set(image.contentHash, slides);
  }

  const skipped = new Map<string, string>();
  for (const image of images) {
    const reason = skipReason(
      image,
      slidesByHash.get(image.contentHash)?.size ?? 1,
    );
    if (reason) skipped.set(image.imageId, reason);
  }
  return skipped;
}

function skipReason(image: TriageImage, distinctSlides: number): string | undefined {
  const altText = image.altText?.trim();
  if (altText && DECORATIVE_ALT.test(altText)) return SKIP_REASONS.alt;
  if (isVerySmall(image.width, image.height)) return SKIP_REASONS.small;
  if (isExtremeAspect(image.width, image.height)) return SKIP_REASONS.aspect;
  if (distinctSlides >= REPEATED_SLIDE_COUNT) return SKIP_REASONS.repeated;
  return undefined;
}

function isVerySmall(width: number | undefined, height: number | undefined): boolean {
  if (width === undefined || height === undefined) return false;
  if (width <= 0 || height <= 0) return true;
  return width * height < SMALL_AREA_EMU;
}

function isExtremeAspect(width: number | undefined, height: number | undefined): boolean {
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return false;
  return Math.max(width, height) / Math.min(width, height) >= EXTREME_ASPECT;
}
