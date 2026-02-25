// src/components/CustomDropdown.tsx
import { useState, useRef, useEffect } from "react";

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  badge?: string | number;
}

interface CustomDropdownProps<T = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "pill";
  className?: string;
  disabled?: boolean;
}

export function CustomDropdown<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = "Selecionar",
  label,
  size = "md",
  variant = "default",
  className = "",
  disabled = false,
}: CustomDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sizeClasses = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-5 text-base gap-2.5",
  };

  const iconSize = { sm: 12, md: 14, lg: 16 };

  const variantClasses = {
    default: "bg-[#141414] border border-white/10 hover:border-white/20 text-white",
    ghost: "bg-transparent border border-transparent hover:border-white/10 text-white/80 hover:text-white",
    pill: "bg-white/5 border border-white/10 hover:border-purple-500/50 text-white rounded-full",
  };

  return (
    <div ref={ref} className={`relative select-none ${className}`}>
      {label && (
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-1.5 pl-0.5">
          {label}
        </p>
      )}

      {/* Trigger */}
      <button
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className={[
          "flex items-center justify-between w-full rounded-lg transition-all duration-200",
          sizeClasses[size],
          variantClasses[variant],
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
          open ? "border-purple-500/60 ring-1 ring-purple-500/20" : "",
        ].join(" ")}
      >
        <span className={selected ? "text-white" : "text-white/40"}>
          {selected ? selected.label : placeholder}
        </span>

        <span
          className="text-white/40 flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronIcon size={iconSize[size]} />
        </span>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className="absolute z-50 w-full mt-1.5 rounded-lg overflow-hidden shadow-2xl"
          style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "dropdownIn 0.15s ease",
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const isDisabled = opt.disabled;

            return (
              <button
                key={String(opt.value)}
                onClick={() => {
                  if (!isDisabled) {
                    onChange(opt.value as T);
                    setOpen(false);
                  }
                }}
                disabled={isDisabled}
                className={[
                  "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors duration-100",
                  isSelected
                    ? "bg-purple-600/20 text-purple-300"
                    : isDisabled
                    ? "text-white/20 cursor-not-allowed"
                    : "text-white/80 hover:bg-white/5 hover:text-white cursor-pointer",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-1 h-1 rounded-full flex-shrink-0 ${
                      isSelected ? "bg-purple-400" : "bg-transparent"
                    }`}
                  />
                  {opt.label}
                </span>

                {opt.badge !== undefined && (
                  <span
                    className={[
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                      isDisabled ? "bg-white/5 text-white/20" : "bg-white/10 text-white/50",
                    ].join(" ")}
                  >
                    {opt.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function ChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default CustomDropdown;
