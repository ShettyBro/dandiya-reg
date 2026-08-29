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

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Please upload a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Image must be 2MB or smaller.";
  }
  return null;
}
