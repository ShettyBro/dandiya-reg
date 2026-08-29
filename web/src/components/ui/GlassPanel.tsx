import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export function GlassPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-card border border-white/15 bg-white/[0.15]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
        className
      )}
    >
      {children}
    </div>
  );
}
