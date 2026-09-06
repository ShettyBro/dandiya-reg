export async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
}

export const IDENTITY_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
export const PAYMENT_PROOF_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

export function validateImageFile(file: File, maxSizeBytes: number = IDENTITY_IMAGE_MAX_BYTES): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Please upload a JPG or PNG image.";
  }
  if (file.size > maxSizeBytes) {
    return `Image must be ${Math.round(maxSizeBytes / (1024 * 1024))}MB or smaller.`;
  }
  return null;
}
