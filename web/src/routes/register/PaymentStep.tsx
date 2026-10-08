import { useState } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { PAYMENT_PROOF_MAX_BYTES, putFileToPresignedUrl, validateImageFile } from "../../lib/upload.js";
import { formatPriceInPaise, useEventConfig } from "../../lib/hooks/useEventConfig.js";
import type { RegistrationType } from "./registrationTypes.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

const REFERENCE_INFO_LABEL: Record<RegistrationType, string> = {
  ACHARYA_STUDENT: "AUID",
  ACHARYA_FACULTY: "EMP / Employee ID",
  NON_ACHARYAN_STUDENT: "College name",
  ACHARYA_ALUMNI: "College name with branch, etc."
};

const REFERENCE_INFO_HINT: Record<RegistrationType, string> = {
  ACHARYA_STUDENT: "Enter your AUID.",
  ACHARYA_FACULTY: "Enter your EMP/Employee ID.",
  NON_ACHARYAN_STUDENT: "Enter your college name.",
  ACHARYA_ALUMNI: "Enter your college name with branch name, etc. — anything that helps us match your payment."
};

export function PaymentStep({
  registrationId,
  registrationType,
  onComplete
}: {
  registrationId: string;
  registrationType: RegistrationType;
  onComplete: () => void;
}) {
  const { config } = useEventConfig();
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoRequired, setPhotoRequired] = useState(false);

  function handleFileChange(selected: File | null) {
    setError(null);
    setPhotoRequired(false);
    if (!selected) {
      setFile(null);
      return;
    }
    const validationError = validateImageFile(selected, PAYMENT_PROOF_MAX_BYTES);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    if (!file || !transactionId.trim()) {
      setError("Enter your transaction ID and attach a screenshot.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setPhotoRequired(false);
    try {
      const presign = await apiRequest<PresignResponse>("/uploads/presign", {
        method: "POST",
        body: { registrationId, purpose: "PAYMENT_PROOF", contentType: file.type }
      });

      await putFileToPresignedUrl(presign.uploadUrl, file);

      await apiRequest(`/registrations/${registrationId}/payment`, {
        method: "POST",
        body: { transactionId: transactionId.trim(), proofObjectKey: presign.objectKey }
      });

      onComplete();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === SERVER_UNREACHABLE_CODE) {
        setError(submitError.message);
      } else if (submitError instanceof ApiError && submitError.code === "DUPLICATE_TRANSACTION_ID") {
        setError(
          "This transaction/reference ID has already been used for a different registration. Each person needs to make their own separate payment — if you already registered with this reference, use \"Check status\" instead of submitting again."
        );
      } else if (submitError instanceof ApiError && submitError.code === "R2_NOT_CONFIGURED") {
        setError("Proof storage isn't ready yet on our end. Please try again shortly.");
      } else if (submitError instanceof ApiError && submitError.code === "PHOTO_REQUIRED") {
        setPhotoRequired(true);
      } else if (submitError instanceof ApiError && submitError.code === "IMAGE_VALIDATION_FAILED") {
        setError("That screenshot couldn't be read. Please upload a clear JPG or PNG (not HEIC/WEBP) under 2MB.");
      } else if (submitError instanceof ApiError && submitError.code === "RATE_LIMITED") {
        setError("Too many attempts from this network right now. Please wait a couple of minutes and try again.");
      } else {
        setError("Could not submit payment proof — this is usually a weak connection. Please check your signal and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel variant="solid" className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Dandiya Celebration Kit</h2>
      <p className="mt-1 text-sm text-white/60">
        Dandiya Celebration Kit — {config ? formatPriceInPaise(config.priceInPaise) : "₹151"}
      </p>
      <p className="mt-0.5 text-xs text-white/45">Receive your Dandiya Celebration Kit at the event venue.</p>

      <div className="mt-6 flex flex-col gap-5">
        <p className="text-xs text-white/50">
          You already completed payment in the ERP. Enter your transaction reference below and attach a
          screenshot of the confirmation to finish.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          <p className="mb-3 font-semibold text-white">Reminder — what you used in the ERP form:</p>
          <dl className="flex flex-col gap-2 text-xs">
            <div>
              <dt className="font-semibold text-festival-gold">{REFERENCE_INFO_LABEL[registrationType]}</dt>
              <dd>{REFERENCE_INFO_HINT[registrationType]}</dd>
            </div>
            <div>
              <dt className="font-semibold text-festival-gold">Amount</dt>
              <dd>{config ? formatPriceInPaise(config.priceInPaise) : "₹151"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-festival-gold/40 bg-festival-gold/10 p-4 text-xs font-medium text-festival-gold">
          After paying, note down your transaction ID and take a screenshot of the payment confirmation — then
          upload it below.
        </div>

        <FormField
          label="Transaction / reference ID"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          required
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-white/85">Payment screenshot</label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/70 file:mr-4 file:rounded-pill file:border-0 file:bg-festival-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-midnight-950"
          />
          <p className="mt-1 text-xs text-white/40">JPG/PNG, max 2MB.</p>
          {file && <p className="mt-1 text-xs text-white/50">{file.name}</p>}
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        {photoRequired && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/8 p-4 text-sm text-white/80">
            <p className="text-red-300">A required upload from an earlier step is missing.</p>
          </div>
        )}

        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit payment proof"}
        </Button>
      </div>
    </GlassPanel>
  );
}
