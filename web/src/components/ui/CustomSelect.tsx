import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

const DROPDOWN_MAX_HEIGHT = 256;
const VIEWPORT_MARGIN = 8;

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
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  function computePosition(): DropdownPosition | null {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openUpward = spaceBelow < Math.min(DROPDOWN_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;
    return {
      top: openUpward ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      openUpward
    };
  }

  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, []);

  useEffect(() => {
    if (!open) return;

    setPosition(computePosition());
    const index = Math.max(options.findIndex((o) => o.value === value), 0);
    setActiveIndex(index);
    requestAnimationFrame(() => {
      const activeEl = listRef.current?.children[index] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: "nearest" });
    });

    function reposition() {
      setPosition(computePosition());
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          ref={triggerRef}
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

        {open &&
          position &&
          createPortal(
            <ul
              ref={listRef}
              id={`${fieldId}-listbox`}
              role="listbox"
              aria-labelledby={`${fieldId}-label`}
              tabIndex={-1}
              style={{
                position: "fixed",
                left: position.left,
                width: position.width,
                top: position.openUpward ? undefined : position.top + 8,
                bottom: position.openUpward ? window.innerHeight - position.top + 8 : undefined,
                maxHeight: DROPDOWN_MAX_HEIGHT
              }}
              className="z-50 overflow-y-auto rounded-xl border border-white/15 bg-midnight-800 p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
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
            </ul>,
            document.body
          )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
