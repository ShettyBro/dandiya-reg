import { useCallback, useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { GlassPanel } from "../ui/GlassPanel.js";
import { Button } from "../ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";

type RegistrationStatus =
  | "PAYMENT_PENDING"
  | "IDENTITY_PENDING"
  | "IDENTITY_REJECTED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED";

interface ListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  collegeName: string | null;
  publicCode: string;
  status: RegistrationStatus;
  identityStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  createdAt: string;
}

interface DetailItem extends ListItem {
  identityRejectionReason: string | null;
  aadhaarNumber: string | null;
  photoUrl: string | null;
  aadhaarImageUrl: string | null;
  collegeIdImageUrl: string | null;
  payment: { transactionId: string | null; status: string; submittedAt: string | null } | null;
}

const FILTERS: Array<{ label: string; value: RegistrationStatus | "ALL" }> = [
  { label: "Pending identity", value: "IDENTITY_PENDING" },
  { label: "Identity rejected", value: "IDENTITY_REJECTED" },
  { label: "All", value: "ALL" }
];

export function IdentityReviewPanel() {
  const [filter, setFilter] = useState<RegistrationStatus | "ALL">("IDENTITY_PENDING");
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailItem>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError(null);
    const query = filter === "ALL" ? "" : `?status=${filter}`;
    apiRequest<{ items: ListItem[] }>(`/admin/identity/non-acharyan${query}`)
      .then((data) => setItems(data.items))
      .catch(() => setError("Could not load registrations."))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    if (!details[id]) {
      setDetailLoading(id);
      try {
        const detail = await apiRequest<DetailItem>(`/admin/identity/non-acharyan/${id}`);
        setDetails((prev) => ({ ...prev, [id]: detail }));
      } catch {
        setError("Could not load identity details.");
      } finally {
        setDetailLoading(null);
      }
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    setError(null);
    try {
      await apiRequest(`/admin/identity/non-acharyan/${id}/approve`, { method: "POST" });
      fetchItems();
    } catch (approveError) {
      setError(approveError instanceof ApiError ? approveError.message : "Could not approve identity.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    const reason = rejectReasons[id]?.trim();
    if (!reason || reason.length < 3) {
      setError("Enter a rejection reason of at least 3 characters.");
      return;
    }
    setActionLoading(id);
    setError(null);
    try {
      await apiRequest(`/admin/identity/non-acharyan/${id}/reject`, { method: "POST", body: { reason } });
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchItems();
    } catch (rejectError) {
      setError(rejectError instanceof ApiError ? rejectError.message : "Could not reject identity.");
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
        <p className="text-sm text-white/50">Loading...</p>
      ) : items.length === 0 ? (
        <GlassPanel className="p-8 text-center text-sm text-white/50">Nothing in this view.</GlassPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const detail = details[item.id];
            const canAct = item.status === "IDENTITY_PENDING";

            return (
              <GlassPanel key={item.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(item.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                >
                  <div>
                    <p className="font-display text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-white/50">
                      {item.publicCode} &middot; {item.collegeName ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-pill border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                      {item.status.replace(/_/g, " ")}
                    </span>
                    <CaretDown size={16} className={`text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 bg-black/15 p-4">
                    {detailLoading === item.id || !detail ? (
                      <p className="text-sm text-white/50">Loading details...</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-white/50">Phone</p>
                            <p className="mt-1 text-white/85">{detail.phone}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/50">Email</p>
                            <p className="mt-1 text-white/85">{detail.email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/50">Aadhaar number</p>
                            <p className="mt-1 font-mono text-white/85">{detail.aadhaarNumber ?? "—"}</p>
                          </div>
                          {detail.identityRejectionReason && (
                            <div className="col-span-full">
                              <p className="text-xs text-white/50">Previous rejection reason</p>
                              <p className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-red-300">
                                {detail.identityRejectionReason}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {[
                            { label: "Photo", url: detail.photoUrl },
                            { label: "Aadhaar image", url: detail.aadhaarImageUrl },
                            { label: "College ID image", url: detail.collegeIdImageUrl }
                          ].map((slot) => (
                            <div key={slot.label}>
                              <p className="mb-1.5 text-xs text-white/50">{slot.label}</p>
                              {slot.url ? (
                                <img
                                  src={slot.url}
                                  alt={slot.label}
                                  className="max-h-56 w-full rounded-xl border border-white/10 object-contain bg-black"
                                />
                              ) : (
                                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/15 text-xs text-white/40">
                                  Not uploaded
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {canAct && (
                          <div className="mt-5 border-t border-white/10 pt-4">
                            <label className="mb-2 block text-xs text-white/50">
                              Rejection reason (required only to reject)
                            </label>
                            <textarea
                              rows={2}
                              value={rejectReasons[item.id] ?? ""}
                              onChange={(e) => setRejectReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                              placeholder="Why is identity verification failing?"
                            />
                            <div className="mt-3 flex gap-3">
                              <Button type="button" onClick={() => handleApprove(item.id)} disabled={actionLoading === item.id}>
                                {actionLoading === item.id ? "Working..." : "Approve identity"}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleReject(item.id)}
                                disabled={actionLoading === item.id}
                              >
                                Reject identity
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
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
