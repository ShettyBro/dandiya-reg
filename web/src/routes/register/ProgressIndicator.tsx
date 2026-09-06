import { cn } from "../../lib/cn.js";

const BASE_STEPS = ["Details", "Photo", "Payment", "Done"];
const WITH_IDENTITY_STEPS = ["Details", "Photo", "Identity", "Payment", "Done"];

export function ProgressIndicator({ current, showIdentity }: { current: number; showIdentity: boolean }) {
  const steps = showIdentity ? WITH_IDENTITY_STEPS : BASE_STEPS;

  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const active = stepNumber === current;
        const complete = stepNumber < current;

        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                complete && "bg-festival-gold text-midnight-950",
                active && "border-2 border-festival-gold text-festival-gold",
                !active && !complete && "border border-white/20 text-white/40"
              )}
            >
              {stepNumber}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:block",
                active || complete ? "text-white/85" : "text-white/40"
              )}
            >
              {label}
            </span>
            {stepNumber < steps.length && <div className="h-px flex-1 bg-white/10" />}
          </li>
        );
      })}
    </ol>
  );
}
