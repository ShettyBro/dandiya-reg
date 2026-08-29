import sharp, { type Metadata } from "sharp";
import type { S3Client } from "@aws-sdk/client-s3";
import { getObjectBytes, headObject, ObjectNotFoundError } from "./presign.js";
import { ALLOWED_IMAGE_MIME_TYPES } from "./object-keys.js";

export class ImageValidationError extends Error {}

const MAX_ASPECT_RATIO_DEVIATION = 0.15;

export interface ValidateUploadedImageOptions {
  requireSquareAspectRatio?: boolean;
}

export async function validateUploadedImage(
  client: S3Client,
  bucket: string,
  key: string,
  maxSizeBytes: number,
  options: ValidateUploadedImageOptions = {}
): Promise<void> {
  let head;
  try {
    head = await headObject(client, bucket, key);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new ImageValidationError("Uploaded object was not found");
    }
    throw error;
  }

  if (head.contentLength <= 0 || head.contentLength > maxSizeBytes) {
    throw new ImageValidationError(
      `Object size ${head.contentLength} bytes exceeds the ${maxSizeBytes} byte limit`
    );
  }

  if (!head.contentType || !ALLOWED_IMAGE_MIME_TYPES.includes(head.contentType)) {
    throw new ImageValidationError(`Unsupported content type: ${head.contentType ?? "unknown"}`);
  }

  const bytes = await getObjectBytes(client, bucket, key);

  let metadata: Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new ImageValidationError("Uploaded file is not a valid, decodable image");
  }

  if (!metadata.width || !metadata.height) {
    throw new ImageValidationError("Could not read image dimensions");
  }

  if (options.requireSquareAspectRatio) {
    const ratio = metadata.width / metadata.height;
    if (Math.abs(ratio - 1) > MAX_ASPECT_RATIO_DEVIATION) {
      throw new ImageValidationError(
        `Image aspect ratio ${ratio.toFixed(2)} is too far from the required 1:1 target`
      );
    }
  }
}
