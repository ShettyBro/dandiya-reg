import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
}

export function SelectField({ label, error, className, id, children, ...rest }: SelectFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-white/85">
        {label}
      </label>
      <select
        id={fieldId}
        className={cn(
          "rounded-xl border bg-white/5 px-4 py-3 text-sm text-white",
          "focus:outline-none focus:ring-2 focus:ring-indigo-400/60",
          error ? "border-red-400/60" : "border-white/15",
          className
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
