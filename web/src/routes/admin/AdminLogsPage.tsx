import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { StatCard } from "../../components/staff/StatCard.js";
import { apiRequest } from "../../lib/api.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

interface SystemStats {
  uptimeSeconds: number;
  hostUptimeSeconds: number;
  loadAverage: number[];
  cpuCount: number;
  memory: { totalBytes: number; freeBytes: number };
  disk: { totalBytes: number; freeBytes: number; usedBytes: number } | null;
  nodeVersion: string;
  env: string;
}

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
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface ParsedLogLine {
  key: number;
  text: string;
  tone: "info" | "success" | "warn" | "error";
}

function parseLogLine(raw: string, key: number): ParsedLogLine {
  try {
    const obj = JSON.parse(raw) as {
      time?: number;
      msg?: string;
      req?: { method?: string; url?: string };
      res?: { statusCode?: number };
      responseTime?: number;
      err?: { message?: string };
    };
    const time = obj.time ? new Date(obj.time).toLocaleTimeString("en-IN", { hour12: false }) : "";

    if (obj.req && obj.res) {
      const status = obj.res.statusCode ?? 0;
      const tone: ParsedLogLine["tone"] = status >= 500 ? "error" : status >= 400 ? "warn" : "success";
      return {
        key,
        tone,
        text: `[${time}] ${obj.req.method} ${obj.req.url} -> ${status} (${obj.responseTime ?? "?"}ms)`
      };
    }
    if (obj.err) {
      return { key, tone: "error", text: `[${time}] ERROR: ${obj.err.message ?? obj.msg ?? "unknown"}` };
    }
    return { key, tone: "info", text: `[${time}] ${obj.msg ?? raw}` };
  } catch {
    return { key, tone: "info", text: raw };
  }
}

const TONE_CLASS: Record<ParsedLogLine["tone"], string> = {
  info: "text-white/60",
  success: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-red-300"
};

export function AdminLogsPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [emailJobs, setEmailJobs] = useState<EmailJobsResponse | null>(null);
  const [lines, setLines] = useState<ParsedLogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const lineCounter = useRef(0);

  useEffect(() => {
    apiRequest<SystemStats>("/admin/system-stats").then(setStats).catch(() => undefined);
    apiRequest<EmailJobsResponse>("/admin/email-jobs").then(setEmailJobs).catch(() => undefined);
    const interval = setInterval(() => {
      apiRequest<SystemStats>("/admin/system-stats").then(setStats).catch(() => undefined);
      apiRequest<EmailJobsResponse>("/admin/email-jobs").then(setEmailJobs).catch(() => undefined);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/admin/logs/stream`, { withCredentials: true });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      lineCounter.current += 1;
      setLines((prev) => {
        const next = [...prev, parseLogLine(event.data, lineCounter.current)];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const diskUsedPercent = stats?.disk ? Math.round((stats.disk.usedBytes / stats.disk.totalBytes) * 100) : null;
  const memUsedPercent = stats
    ? Math.round(((stats.memory.totalBytes - stats.memory.freeBytes) / stats.memory.totalBytes) * 100)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-white">Server</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Host uptime" value={stats ? formatDuration(stats.hostUptimeSeconds) : "—"} />
          <StatCard
            label="Memory"
            value={stats ? `${formatBytes(stats.memory.totalBytes - stats.memory.freeBytes)} / ${formatBytes(stats.memory.totalBytes)}` : "—"}
            accent={memUsedPercent !== null && memUsedPercent > 85 ? "red" : "indigo"}
          />
          <StatCard
            label="Disk"
            value={stats?.disk ? `${formatBytes(stats.disk.usedBytes)} / ${formatBytes(stats.disk.totalBytes)}` : "—"}
            accent={diskUsedPercent !== null && diskUsedPercent > 85 ? "red" : "indigo"}
          />
          <StatCard label="Load avg" value={stats ? stats.loadAverage.map((n) => n.toFixed(2)).join(" / ") : "—"} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-white">Email queue</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Pending" value={String(emailJobs?.counts.PENDING ?? 0)} accent="indigo" />
          <StatCard label="Processing" value={String(emailJobs?.counts.PROCESSING ?? 0)} accent="indigo" />
          <StatCard label="Retry" value={String(emailJobs?.counts.RETRY ?? 0)} accent="red" />
          <StatCard label="Sent" value={String(emailJobs?.counts.SENT ?? 0)} accent="emerald" />
          <StatCard label="Failed" value={String(emailJobs?.counts.FAILED ?? 0)} accent="red" />
        </div>

        {emailJobs && emailJobs.items.length > 0 && (
          <GlassPanel className="mt-4 overflow-x-auto p-4">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-white/50">
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Recipient</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Attempts</th>
                  <th className="pb-2 font-medium">Sent / Error</th>
                </tr>
              </thead>
              <tbody>
                {emailJobs.items.slice(0, 20).map((job) => (
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
                    <td className="py-2 text-white/50">
                      {job.sentAt ? new Date(job.sentAt).toLocaleString("en-IN") : job.lastError ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">Live logs</h2>
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${connected ? "text-emerald-300" : "text-red-300"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-300" : "bg-red-300"}`} />
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="h-96 overflow-y-auto rounded-2xl border border-white/10 bg-black p-4 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 && <p className="text-white/30">Waiting for log activity...</p>}
          {lines.map((line) => (
            <p key={line.key} className={TONE_CLASS[line.tone]}>
              {line.text}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
