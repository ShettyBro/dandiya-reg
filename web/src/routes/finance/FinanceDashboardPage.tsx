import { useEffect, useState } from "react";
import { StatCard } from "../../components/staff/StatCard.js";
import { apiRequest } from "../../lib/api.js";
import { formatPriceInPaise } from "../../lib/hooks/useEventConfig.js";

interface DashboardMetrics {
  paymentPending: number;
  paymentSubmitted: number;
  approved: number;
  rejected: number;
  totalCollectionInPaise: number;
}

export function FinanceDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest<DashboardMetrics>("/admin/dashboard")
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load dashboard metrics.");
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <StatCard label="Awaiting proof" value={String(metrics.paymentPending)} accent="indigo" />
      <StatCard label="Pending review" value={String(metrics.paymentSubmitted)} accent="indigo" />
      <StatCard label="Approved" value={String(metrics.approved)} accent="emerald" />
      <StatCard label="Rejected" value={String(metrics.rejected)} accent="red" />
      <StatCard label="Total collected" value={formatPriceInPaise(metrics.totalCollectionInPaise)} accent="emerald" />
    </div>
  );
}
