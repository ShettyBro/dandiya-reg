import { useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { IDENTITY_IMAGE_MAX_BYTES, putFileToPresignedUrl, validateImageFile } from "../../lib/upload.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

export function PhotoUploadStep({
  registrationId,
  onComplete,
  onSkip
}: {
  registrationId: string;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    const validationError = validateImageFile(selected, IDENTITY_IMAGE_MAX_BYTES);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleUpload() {
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const presign = await apiRequest<PresignResponse>("/uploads/presign", {
        method: "POST",
        body: { registrationId, purpose: "PARTICIPANT_PHOTO", contentType: file.type }
      });

      await putFileToPresignedUrl(presign.uploadUrl, file);

      await apiRequest(`/registrations/${registrationId}/photo`, {
        method: "PATCH",
        body: { objectKey: presign.objectKey }
      });

      onComplete();
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.code === "R2_NOT_CONFIGURED") {
        setError("Photo storage isn't ready yet on our end. You can continue and add it later.");
      } else if (uploadError instanceof ApiError && uploadError.code === "IMAGE_VALIDATION_FAILED") {
        setError("That image doesn't look like a valid passport-style photo. Try a square, well-lit photo.");
      } else {
        setError("Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <GlassPanel className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Passport-style photo</h2>
      <p className="mt-1 text-sm text-white/60">Square, well-lit, JPG/PNG, max 1MB. This appears on your pass.</p>

      <div className="mt-6 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/25 bg-white/5"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Selected preview" className="h-full w-full object-cover" />
          ) : (
            <Camera size={36} className="text-white/40" />
          )}
        </button>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-pill border border-festival-gold/40 bg-festival-gold/10 px-5 py-2 text-sm font-semibold text-festival-gold"
        >
          {file ? "Choose a different photo" : "Choose file"}
        </button>
        {file && <p className="text-xs text-white/50">{file.name}</p>}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full sm:flex-1"
          >
            {uploading ? "Uploading..." : "Upload and continue"}
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip} className="w-full sm:w-auto">
            Add later
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
