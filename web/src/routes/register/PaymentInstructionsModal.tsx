import { useState } from "react";
import { motion } from "motion/react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Modal } from "../../components/ui/Modal.js";
import { Button } from "../../components/ui/Button.js";
import { formatPriceInPaise } from "../../lib/hooks/useEventConfig.js";
import type { RegistrationType } from "./registrationTypes.js";

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

export function PaymentInstructionsModal({
  open,
  onClose,
  registrationType,
  priceInPaise,
  erpPaymentUrl,
  onPaid
}: {
  open: boolean;
  onClose: () => void;
  registrationType: RegistrationType;
  priceInPaise: number | undefined;
  erpPaymentUrl: string | undefined;
  onPaid: () => void;
}) {
  const [ackInstructions, setAckInstructions] = useState(false);
  const [ackNoRefund, setAckNoRefund] = useState(false);
  const bothAcknowledged = ackInstructions && ackNoRefund;

  function handlePay() {
    if (!erpPaymentUrl) return;
    // The ERP itself never calls back to this site — there's nothing to "wait for". Mobile
    // browsers and in-app browsers (WhatsApp/Instagram) frequently block window.open silently,
    // so fall back to a same-tab navigation rather than leaving the person stuck.
    //
    // Deliberately NOT passing "noopener"/"noreferrer" as window.open flags: browsers return
    // null from window.open whenever those flags sever the opener relationship, even when the
    // tab opened successfully — so the block-detection below would always read "blocked" and
    // fire the same-tab fallback on top of the tab that already opened. Instead, get the real
    // window reference and sever the opener relationship manually, which achieves the same
    // security property (the ERP tab can't reach back into this tab via window.opener).
    const openedWindow = window.open(erpPaymentUrl, "_blank");
    if (openedWindow) {
      openedWindow.opener = null;
    } else {
      window.location.href = erpPaymentUrl;
    }
    onPaid();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-lg font-semibold text-white">Dandiya Celebration Kit payment</h2>
      <p className="mt-1 text-sm text-white/60">
        Dandiya Celebration Kit — {priceInPaise !== undefined ? formatPriceInPaise(priceInPaise) : "₹151"}
      </p>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
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

      <div className="mt-3 rounded-xl border border-festival-gold/40 bg-festival-gold/10 p-4 text-xs font-medium text-festival-gold">
        After paying, note down your transaction ID and take a screenshot of the payment confirmation — then
        come back to this website and upload your payment proof.
      </div>

      <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs text-amber-200">
        No-refund policy: all payments made for this event are final and non-refundable under any
        circumstances.
      </div>

      <div className="mt-4 flex flex-col gap-3">
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
      </div>

      {!erpPaymentUrl && (
        <p className="mt-4 text-sm text-amber-300">
          The payment link isn't set up yet. Please contact the organizers before proceeding.
        </p>
      )}

      <motion.div
        animate={{ scale: bothAcknowledged ? 1 : 0.97, opacity: bothAcknowledged ? 1 : 0.55 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
        className="mt-5"
      >
        <Button type="button" className="w-full" disabled={!bothAcknowledged || !erpPaymentUrl} onClick={handlePay}>
          Pay now <ArrowSquareOut size={16} />
        </Button>
      </motion.div>
    </Modal>
  );
}
