import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { cn } from "../../lib/cn.js";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  prefix?: string;
}

export function FormField({ label, error, className, id, prefix, type, ...rest }: FormFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-white/85">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-white/60">
            {prefix}
          </span>
        )}
        <input
          id={fieldId}
          type={isPassword ? (revealed ? "text" : "password") : type}
          className={cn(
            "w-full rounded-xl border bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35",
            "focus:outline-none focus:ring-2 focus:ring-indigo-400/60",
            error ? "border-red-400/60" : "border-white/15",
            prefix && "pl-11",
            isPassword && "pr-11",
            className
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-3 flex items-center text-white/45 hover:text-white/80"
          >
            {revealed ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
