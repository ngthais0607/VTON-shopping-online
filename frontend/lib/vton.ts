import { ApiError } from "@/lib/api";
import type { VtonStatus } from "@/lib/types";

export const VTON_POLL_INTERVAL_MS = 2000;
export const VTON_POLL_TIMEOUT_MS = 6 * 60 * 1000;
export const VTON_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const MESSAGES: Record<string, string> = {
  consent_required: "Please consent to photo processing to continue.",
  invalid_person_image: "Invalid photo. Please use a PNG, JPEG or WebP image.",
  image_too_large: "Photo must not exceed 5MB.",
  person_image_too_small: "Photo is too small - at least 256 pixels on each side.",
  person_image_not_portrait: "Use a portrait photo (taller than wide) showing your upper body or full body.",
  vton_unsupported_product: "This product does not support virtual try-on yet.",
  vton_task_in_progress: "You already have a try-on in progress. Please wait for it to finish.",
  vton_quota_exceeded: "You have used all of today's try-ons. Please come back tomorrow.",
  vton_disabled: "Virtual try-on is temporarily unavailable.",
  no_person_detected: "We could not detect a person in the photo. Try a clear, front-facing photo with a plain background.",
  engine_timeout: "Processing took too long. Please try again.",
  engine_unavailable: "The try-on service is busy or unavailable. Please try again later.",
  engine_error: "The try-on service ran into an error. Please try again later.",
  engine_rejected: "The service could not accept this photo. Try a different one.",
  garment_unavailable: "The product image is no longer available.",
  person_image_missing: "Your photo has been removed. Please upload it again.",
  invalid_input: "We could not process the input image.",
  internal_error: "Something went wrong. Please try again.",
};

export function vtonErrorMessage(codeOrError: unknown): string {
  const code =
    typeof codeOrError === "string"
      ? codeOrError
      : codeOrError instanceof ApiError
        ? codeOrError.code
        : undefined;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (codeOrError instanceof Error && codeOrError.message) return codeOrError.message;
  return "Unable to run the try-on right now. Please try again.";
}

export const isVtonTerminal = (status: VtonStatus) =>
  status === "succeeded" || status === "failed";

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
