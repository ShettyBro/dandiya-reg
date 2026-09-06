import { useState } from "react";
import { IdentificationCard } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { IDENTITY_IMAGE_MAX_BYTES, putFileToPresignedUrl, validateImageFile } from "../../lib/upload.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

function UploadSlot({
  label,
  file,
  error,
  onSelect
}: {
  label: string;
  file: File | null;
  error: string | null;
  onSelect: (file: File | null) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/85">{label}</label>
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-white/70 file:mr-4 file:rounded-pill file:border-0 file:bg-festival-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-midnight-950"
      />
      {file && <p className="mt-1 text-xs text-white/50">{file.name}</p>}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function IdentityUploadStep({
  registrationId,
  onComplete
}: {
  registrationId: string;
  onComplete: () => void;
}) {
  const [aadhaarImage, setAadhaarImage] = useState<File | null>(null);
  const [collegeIdImage, setCollegeIdImage] = useState<File | null>(null);
  const [aadhaarError, setAadhaarError] = useState<string | null>(null);
  const [collegeIdError, setCollegeIdError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectAadhaar(file: File | null) {
    setAadhaarError(null);
    if (!file) return setAadhaarImage(null);
    const error = validateImageFile(file, IDENTITY_IMAGE_MAX_BYTES);
    if (error) return setAadhaarError(error);
    setAadhaarImage(file);
  }

  function selectCollegeId(file: File | null) {
    setCollegeIdError(null);
    if (!file) return setCollegeIdImage(null);
    const error = validateImageFile(file, IDENTITY_IMAGE_MAX_BYTES);
    if (error) return setCollegeIdError(error);
    setCollegeIdImage(file);
  }

  async function uploadOne(file: File, purpose: "AADHAAR_IMAGE" | "COLLEGE_ID_IMAGE", bindPath: string) {
    const presign = await apiRequest<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: { registrationId, purpose, contentType: file.type }
    });
    await putFileToPresignedUrl(presign.uploadUrl, file);
    await apiRequest(`/registrations/${registrationId}/${bindPath}`, {
      method: "PATCH",
      body: { objectKey: presign.objectKey }
    });
  }

  async function handleSubmit() {
    if (!aadhaarImage || !collegeIdImage) {
      setFormError("Both Aadhaar and College ID images are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await uploadOne(aadhaarImage, "AADHAAR_IMAGE", "aadhaar-image");
      await uploadOne(collegeIdImage, "COLLEGE_ID_IMAGE", "college-id-image");
      onComplete();
    } catch (error) {
      if (error instanceof ApiError && error.code === "IMAGE_VALIDATION_FAILED") {
        setFormError("One of the images could not be validated. Try a clear JPG/PNG under 1MB.");
      } else {
        setFormError("Upload failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel className="p-6 sm:p-8">
      <div className="mb-3 flex items-center gap-2 text-festival-gold">
        <IdentificationCard size={22} />
        <h2 className="font-display text-xl font-semibold text-white">Identity verification</h2>
      </div>
      <p className="mt-1 text-sm text-white/60">
        Since you're a Non-Acharyan participant, we need to verify your identity. JPG/PNG, max 1MB each.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <UploadSlot label="Aadhaar card image" file={aadhaarImage} error={aadhaarError} onSelect={selectAadhaar} />
        <UploadSlot label="College ID card image" file={collegeIdImage} error={collegeIdError} onSelect={selectCollegeId} />

        <p className="text-xs text-white/40">
          You must still carry your physical College ID Card to the event — this upload is for verification only
          and does not replace it.
        </p>

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Uploading..." : "Upload and continue"}
        </Button>
      </div>
    </GlassPanel>
  );
}
