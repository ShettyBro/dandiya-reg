import { useCallback, useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { formatPriceInPaise } from "../../lib/hooks/useEventConfig.js";

type Filter = "all" | "payment_pending" | "proof_submitted" | "approved" | "rejected" | "entered" | "not_entered";

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "all" },
  { label: "Payment pending", value: "payment_pending" },
  { label: "Proof submitted", value: "proof_submitted" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Entered", value: "entered" },
  { label: "Not entered", value: "not_entered" }
];

const TYPE_LABELS: Record<string, string> = {
  ACHARYA_STUDENT: "Acharya Student",
  ACHARYA_FACULTY: "Acharya Faculty",
  NON_ACHARYAN_STUDENT: "Non-Acharyan Student"
};

interface RegistrationItem {
  id: string;
  registrationType: string;
  publicCode: string;
  eightDigitCode: string;
  name: string;
  email: string;
  phone: string;
  institution: string | null;
  collegeName: string | null;
  status: string;
  identityStatus: string | null;
  createdAt: string;
  payment: { status: string; amountInPaise: number; transactionId: string | null } | null;
  attendance: { state: string } | null;
}

export function AdminRegistrationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 20;

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    apiRequest<{ items: RegistrationItem[]; total: number }>(`/admin/registrations?${params.toString()}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((error) =>
        setError(
          error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
            ? error.message
            : "Could not load registrations."
        )
      )
      .finally(() => setLoading(false));
  }, [filter, search, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await apiRequest(`/admin/registrations/${id}`, { method: "DELETE" });
      setConfirmingId(null);
      fetchItems();
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "Could not delete this registration."
      );
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <FormField
            label="Search"
            placeholder="Name, email, phone, code, or transaction ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="h-[42px] rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:border-festival-gold/50"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
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
        <p className="text-sm text-white/50">Loading registrations...</p>
      ) : items.length === 0 ? (
        <GlassPanel variant="solid" className="p-8 text-center text-sm text-white/50">
          No registrations in this view.
        </GlassPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <GlassPanel key={item.id} variant="solid" className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-white/50">
                    {TYPE_LABELS[item.registrationType] ?? item.registrationType} · {item.publicCode} ·{" "}
                    {item.email} · {item.phone}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Registered {new Date(item.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-pill border border-white/15 px-3 py-1 text-xs text-white/70">
                    {item.status.replaceAll("_", " ")}
                  </span>
                  {item.payment && (
                    <span className="rounded-pill border border-white/15 px-3 py-1 text-xs text-white/70">
                      {formatPriceInPaise(item.payment.amountInPaise)} · {item.payment.status.replaceAll("_", " ")}
                    </span>
                  )}
                  {item.attendance && (
                    <span className="rounded-pill border border-white/15 px-3 py-1 text-xs text-white/70">
                      {item.attendance.state.replaceAll("_", " ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2 border-t border-white/10 pt-3">
                {confirmingId === item.id ? (
                  <>
                    <span className="mr-auto self-center text-xs text-red-300">
                      Permanently delete this registration and its uploaded files?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-pill border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/70 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="flex items-center gap-1.5 rounded-pill border border-red-400/50 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                    >
                      <Trash size={14} weight="bold" />
                      {deletingId === item.id ? "Deleting..." : "Confirm delete"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    className="flex items-center gap-1.5 rounded-pill border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/60 hover:border-red-400/50 hover:text-red-300"
                  >
                    <Trash size={14} />
                    Delete
                  </button>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-white/60">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-pill border border-white/15 px-3 py-1 disabled:opacity-30"
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-pill border border-white/15 px-3 py-1 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
