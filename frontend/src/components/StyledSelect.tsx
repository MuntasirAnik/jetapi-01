"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
};

type StyledSelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  size?: "xs" | "sm" | "md";
  icon?: React.ReactNode;
  showCheckmark?: boolean;
  minWidth?: string;
};

export default function StyledSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className = "",
  dropdownClassName = "",
  size = "sm",
  icon,
  showCheckmark = true,
  minWidth,
}: StyledSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          } else {
            setIsOpen(!isOpen);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Escape":
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [isOpen, highlightedIndex, options, onChange, disabled]
  );

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen]);

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-1 gap-1",
    sm: "text-xs px-2.5 py-1.5 gap-1.5",
    md: "text-sm px-3 py-2 gap-2",
  };

  const dropdownItemSize = {
    xs: "text-[10px] px-2 py-1",
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-3 py-2",
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} style={minWidth ? { minWidth } : undefined}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center justify-between w-full
          bg-[var(--card)] border border-[var(--border)] rounded-md
          text-[var(--foreground)] font-medium
          outline-none transition-all duration-150
          ${isOpen ? "border-[var(--color-brand-500)] ring-2 ring-[var(--color-brand-500)]/15 shadow-[0_0_0_1px_var(--color-brand-500)]" : "hover:border-[var(--color-brand-500)]/50"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${sizeClasses[size]}
        `}
      >
        <span className="flex items-center gap-1.5 truncate">
          {icon && <span className="flex-shrink-0 opacity-70">{icon}</span>}
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <span
            className={`truncate ${!selectedOption ? "text-[var(--muted)]" : ""}`}
            style={selectedOption?.color ? { color: selectedOption.color } : undefined}
          >
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 text-[var(--muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          className={`
            absolute z-[9999] mt-1 w-full min-w-[120px]
            bg-[var(--card)] border border-[var(--border)] rounded-lg
            shadow-[0_8px_30px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.03)]
            backdrop-blur-xl overflow-hidden
            dropdown-enter
            ${dropdownClassName}
          `}
        >
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    flex items-center w-full text-left transition-colors duration-75
                    ${dropdownItemSize[size]}
                    ${
                      isSelected
                        ? "text-[var(--color-brand-500)] bg-[var(--color-brand-500)]/8 font-semibold"
                        : isHighlighted
                        ? "bg-[var(--sidebar)] text-[var(--foreground)]"
                        : "text-[var(--foreground)] hover:bg-[var(--sidebar)]"
                    }
                  `}
                >
                  {showCheckmark && (
                    <span className="w-4 flex-shrink-0 flex items-center justify-center mr-1.5">
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                  )}
                  {option.icon && <span className="flex-shrink-0 mr-1.5">{option.icon}</span>}
                  <span className="truncate" style={option.color ? { color: option.color } : undefined}>
                    {option.label}
                  </span>
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-4 text-center text-[var(--muted)] text-xs">No options available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
