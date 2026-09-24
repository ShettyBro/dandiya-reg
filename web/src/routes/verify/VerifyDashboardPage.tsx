import { useEffect, useState } from "react";
import { StatCard } from "../../components/staff/StatCard.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE, STAFF_SERVER_UNREACHABLE_MESSAGE } from "../../lib/api.js";

interface IdentityDashboardMetrics {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export function VerifyDashboardPage() {
  const [metrics, setMetrics] = useState<IdentityDashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest<IdentityDashboardMetrics>("/admin/identity/dashboard")
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(
            error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
              ? STAFF_SERVER_UNREACHABLE_MESSAGE
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Pending verification" value={String(metrics.pending)} accent="indigo" />
      <StatCard label="Approved" value={String(metrics.approved)} accent="emerald" />
      <StatCard label="Rejected" value={String(metrics.rejected)} accent="red" />
      <StatCard label="Total (Non-Acharyan + Alumni)" value={String(metrics.total)} />
    </div>
  );
}
