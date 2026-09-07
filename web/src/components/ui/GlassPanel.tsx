import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export function GlassPanel({
  className,
  children,
  variant = "glass"
}: {
  className?: string;
  children: ReactNode;
  variant?: "glass" | "solid";
}) {
  return (
    <div
      className={cn(
        "rounded-card border",
        variant === "solid"
          ? "border-white/10 bg-midnight-900/95 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)]"
          : "border-white/15 bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
        className
      )}
    >
      {children}
    </div>
  );
}
