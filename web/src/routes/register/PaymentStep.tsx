import { useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { putFileToPresignedUrl, validateImageFile } from "../../lib/upload.js";
import { formatPriceInPaise, useEventConfig } from "../../lib/hooks/useEventConfig.js";

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

export function PaymentStep({
  registrationId,
  onComplete
}: {
  registrationId: string;
  onComplete: () => void;
}) {
  const { config } = useEventConfig();
  const [acknowledged, setAcknowledged] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const validationError = validateImageFile(selected);
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
      if (submitError instanceof ApiError && submitError.code === "DUPLICATE_TRANSACTION_ID") {
        setError("This transaction ID has already been used for another registration.");
      } else if (submitError instanceof ApiError && submitError.code === "R2_NOT_CONFIGURED") {
        setError("Proof storage isn't ready yet on our end. Please try again shortly.");
      } else {
        setError("Could not submit payment proof. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Payment</h2>
      <p className="mt-1 text-sm text-white/60">
        Amount due: {config ? formatPriceInPaise(config.priceInPaise) : "—"}
      </p>

      {!acknowledged ? (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
            {config?.paymentInstructions ?? "Pay through the college ERP, then return here."}
          </div>
          {config && !config.erpPaymentUrl && (
            <p className="text-sm text-amber-300">
              The payment link isn't set up yet. Please contact the organizers before proceeding.
            </p>
          )}
          <Button
            type="button"
            disabled={!config?.erpPaymentUrl}
            onClick={() => {
              if (!config?.erpPaymentUrl) {
                return;
              }
              window.open(config.erpPaymentUrl, "_blank", "noopener,noreferrer");
              setAcknowledged(true);
            }}
          >
            Pay via ERP <ArrowSquareOut size={16} />
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
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
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-white/70 file:mr-4 file:rounded-pill file:border-0 file:bg-festival-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-midnight-950"
            />
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
