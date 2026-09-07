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

const SQUARE_CROP_OUTPUT_SIZE = 1024;

export async function cropToSquare(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = objectUrl;
    });

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;
    const outputSize = Math.min(SQUARE_CROP_OUTPUT_SIZE, side);

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.drawImage(image, sx, sy, side, side, 0, 0, outputSize, outputSize);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      return file;
    }

    const croppedName = file.name.replace(/\.\w+$/, "") + "-cropped.jpg";
    return new File([blob], croppedName, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
