import { useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
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

// What to enter in the ERP's free-text "any other info" field — kept specific per category so
// finance can actually match the payment back to the right registration during verification.
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

function PaymentInstructions({
  registrationType,
  priceInPaise
}: {
  registrationType: RegistrationType;
  priceInPaise: number | undefined;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
      <p className="mb-1 font-semibold text-white">Dandiya Celebration Kit</p>
      <p className="mb-3 text-xs text-white/55">
        The Dandiya Celebration Kit will be provided at the event venue after successful payment
        verification and confirmation.
      </p>
      <p className="mb-3 font-semibold text-white">When the ERP payment form asks for:</p>
      <dl className="flex flex-col gap-2 text-xs">
        <div>
          <dt className="font-semibold text-festival-gold">Name *</dt>
          <dd>Use the same name you entered during registration.</dd>
        </div>
        <div>
          <dt className="font-semibold text-festival-gold">Email *</dt>
          <dd>Use the same email you entered during registration.</dd>
        </div>
        <div>
          <dt className="font-semibold text-festival-gold">Mobile *</dt>
          <dd>Use the same phone number you entered during registration.</dd>
        </div>
        <div>
          <dt className="font-semibold text-festival-gold">{REFERENCE_INFO_LABEL[registrationType]} *</dt>
          <dd>{REFERENCE_INFO_HINT[registrationType]}</dd>
        </div>
        <div>
          <dt className="font-semibold text-festival-gold">Amount *</dt>
          <dd>{priceInPaise !== undefined ? formatPriceInPaise(priceInPaise) : "₹151"}</dd>
        </div>
      </dl>
    </div>
  );
}

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
  const [ackInstructions, setAckInstructions] = useState(false);
  const [ackNoRefund, setAckNoRefund] = useState(false);
  const [proceeded, setProceeded] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bothAcknowledged = ackInstructions && ackNoRefund;

  function handleFileChange(selected: File | null) {
    setError(null);
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
        setError("This transaction ID has already been used for another registration.");
      } else if (submitError instanceof ApiError && submitError.code === "R2_NOT_CONFIGURED") {
        setError("Proof storage isn't ready yet on our end. Please try again shortly.");
      } else if (submitError instanceof ApiError && submitError.code === "PHOTO_REQUIRED") {
        setError("Required photo uploads are missing. Please go back and complete them first.");
      } else if (submitError instanceof ApiError && submitError.code === "IMAGE_VALIDATION_FAILED") {
        setError("That screenshot couldn't be read. Please upload a clear JPG or PNG (not HEIC/WEBP) under 2MB.");
      } else if (submitError instanceof ApiError && submitError.code === "RATE_LIMITED") {
        setError("Too many attempts from this network right now. Please wait a couple of minutes and try again.");
      } else {
        setError("Could not submit payment proof. Please try again.");
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
      <p className="mt-0.5 text-xs text-white/45">
        Receive your Dandiya Celebration Kit at the event venue.
      </p>

      {!proceeded ? (
        <div className="mt-6 flex flex-col gap-4">
          <PaymentInstructions registrationType={registrationType} priceInPaise={config?.priceInPaise} />

          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs text-amber-200">
            No-refund policy: all payments made for this event are final and non-refundable under any
            circumstances.
          </div>

          <label className="flex items-start gap-3 text-xs text-white/70">
            <input
              type="checkbox"
              checked={ackInstructions}
              onChange={(e) => setAckInstructions(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-white/5 accent-festival-gold"
            />
            I have read and understood the above payment instructions.
          </label>
          <label className="flex items-start gap-3 text-xs text-white/70">
            <input
              type="checkbox"
              checked={ackNoRefund}
              onChange={(e) => setAckNoRefund(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-white/5 accent-festival-gold"
            />
            I agree to the no-refund policy.
          </label>

          {config && !config.erpPaymentUrl && (
            <p className="text-sm text-amber-300">
              The payment link isn't set up yet. Please contact the organizers before proceeding.
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!bothAcknowledged || !config?.erpPaymentUrl}
            onClick={() => {
              if (!config?.erpPaymentUrl) return;
              window.open(config.erpPaymentUrl, "_blank", "noopener,noreferrer");
              setProceeded(true);
            }}
          >
            Continue to Payment <ArrowSquareOut size={16} />
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <p className="text-xs text-white/50">
            Opening the payment page does not confirm payment — enter your transaction reference below once
            you've completed the payment.
          </p>

          <PaymentInstructions registrationType={registrationType} priceInPaise={config?.priceInPaise} />

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
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit payment proof"}
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}
