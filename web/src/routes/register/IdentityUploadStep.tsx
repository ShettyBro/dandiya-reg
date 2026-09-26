import { useState } from "react";
import { IdentificationCard } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { IDENTITY_IMAGE_MAX_BYTES, putFileToPresignedUrl, validateImageFile, validateProofFile } from "../../lib/upload.js";
import type { RegistrationType } from "./registrationTypes.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

function UploadSlot({
  label,
  file,
  error,
  accept,
  onSelect
}: {
  label: string;
  file: File | null;
  error: string | null;
  accept: string;
  onSelect: (file: File | null) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/85">{label}</label>
      <input
        type="file"
        accept={accept}
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
  registrationType,
  onBack,
  onComplete
}: {
  registrationId: string;
  registrationType: RegistrationType;
  onBack: () => void;
  onComplete: () => void;
}) {
  const isAlumni = registrationType === "ACHARYA_ALUMNI";

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function selectFile(selected: File | null) {
    setFileError(null);
    if (!selected) return setFile(null);
    const error = isAlumni
      ? validateProofFile(selected, IDENTITY_IMAGE_MAX_BYTES)
      : validateImageFile(selected, IDENTITY_IMAGE_MAX_BYTES);
    if (error) return setFileError(error);
    setFile(selected);
  }

  async function uploadOne(selected: File, purpose: "COLLEGE_ID_IMAGE" | "ACHARYAN_PROOF", bindPath: string) {
    const presign = await apiRequest<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: { registrationId, purpose, contentType: selected.type }
    });
    await putFileToPresignedUrl(presign.uploadUrl, selected);
    await apiRequest(`/registrations/${registrationId}/${bindPath}`, {
      method: "PATCH",
      body: { objectKey: presign.objectKey }
    });
  }

  async function handleSubmit() {
    if (!file) {
      setFormError(isAlumni ? "Upload proof that you are an Acharyan." : "College ID card image is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (isAlumni) {
        await uploadOne(file, "ACHARYAN_PROOF", "acharyan-proof");
      } else {
        await uploadOne(file, "COLLEGE_ID_IMAGE", "college-id-image");
      }
      onComplete();
    } catch (error) {
      if (error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE) {
        setFormError(error.message);
      } else if (error instanceof ApiError && error.code === "IMAGE_VALIDATION_FAILED") {
        setFormError(
          isAlumni
            ? "The file could not be validated. Try a clear JPG/PNG/PDF under 1MB."
            : "The image could not be validated. Try a clear JPG/PNG under 1MB."
        );
      } else {
        setFormError("Upload failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel variant="solid" className="p-6 sm:p-8">
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="mb-3 block text-xs text-white/40 underline disabled:opacity-40"
      >
        &larr; Change photo
      </button>
      <div className="mb-3 flex items-center gap-2 text-festival-gold">
        <IdentificationCard size={22} />
        <h2 className="font-display text-xl font-semibold text-white">Identity verification</h2>
      </div>
      <p className="mt-1 text-sm text-white/60">
        {isAlumni
          ? "Upload any proof that you are an Acharyan (old ID card, degree certificate, admit card, etc). JPG, PNG, or PDF, max 1MB."
          : "We need to verify your identity. JPG/PNG, max 1MB."}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <UploadSlot
          label={isAlumni ? "Proof of being an Acharyan" : "College ID card image"}
          file={file}
          error={fileError}
          accept={isAlumni ? "image/jpeg,image/png,application/pdf" : "image/jpeg,image/png"}
          onSelect={selectFile}
        />

        <p className="text-xs text-white/40">
          You must still carry your physical ID to the event — this upload is for verification only and
          does not replace it.
        </p>

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Uploading..." : "Upload and continue"}
        </Button>
      </div>
    </GlassPanel>
  );
}
