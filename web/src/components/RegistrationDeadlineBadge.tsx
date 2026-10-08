import { Clock, XCircle } from "@phosphor-icons/react";
import { cn } from "../lib/cn.js";
import { formatShortDate, useEventConfig } from "../lib/hooks/useEventConfig.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function RegistrationDeadlineBadge({ className }: { className?: string }) {
  const { config } = useEventConfig();

  if (!config?.registrationDeadline) return null;

  const deadlinePassed = new Date(config.registrationDeadline).getTime() <= Date.now();

  // Either the deadline itself has passed, or an admin closed registration early for some other
  // reason (manual toggle, maintenance mode) — either way, config.registrationOpen already folds
  // all of those together server-side, so it's the single source of truth for "closed" here too.
  if (deadlinePassed || !config.registrationOpen) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-300",
          className
        )}
      >
        <XCircle size={14} weight="fill" />
        Registration closed
      </p>
    );
  }

  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(config.registrationDeadline).getTime() - Date.now()) / MS_PER_DAY)
  );

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300",
        className
      )}
    >
      <Clock size={14} weight="fill" />
      Registration closes {formatShortDate(config.registrationDeadline)} &middot; {daysLeft} day
      {daysLeft === 1 ? "" : "s"} left
    </p>
  );
}
