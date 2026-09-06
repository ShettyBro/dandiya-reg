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
  entered: number;
  remainingCapacity: number | null;
  overrideCount: number;
  registrationOpen: boolean | null;
  maintenanceMode: boolean | null;
}

export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest<DashboardMetrics>("/admin/dashboard")
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(
            error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
              ? error.message
              : "Could not load dashboard metrics."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-white/50">Loading dashboard...</p>;
  }

  if (error || !metrics) {
    return <p className="text-sm text-red-300">{error ?? "No data available."}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-white/50">Registration status</p>
          <p className="mt-1 font-display text-lg font-semibold text-white">
            {metrics.registrationOpen ? "Open" : "Closed"}
          </p>
        </div>
        {metrics.maintenanceMode && (
          <span className="rounded-pill border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
            Maintenance mode active
          </span>
        )}
      </GlassPanel>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total registrations" value={String(metrics.totalRegistrations)} />
        <StatCard label="Payment pending" value={String(metrics.paymentPending)} accent="indigo" />
        <StatCard label="Proof submitted" value={String(metrics.paymentSubmitted)} accent="indigo" />
        <StatCard label="Approved" value={String(metrics.approved)} accent="emerald" />
        <StatCard label="Rejected" value={String(metrics.rejected)} accent="red" />
        <StatCard label="Total collected" value={formatPriceInPaise(metrics.totalCollectionInPaise)} accent="emerald" />
        <StatCard label="Entered" value={String(metrics.entered)} />
        <StatCard
          label="Vs. planning capacity (not a cap)"
          value={metrics.remainingCapacity === null ? "—" : String(metrics.remainingCapacity)}
        />
        <StatCard label="Team Leader overrides" value={String(metrics.overrideCount)} accent="red" />
      </div>
    </div>
  );
}
