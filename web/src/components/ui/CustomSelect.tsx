import { useEffect, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "../../lib/cn.js";

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  id?: string;
}

export function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  required,
  error,
  id
}: CustomSelectProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(options.findIndex((o) => o.value === value), 0));
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      const index = Math.max(options.findIndex((o) => o.value === value), 0);
      setActiveIndex(index);
      requestAnimationFrame(() => {
        const activeEl = listRef.current?.children[index] as HTMLElement | undefined;
        activeEl?.scrollIntoView({ block: "nearest" });
      });
    }
  }, [open]);

  function commit(index: number) {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    }
  }

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <label id={`${fieldId}-label`} className="text-sm font-medium text-white/85">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          id={fieldId}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${fieldId}-listbox`}
          aria-labelledby={`${fieldId}-label`}
          aria-required={required}
          aria-invalid={Boolean(error)}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border bg-white/5 px-4 py-3 text-left text-sm text-white",
            "focus:outline-none focus:ring-2 focus:ring-indigo-400/60",
            error ? "border-red-400/60" : "border-white/15"
          )}
        >
          <span className={selected ? "text-white" : "text-white/35"}>
            {selected ? selected.label : placeholder}
          </span>
          <CaretDown size={16} className={cn("shrink-0 text-white/50 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <ul
            ref={listRef}
            id={`${fieldId}-listbox`}
            role="listbox"
            aria-labelledby={`${fieldId}-label`}
            tabIndex={-1}
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/15 bg-midnight-800 p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm",
                    isActive ? "bg-white/10 text-white" : "text-white/75",
                    isSelected && "text-festival-gold"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={14} weight="bold" className="shrink-0" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
