import { useCallback, useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { GlassPanel } from "../ui/GlassPanel.js";
import { Button } from "../ui/Button.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { formatPriceInPaise } from "../../lib/hooks/useEventConfig.js";

type PaymentStatus = "PENDING" | "PROOF_SUBMITTED" | "APPROVED" | "REJECTED";

interface EmailJobSummary {
  type: string;
  status: string;
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface PaymentItem {
  id: string;
  registrationId: string;
  transactionId: string | null;
  amountInPaise: number;
  status: PaymentStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  registration: {
    name: string;
    publicCode: string;
    email: string;
    registrationType: "ACHARYA_STUDENT" | "ACHARYA_FACULTY" | "NON_ACHARYAN_STUDENT";
    identityStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
    emailJobs: EmailJobSummary[];
  };
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Awaiting proof",
  PROOF_SUBMITTED: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected"
};

const STATUS_CLASSES: Record<PaymentStatus, string> = {
  PENDING: "text-white/50 bg-white/10 border-white/20",
  PROOF_SUBMITTED: "text-amber-300 bg-amber-400/10 border-amber-400/40",
  APPROVED: "text-emerald-300 bg-emerald-400/10 border-emerald-400/40",
  REJECTED: "text-red-300 bg-red-400/10 border-red-400/40"
};

const FILTERS: Array<{ label: string; value: PaymentStatus | "ALL" }> = [
  { label: "Pending review", value: "PROOF_SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All", value: "ALL" }
];

export function PaymentsPanel() {
  const [filter, setFilter] = useState<PaymentStatus | "ALL">("PROOF_SUBMITTED");
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [proofLoading, setProofLoading] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPayments = useCallback(() => {
    setLoading(true);
    setError(null);
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    apiRequest<{ items: PaymentItem[] }>(`/admin/payments${query}`)
      .then((data) => setItems(data.items))
      .catch((error) =>
        setError(
          error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
            ? error.message
            : "Could not load payments."
        )
      )
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  async function loadProofUrl(paymentId: string) {
    setProofLoading(paymentId);
    try {
      const data = await apiRequest<{ url: string }>(`/admin/payments/${paymentId}/proof-url`);
      setProofUrls((prev) => ({ ...prev, [paymentId]: data.url }));
    } catch (proofError) {
      setError(
        proofError instanceof ApiError && proofError.code === SERVER_UNREACHABLE_CODE
          ? proofError.message
          : "Could not load the payment screenshot."
      );
    } finally {
      setProofLoading(null);
    }
  }

  function toggleExpand(paymentId: string) {
    setExpandedId((prev) => (prev === paymentId ? null : paymentId));
    if (!proofUrls[paymentId]) {
      loadProofUrl(paymentId);
    }
  }

  async function handleApprove(paymentId: string) {
    setActionLoading(paymentId);
    setError(null);
    try {
      await apiRequest(`/admin/payments/${paymentId}/approve`, { method: "POST" });
      fetchPayments();
    } catch (approveError) {
      if (approveError instanceof ApiError) {
        setError(approveError.message);
      } else {
        setError("Could not approve this payment.");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(paymentId: string) {
    const reason = rejectReasons[paymentId]?.trim();
    if (!reason || reason.length < 3) {
      setError("Enter a rejection reason of at least 3 characters.");
      return;
    }
    setActionLoading(paymentId);
    setError(null);
    try {
      await apiRequest(`/admin/payments/${paymentId}/reject`, { method: "POST", body: { reason } });
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[paymentId];
        return next;
      });
      fetchPayments();
    } catch (rejectError) {
      if (rejectError instanceof ApiError) {
        setError(rejectError.message);
      } else {
        setError("Could not reject this payment.");
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? "border-festival-gold bg-festival-gold/10 text-festival-gold"
                : "border-white/15 text-white/60 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {loading ? (
        <p className="text-sm text-white/50">Loading payments...</p>
      ) : items.length === 0 ? (
        <GlassPanel className="p-8 text-center text-sm text-white/50">No payments in this view.</GlassPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((payment) => {
            const isExpanded = expandedId === payment.id;
            const identityBlocked =
              payment.registration.registrationType === "NON_ACHARYAN_STUDENT" &&
              payment.registration.identityStatus !== "APPROVED";
            const canAct = payment.status === "PROOF_SUBMITTED" && !identityBlocked;
            return (
              <GlassPanel key={payment.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(payment.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                >
                  <div>
                    <p className="font-display text-sm font-semibold text-white">{payment.registration.name}</p>
                    <p className="text-xs text-white/50">
                      {payment.registration.publicCode} · {payment.registration.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-sm font-semibold text-emerald-300">
                      {formatPriceInPaise(payment.amountInPaise)}
                    </span>
                    <span
                      className={`rounded-pill border px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[payment.status]}`}
                    >
                      {STATUS_LABELS[payment.status]}
                    </span>
                    <CaretDown
                      size={16}
                      className={`text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 bg-black/15 p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-white/50">Transaction ID</p>
                        <p className="mt-1 font-mono text-white/85">{payment.transactionId ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/50">Submitted</p>
                        <p className="mt-1 text-white/85">
                          {payment.submittedAt ? new Date(payment.submittedAt).toLocaleString("en-IN") : "—"}
                        </p>
                      </div>
                      {payment.verifiedAt && (
                        <div>
                          <p className="text-xs text-white/50">Verified</p>
                          <p className="mt-1 text-white/85">{new Date(payment.verifiedAt).toLocaleString("en-IN")}</p>
                        </div>
                      )}
                      {payment.rejectionReason && (
                        <div className="col-span-full">
                          <p className="text-xs text-white/50">Rejection reason</p>
                          <p className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-red-300">
                            {payment.rejectionReason}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <p className="mb-2 text-xs font-semibold text-white/70">Payment screenshot</p>
                      {proofUrls[payment.id] ? (
                        <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-white/10 bg-black">
                          <img src={proofUrls[payment.id]} alt="Payment proof" className="w-full object-contain" />
                        </div>
                      ) : proofLoading === payment.id ? (
                        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-xs text-white/50">
                          Loading screenshot...
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-xs text-white/50">
                          Could not load the screenshot.
                        </div>
                      )}
                    </div>

                    {payment.registration.emailJobs.length > 0 && (
                      <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold text-white/70">Email notifications</p>
                        <div className="flex flex-col gap-1.5">
                          {payment.registration.emailJobs.map((job, i) => (
                            <div
                              key={i}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs"
                            >
                              <span className="text-white/70">{job.type}</span>
                              <span
                                className={
                                  job.status === "SENT"
                                    ? "text-emerald-300"
                                    : job.status === "FAILED"
                                      ? "text-red-300"
                                      : "text-amber-300"
                                }
                              >
                                {job.status} {job.attempts > 0 && `(${job.attempts} attempt${job.attempts !== 1 ? "s" : ""})`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {identityBlocked && payment.status === "PROOF_SUBMITTED" && (
                      <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
                        This is a Non-Acharyan registration — identity must be approved on the Identity
                        review page before payment can be approved or rejected.
                      </div>
                    )}

                    {canAct && (
                      <div className="mt-5 border-t border-white/10 pt-4">
                        <label className="mb-2 block text-xs text-white/50">
                          Rejection reason (required only to reject)
                        </label>
                        <textarea
                          rows={2}
                          value={rejectReasons[payment.id] ?? ""}
                          onChange={(e) =>
                            setRejectReasons((prev) => ({ ...prev, [payment.id]: e.target.value }))
                          }
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                          placeholder="Why is this payment being rejected?"
                        />
                        <div className="mt-3 flex gap-3">
                          <Button
                            type="button"
                            onClick={() => handleApprove(payment.id)}
                            disabled={actionLoading === payment.id}
                          >
                            {actionLoading === payment.id ? "Working..." : "Approve"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleReject(payment.id)}
                            disabled={actionLoading === payment.id}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
