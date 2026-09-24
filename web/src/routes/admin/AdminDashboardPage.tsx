import { useEffect, useState } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { StatCard } from "../../components/staff/StatCard.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";
import { formatPriceInPaise } from "../../lib/hooks/useEventConfig.js";

interface DashboardMetrics {
  totalRegistrations: number;
  paymentPending: number;
  paymentSubmitted: number;
  approved: number;
  rejected: number;
  totalCollectionInPaise: number;
  collegeGateEntered: number;
  eventGateEntered: number;
  remainingCapacity: number | null;
  overrideCount: number;
  registrationOpen: boolean | null;
  maintenanceMode: boolean | null;
}

interface IdentityDashboardMetrics {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [identityMetrics, setIdentityMetrics] = useState<IdentityDashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  function fetchMetrics() {
    setLoading(true);
    setError(null);
    Promise.all([apiRequest<DashboardMetrics>("/admin/dashboard"), apiRequest<IdentityDashboardMetrics>("/admin/identity/dashboard")])
      .then(([data, identity]) => {
        setMetrics(data);
        setIdentityMetrics(identity);
      })
      .catch((error) => {
        setError(
          error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
            ? error.message
            : "Could not load dashboard metrics."
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function handleToggleRegistration() {
    if (!metrics || metrics.registrationOpen === null) return;
    const next = !metrics.registrationOpen;
    setToggling(true);
    setToggleError(null);
    try {
      await apiRequest("/admin/settings", {
        method: "POST",
        body: { registrationOpen: next }
      });
      setMetrics({ ...metrics, registrationOpen: next });
    } catch (err) {
      setToggleError(
        err instanceof ApiError && err.code === SERVER_UNREACHABLE_CODE
          ? err.message
          : "Could not update registration status."
      );
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-white/50">Loading dashboard...</p>;
  }

  if (error || !metrics) {
    return <p className="text-sm text-red-300">{error ?? "No data available."}</p>;
  }

  const isOpen = metrics.registrationOpen ?? false;

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-white/50">Registration status</p>
          <p className={`mt-1 font-display text-lg font-semibold ${isOpen ? "text-emerald-300" : "text-red-300"}`}>
            {isOpen ? "Open" : "Closed"}
          </p>
          {toggleError && <p className="mt-1 text-xs text-red-300">{toggleError}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {metrics.maintenanceMode && (
            <span className="rounded-pill border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
              Maintenance mode active
            </span>
          )}
          <button
            type="button"
            disabled={toggling}
            onClick={handleToggleRegistration}
            className={`rounded-pill border px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              isOpen
                ? "border-red-400/40 bg-red-400/10 text-red-300 hover:bg-red-400/20"
                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
            }`}
          >
            {toggling ? "Updating..." : isOpen ? "Close registrations" : "Open registrations"}
          </button>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total registrations" value={String(metrics.totalRegistrations)} />
        <StatCard label="Payment pending" value={String(metrics.paymentPending)} accent="indigo" />
        <StatCard label="Proof submitted" value={String(metrics.paymentSubmitted)} accent="indigo" />
        <StatCard label="Approved" value={String(metrics.approved)} accent="emerald" />
        <StatCard label="Rejected" value={String(metrics.rejected)} accent="red" />
        <StatCard label="Total collected" value={formatPriceInPaise(metrics.totalCollectionInPaise)} accent="emerald" />
        <StatCard label="College Gate entered" value={String(metrics.collegeGateEntered)} />
        <StatCard label="Event Gate entered" value={String(metrics.eventGateEntered)} />
        <StatCard
          label="Vs. planning capacity (not a cap)"
          value={metrics.remainingCapacity === null ? "—" : String(metrics.remainingCapacity)}
        />
        <StatCard label="Team Leader overrides" value={String(metrics.overrideCount)} accent="red" />
      </div>

      {identityMetrics && (
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-white/50">
            ID verification (Non-Acharyan + Alumni)
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Pending verification" value={String(identityMetrics.pending)} accent="indigo" />
            <StatCard label="Approved" value={String(identityMetrics.approved)} accent="emerald" />
            <StatCard label="Rejected" value={String(identityMetrics.rejected)} accent="red" />
            <StatCard label="Total" value={String(identityMetrics.total)} />
          </div>
        </div>
      )}
    </div>
  );
}
