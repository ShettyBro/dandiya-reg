import { useEffect, useRef, useState } from "react";

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeParts(target: Date, now: Date): CountdownParts | null {
  const remainingMs = target.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((remainingMs % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function HalfDigit({ text, position }: { text: string; position: "top" | "bottom" }) {
  return (
    <div
      className={`absolute inset-x-0 overflow-hidden ${position === "top" ? "top-0" : "bottom-0"}`}
      style={{ height: "calc(var(--flip-h) / 2)" }}
    >
      <div
        className="absolute inset-x-0 flex items-center justify-center font-display font-bold tabular-nums text-white"
        style={{
          height: "var(--flip-h)",
          [position]: 0,
          fontSize: "calc(var(--flip-h) * 0.44)"
        }}
      >
        {text}
      </div>
    </div>
  );
}

function FlipUnit({ value, label }: { value: number; label: string }) {
  const text = pad(value);
  const [displayed, setDisplayed] = useState(text);
  const [previous, setPrevious] = useState(text);
  const [flipping, setFlipping] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (text === displayed) {
      return;
    }
    if (prefersReducedMotion()) {
      setDisplayed(text);
      return;
    }
    setPrevious(displayed);
    setFlipping(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setDisplayed(text);
      setFlipping(false);
    }, 600);
    return () => window.clearTimeout(timeoutRef.current);
  }, [text, displayed]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-14 rounded-xl bg-midnight-800 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:w-[4.5rem]"
        style={{ height: "var(--flip-h)", perspective: "300px" }}
      >
        <HalfDigit text={text} position="top" />
        <HalfDigit text={flipping ? previous : text} position="bottom" />

        <div className="absolute inset-x-0 top-1/2 z-20 h-px -translate-y-1/2 bg-black/50" />

        {flipping && (
          <>
            <div
              className="absolute inset-x-0 top-0 z-10 origin-bottom animate-flip-leaf-top overflow-hidden rounded-t-xl [transform-style:preserve-3d]"
              style={{ height: "calc(var(--flip-h) / 2)" }}
            >
              <div
                className="absolute inset-x-0 top-0 flex items-center justify-center rounded-t-xl bg-midnight-800 font-display font-bold tabular-nums text-white"
                style={{ height: "var(--flip-h)", fontSize: "calc(var(--flip-h) * 0.44)" }}
              >
                {previous}
              </div>
            </div>
            <div
              className="absolute inset-x-0 bottom-0 z-10 origin-top animate-flip-leaf-bottom overflow-hidden rounded-b-xl [transform-style:preserve-3d]"
              style={{ height: "calc(var(--flip-h) / 2)" }}
            >
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center rounded-b-xl bg-midnight-800 font-display font-bold tabular-nums text-white"
                style={{ height: "var(--flip-h)", fontSize: "calc(var(--flip-h) * 0.44)" }}
              >
                {text}
              </div>
            </div>
          </>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-[0.2em] text-festival-gold">{label}</span>
    </div>
  );
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
        <div className="flex items-start justify-center gap-2.5 [--flip-h:3.5rem] sm:gap-4 sm:[--flip-h:4.5rem]">
          <FlipUnit value={parts.days} label="Days" />
          <FlipUnit value={parts.hours} label="Hours" />
          <FlipUnit value={parts.minutes} label="Minutes" />
          <FlipUnit value={parts.seconds} label="Seconds" />
        </div>
      )}
    </div>
  );
}
