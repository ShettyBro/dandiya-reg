import { randomUUID } from "node:crypto";
import type { UploadPurpose } from "@prisma/client";

export function participantPhotoKey(registrationId: string, extension: string): string {
  return `participants/${registrationId}/photo/${randomUUID()}.${extension}`;
}

export function paymentProofKey(registrationId: string, extension: string): string {
  return `payments/${registrationId}/proof/${randomUUID()}.${extension}`;
}

export function aadhaarImageKey(registrationId: string, extension: string): string {
  return `participants/${registrationId}/aadhaar/${randomUUID()}.${extension}`;
}

export function collegeIdImageKey(registrationId: string, extension: string): string {
  return `participants/${registrationId}/college-id/${randomUUID()}.${extension}`;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png"
};

export function extensionForMime(mime: string): string | undefined {
  return MIME_EXTENSIONS[mime];
}

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(MIME_EXTENSIONS);

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_IDENTITY_IMAGE_SIZE_BYTES = 1 * 1024 * 1024;

export function maxSizeForPurpose(purpose: UploadPurpose): number {
  return purpose === "PAYMENT_PROOF" ? MAX_UPLOAD_SIZE_BYTES : MAX_IDENTITY_IMAGE_SIZE_BYTES;
}

export function objectKeyForPurpose(
  purpose: UploadPurpose,
  registrationId: string,
  extension: string
): string {
  switch (purpose) {
    case "PARTICIPANT_PHOTO":
      return participantPhotoKey(registrationId, extension);
    case "PAYMENT_PROOF":
      return paymentProofKey(registrationId, extension);
    case "AADHAAR_IMAGE":
      return aadhaarImageKey(registrationId, extension);
    case "COLLEGE_ID_IMAGE":
      return collegeIdImageKey(registrationId, extension);
  }
}
