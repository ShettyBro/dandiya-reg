import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserCircle } from "@phosphor-icons/react";
import { GlassPanel } from "../ui/GlassPanel.js";
import { Button } from "../ui/Button.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";

interface ListItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  registrationType: "MY_PEOPLE_ADMIN" | "MY_PEOPLE_REGULAR";
  status: "PAYMENT_PENDING" | "PAYMENT_APPROVED";
  publicCode: string;
  createdAt: string;
  photoUrl: string | null;
}

export function MyPeoplePanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError(null);
    apiRequest<{ items: ListItem[] }>("/admin/my-people")
      .then((data) => setItems(data.items))
      .catch((fetchError) =>
        setError(
          fetchError instanceof ApiError && fetchError.code === SERVER_UNREACHABLE_CODE
            ? fetchError.message
            : "Could not load My People registrations."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleApprove(id: string) {
    setActionLoading(id);
    setError(null);
    try {
      await apiRequest(`/admin/my-people/${id}/approve`, { method: "POST" });
      fetchItems();
    } catch (approveError) {
      setError(approveError instanceof ApiError ? approveError.message : "Could not approve registration.");
    } finally {
      setActionLoading(null);
    }
  }

  const pending = items.filter((item) => item.status === "PAYMENT_PENDING");
  const approved = items.filter((item) => item.status === "PAYMENT_APPROVED");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 font-display text-sm font-semibold text-white/85">
          My People
        </h2>
        <p className="text-xs text-white/50">
          Invite-only registrations shared directly by the admin. Kept fully separate from regular registrations,
          payments, and identity review.
        </p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {loading ? (
        <p className="text-sm text-white/50">Loading...</p>
      ) : items.length === 0 ? (
        <GlassPanel className="p-8 text-center text-sm text-white/50">No submissions yet.</GlassPanel>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                Pending approval ({pending.length})
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pending.map((item) => (
                  <MyPersonCard key={item.id} item={item} onApprove={handleApprove} actionLoading={actionLoading} />
                ))}
              </div>
            </div>
          )}

          {approved.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                Approved ({approved.length})
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {approved.map((item) => (
                  <MyPersonCard key={item.id} item={item} onApprove={handleApprove} actionLoading={actionLoading} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MyPersonCard({
  item,
  onApprove,
  actionLoading
}: {
  item: ListItem;
  onApprove: (id: string) => void;
  actionLoading: string | null;
}) {
  const isAdmin = item.registrationType === "MY_PEOPLE_ADMIN";
  const isPending = item.status === "PAYMENT_PENDING";

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {item.photoUrl ? (
            <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <UserCircle size={28} className="text-white/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-white">{item.name}</p>
          <p className="truncate text-xs text-white/50">{item.publicCode}</p>
        </div>
        {isAdmin && (
          <span className="flex items-center gap-1 rounded-pill border border-festival-gold/40 bg-festival-gold/10 px-2.5 py-1 text-[10px] font-semibold text-festival-gold">
            <ShieldCheck size={12} weight="fill" />
            Admin
          </span>
        )}
      </div>

      <div className="text-xs text-white/60">
        <p>{item.phone}</p>
        <p className="truncate">{item.email}</p>
      </div>

      <div className="flex items-center justify-between">
        <span
          className={`rounded-pill border px-3 py-1 text-xs font-semibold ${
            isPending
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          }`}
        >
          {isPending ? "Pending" : "Approved"}
        </span>
        {isPending && (
          <Button type="button" onClick={() => onApprove(item.id)} disabled={actionLoading === item.id} className="px-4 py-1.5 text-xs">
            {actionLoading === item.id ? "Working..." : "Approve"}
          </Button>
        )}
      </div>
    </GlassPanel>
  );
}
