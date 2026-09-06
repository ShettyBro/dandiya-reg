import { useEffect, useState } from "react";

interface CountdownParts {
  months: number;
  days: number;
  hours: number;
}

function computeParts(target: Date, now: Date): CountdownParts | null {
  if (now.getTime() >= target.getTime()) {
    return null;
  }

  let months = 0;
  const cursor = new Date(now);
  while (true) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next.getTime() > target.getTime()) {
      break;
    }
    cursor.setMonth(cursor.getMonth() + 1);
    months += 1;
  }

  const remainingMs = target.getTime() - cursor.getTime();
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return { months, days, hours };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function Countdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso);
  const [parts, setParts] = useState<CountdownParts | null>(() => computeParts(target, new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setParts(computeParts(target, new Date()));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity] duration-700 motion-reduce:transition-none ${
        parts ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
      }`}
      aria-hidden={!parts}
    >
      {parts && (
        <div className="flex items-center justify-center gap-4 text-white">
          {[
            { label: "Months", value: parts.months },
            { label: "Days", value: parts.days },
            { label: "Hours", value: parts.hours }
          ].map((unit) => (
            <div key={unit.label} className="flex flex-col items-center">
              <span className="font-display text-3xl font-bold text-festival-gold sm:text-4xl">
                {pad(unit.value)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-white/50">{unit.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
