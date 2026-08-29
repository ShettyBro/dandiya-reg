import { randomUUID } from "node:crypto";

export function participantPhotoKey(registrationId: string, extension: string): string {
  return `participants/${registrationId}/photo/${randomUUID()}.${extension}`;
}

export function paymentProofKey(registrationId: string, extension: string): string {
  return `payments/${registrationId}/proof/${randomUUID()}.${extension}`;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function extensionForMime(mime: string): string | undefined {
  return MIME_EXTENSIONS[mime];
}

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(MIME_EXTENSIONS);

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
