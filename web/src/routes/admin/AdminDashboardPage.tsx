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

function QrDownloadCodeCard() {
  const [code, setCode] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await apiRequest<{ code: string; secondsRemaining: number }>(
          "/admin/qr-download/current-code"
        );
        if (!cancelled) {
          setCode(response.code);
          setSecondsRemaining(response.secondsRemaining);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load code.");
      }
    }

    poll();
    const interval = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied/unavailable — the code is still visible to copy by hand.
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-festival-gold/40 bg-festival-gold p-6 shadow-goldGlow">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-midnight-950/70">
          QR Download Page Access Code
        </p>
        {code ? (
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-midnight-950">{code}</p>
        ) : (
          <p className="mt-1 text-sm text-midnight-950/70">{error ?? "Loading..."}</p>
        )}
        {code && <p className="mt-1 text-xs text-midnight-950/70">Changes in {secondsRemaining}s · /qr-down</p>}
      </div>
      {code && (
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-pill border border-midnight-950/20 bg-midnight-950/10 px-5 py-2 text-sm font-semibold text-midnight-950 transition-colors hover:bg-midnight-950/20"
        >
          {copied ? "Copied!" : "Copy code"}
        </button>
      )}
    </div>
  );
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
      <QrDownloadCodeCard />

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
