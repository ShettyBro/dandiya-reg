import { useState } from "react";
import { ArrowSquareOut, QrCode, X } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { PAYMENT_PROOF_MAX_BYTES, putFileToPresignedUrl, validateImageFile } from "../../lib/upload.js";
import { formatPriceInPaise, useEventConfig } from "../../lib/hooks/useEventConfig.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

function QrModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img src="/qr-code.png" alt="Payment QR code" className="mx-auto h-56 w-56" />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex items-center gap-1 rounded-pill bg-midnight-950 px-4 py-2 text-sm font-medium text-white"
        >
          <X size={16} /> Close
        </button>
      </div>
    </div>
  );
}

export function PaymentStep({
  registrationId,
  onComplete
}: {
  registrationId: string;
  onComplete: () => void;
}) {
  const { config } = useEventConfig();
  const [ackInstructions, setAckInstructions] = useState(false);
  const [ackNoRefund, setAckNoRefund] = useState(false);
  const [proceeded, setProceeded] = useState(false);
  const [showQr, setShowQr] = useState(false);
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
      } else {
        setError("Could not submit payment proof. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel variant="solid" className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Payment</h2>
      <p className="mt-1 text-sm text-white/60">
        Amount due: {config ? formatPriceInPaise(config.priceInPaise) : "₹151"}
      </p>

      {!proceeded ? (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
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
                <dt className="font-semibold text-festival-gold">AUID / Any other info *</dt>
                <dd>Enter your college name.</dd>
              </div>
              <div>
                <dt className="font-semibold text-festival-gold">Amount *</dt>
                <dd>{config ? formatPriceInPaise(config.priceInPaise) : "₹151"}</dd>
              </div>
            </dl>
          </div>

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
            I understand the above payment instructions.
          </label>
          <label className="flex items-start gap-3 text-xs text-white/70">
            <input
              type="checkbox"
              checked={ackNoRefund}
              onChange={(e) => setAckNoRefund(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-white/5 accent-festival-gold"
            />
            I have read and understood the above instructions and agree to the no-refund policy.
          </label>

          {config && !config.erpPaymentUrl && (
            <p className="text-sm text-amber-300">
              The payment link isn't set up yet. Please contact the organizers before proceeding.
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="secondary" className="w-full sm:flex-1" disabled={!bothAcknowledged} onClick={() => setShowQr(true)}>
              <QrCode size={16} /> View QR
            </Button>
            <Button
              type="button"
              className="w-full sm:flex-1"
              disabled={!bothAcknowledged || !config?.erpPaymentUrl}
              onClick={() => {
                if (!config?.erpPaymentUrl) return;
                window.open(config.erpPaymentUrl, "_blank", "noopener,noreferrer");
                setProceeded(true);
              }}
            >
              Open Payment Gateway <ArrowSquareOut size={16} />
            </Button>
          </div>
          {showQr && bothAcknowledged && (
            <QrModal
              onClose={() => {
                setShowQr(false);
                setProceeded(true);
              }}
            />
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <p className="text-xs text-white/50">
            Opening the payment page/QR does not confirm payment — enter your transaction reference below once
            you've completed the payment.
          </p>
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
