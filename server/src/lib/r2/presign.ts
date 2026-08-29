import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function presignPutUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  ttlSeconds: number
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

export async function presignGetUrl(
  client: S3Client,
  bucket: string,
  key: string,
  ttlSeconds: number
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

export interface ObjectHead {
  contentLength: number;
  contentType: string | undefined;
}

export class ObjectNotFoundError extends Error {}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const statusCode =
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;
  return name === "NotFound" || name === "NoSuchKey" || statusCode === 404;
}

export async function headObject(client: S3Client, bucket: string, key: string): Promise<ObjectHead> {
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new ObjectNotFoundError(`Object not found: ${key}`);
    }
    throw error;
  }
}

export async function getObjectBytes(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = result.Body;
  if (!body) {
    throw new Error("Object body missing");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
