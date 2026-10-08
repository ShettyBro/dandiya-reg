import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "../../lib/cn.js";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-festival-gold text-midnight-950 font-semibold hover:bg-festival-goldDim shadow-goldGlow",
  secondary:
    "border border-white/20 bg-white/5 text-white hover:bg-white/10",
  ghost: "text-white/80 hover:text-white"
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-sm transition-all whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:shadow-none";

const HOVER_TRANSITION = { type: "spring", stiffness: 400, damping: 20 } as const;

interface CommonProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

export function Button({
  variant = "primary",
  className,
  children,
  disabled,
  ...rest
}: CommonProps & NativeButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={HOVER_TRANSITION}
      disabled={disabled}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], className)}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

export function LinkButton({
  to,
  variant = "primary",
  className,
  children,
  disabled = false
}: CommonProps & { to: string; disabled?: boolean }) {
  if (disabled) {
    // A disabled <Link> isn't a real thing in the DOM — render a plain span so it's neither
    // clickable nor keyboard-focusable/navigable, instead of just styling a still-live Link.
    return (
      <span
        aria-disabled="true"
        className={cn(
          BASE_CLASSES,
          VARIANT_CLASSES[variant],
          "pointer-events-none cursor-not-allowed opacity-40 grayscale shadow-none",
          className
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <MotionLink
      to={to}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={HOVER_TRANSITION}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], className)}
    >
      {children}
    </MotionLink>
  );
}
