import { GlassPanel } from "../ui/GlassPanel.js";

export function StatCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: "gold" | "emerald" | "red" | "indigo";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "red"
        ? "text-red-300"
        : accent === "indigo"
          ? "text-indigo-300"
          : "text-festival-gold";

  return (
    <GlassPanel className="p-5">
      <p className="text-xs uppercase tracking-[0.12em] text-white/50">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold ${accentClass}`}>{value}</p>
    </GlassPanel>
  );
}
