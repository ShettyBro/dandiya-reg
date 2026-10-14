import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { StatCard } from "../../components/staff/StatCard.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest } from "../../lib/api.js";

interface EmailJobItem {
  id: string;
  type: string;
  recipient: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  lockedUntil: string | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface EmailJobsResponse {
  counts: Record<string, number>;
  items: EmailJobItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 100;

export function AdminEmailLogsPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [items, setItems] = useState<EmailJobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (replace) setRefreshing(true);
    else setLoadingMore(true);
    try {
      const response = await apiRequest<EmailJobsResponse>(`/admin/email-jobs?page=${nextPage}&pageSize=${PAGE_SIZE}`);
      setCounts(response.counts);
      setTotal(response.total);
      setPage(nextPage);
      setItems((prev) => (replace ? response.items : [...prev, ...response.items]));
    } catch {
      // Keep whatever was already loaded on a transient failure -- the Refresh button or the
      // next scroll-triggered load will simply try again.
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current && items.length < total) {
          loadPage(page + 1, false);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, total, page, loadPage]);

  function handleRefresh() {
    loadPage(1, true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-white">Email queue</h2>
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2">
          <ArrowClockwise size={16} className={refreshing ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Pending" value={String(counts.PENDING ?? 0)} accent="indigo" />
        <StatCard label="Processing" value={String(counts.PROCESSING ?? 0)} accent="indigo" />
        <StatCard label="Retry" value={String(counts.RETRY ?? 0)} accent="red" />
        <StatCard label="Sent" value={String(counts.SENT ?? 0)} accent="emerald" />
        <StatCard label="Failed" value={String(counts.FAILED ?? 0)} accent="red" />
      </div>

      <GlassPanel className="overflow-x-auto p-4">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="text-white/50">
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Recipient</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Attempts</th>
              <th className="pb-2 pr-4 font-medium">Next attempt</th>
              <th className="pb-2 font-medium">Sent / Error</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id} className="border-t border-white/10 text-white/80">
                <td className="py-2 pr-4">{job.type}</td>
                <td className="py-2 pr-4">{job.recipient}</td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      job.status === "SENT"
                        ? "text-emerald-300"
                        : job.status === "FAILED"
                          ? "text-red-300"
                          : "text-amber-300"
                    }
                  >
                    {job.status}
                  </span>
                </td>
                <td className="py-2 pr-4">{job.attempts}</td>
                <td className="py-2 pr-4 text-white/50">
                  {job.status === "SENT" ? "—" : new Date(job.nextAttemptAt).toLocaleString("en-IN")}
                </td>
                <td className="py-2 text-white/50">
                  {job.sentAt ? new Date(job.sentAt).toLocaleString("en-IN") : (job.lastError ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && !refreshing && <p className="py-6 text-center text-white/40">No email jobs yet.</p>}

        <div ref={sentinelRef} className="py-4 text-center text-xs text-white/40">
          {loadingMore && "Loading more..."}
          {!loadingMore && items.length >= total && items.length > 0 && `All ${total} loaded.`}
        </div>
      </GlassPanel>
    </div>
  );
}
