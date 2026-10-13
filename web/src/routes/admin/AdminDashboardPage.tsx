import { useEffect, useState } from "react";
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

  if (loading) {
    return <p className="text-sm text-white/50">Loading dashboard...</p>;
  }

  if (error || !metrics) {
    return <p className="text-sm text-red-300">{error ?? "No data available."}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total registrations" value={String(metrics.totalRegistrations)} />
        <StatCard label="Payment pending" value={String(metrics.paymentPending)} accent="indigo" />
        <StatCard label="Proof submitted" value={String(metrics.paymentSubmitted)} accent="indigo" />
        <StatCard label="Approved" value={String(metrics.approved)} accent="emerald" />
        <StatCard label="Rejected" value={String(metrics.rejected)} accent="red" />
        <StatCard label="Total collected" value={formatPriceInPaise(metrics.totalCollectionInPaise)} accent="emerald" />
        <StatCard label="Dandiya kits given" value={String(metrics.collegeGateEntered)} />
        <StatCard label="Event entries" value={String(metrics.eventGateEntered)} />
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
