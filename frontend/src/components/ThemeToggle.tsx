"use client";
import { useEffect, useState, useRef } from "react";
import { Palette, Check } from "lucide-react";

const THEMES = [
  {
    id: "dark",
    label: "Midnight",
    description: "Classic dark",
    colors: ["#212121", "#2b2b2b", "#3b3b3b", "#ff6c37"],
  },
  {
    id: "light",
    label: "Daylight",
    description: "Clean & crisp",
    colors: ["#fafbfc", "#f0f2f5", "#dfe3e8", "#ff6c37"],
  },
  {
    id: "nord",
    label: "Nord",
    description: "Arctic blue",
    colors: ["#242933", "#2c3341", "#3b4252", "#88c0d0"],
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Warm amber",
    colors: ["#00212b", "#002b36", "#094d5c", "#b58900"],
  },
  {
    id: "rose",
    label: "Rosé Pine",
    description: "Soft blush",
    colors: ["#141020", "#1a1529", "#2a2440", "#eb6f92"],
  },
  {
    id: "ocean",
    label: "Deep Ocean",
    description: "Navy depths",
    colors: ["#0a1628", "#0f1e35", "#1c3050", "#38bdf8"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Earthy green",
    colors: ["#1a2019", "#232d22", "#3a4a38", "#7fb069"],
  },
  {
    id: "mocha",
    label: "Mocha",
    description: "Coffee tones",
    colors: ["#1e1e2e", "#302d41", "#45475a", "#f5c2e7"],
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Purple night",
    colors: ["#1a1c2b", "#21233a", "#343650", "#bd93f9"],
  },
  {
    id: "tokyo",
    label: "Tokyo Night",
    description: "Neon city",
    colors: ["#16161e", "#1a1b26", "#292e42", "#7aa2f7"],
  },
] as const;

const ACCENT_COLORS = [
  { id: "orange",  label: "Tangerine",  color500: "#ff6c37", color600: "#e85d2b" },
  { id: "blue",    label: "Sapphire",   color500: "#3b82f6", color600: "#2563eb" },
  { id: "indigo",  label: "Indigo",     color500: "#6366f1", color600: "#4f46e5" },
  { id: "violet",  label: "Violet",     color500: "#8b5cf6", color600: "#7c3aed" },
  { id: "pink",    label: "Rose",       color500: "#ec4899", color600: "#db2777" },
  { id: "red",     label: "Ruby",       color500: "#ef4444", color600: "#dc2626" },
  { id: "emerald", label: "Emerald",    color500: "#10b981", color600: "#059669" },
  { id: "teal",    label: "Teal",       color500: "#14b8a6", color600: "#0d9488" },
  { id: "cyan",    label: "Cyan",       color500: "#06b6d4", color600: "#0891b2" },
  { id: "amber",   label: "Amber",      color500: "#f59e0b", color600: "#d97706" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type AccentId = (typeof ACCENT_COLORS)[number]["id"];

function applyAccent(accent: typeof ACCENT_COLORS[number]) {
  document.documentElement.style.setProperty("--color-brand-500", accent.color500);
  document.documentElement.style.setProperty("--color-brand-600", accent.color600);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [accent, setAccent] = useState<AccentId>("orange");
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem("app-theme") || "dark") as ThemeId;
    setTheme(stored);
    document.documentElement.setAttribute("data-theme", stored);

    const storedAccent = (localStorage.getItem("app-accent") || "orange") as AccentId;
    setAccent(storedAccent);
    const accentObj = ACCENT_COLORS.find(a => a.id === storedAccent) || ACCENT_COLORS[0];
    applyAccent(accentObj);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectTheme = (id: ThemeId) => {
    setTheme(id);
    localStorage.setItem("app-theme", id);
    document.documentElement.setAttribute("data-theme", id);
    // Re-apply accent after theme change
    const accentObj = ACCENT_COLORS.find(a => a.id === accent) || ACCENT_COLORS[0];
    applyAccent(accentObj);
    setIsOpen(false);
  };

  const selectAccent = (id: AccentId) => {
    setAccent(id);
    localStorage.setItem("app-accent", id);
    const accentObj = ACCENT_COLORS.find(a => a.id === id) || ACCENT_COLORS[0];
    applyAccent(accentObj);
  };

  if (!mounted) return null;

  const activeTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-7 h-7 text-[var(--muted)] hover:text-[var(--foreground)] rounded hover:bg-[var(--sidebar)] transition-colors focus:outline-none"
        title="Change theme"
      >
        <Palette className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.35)] z-[99999] overflow-hidden dropdown-enter">
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--sidebar)]/50">
            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              Appearance
            </span>
          </div>

          {/* Accent Color Section */}
          <div className="px-3.5 pt-3 pb-2">
            <span className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
              Accent Color
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {ACCENT_COLORS.map((a) => {
                const isActive = accent === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => selectAccent(a.id)}
                    className={`group relative w-6 h-6 rounded-full transition-all duration-150 ${
                      isActive 
                        ? "ring-2 ring-offset-2 ring-offset-[var(--card)] scale-110" 
                        : "hover:scale-110"
                    }`}
                    style={{
                      backgroundColor: a.color500,
                      ...(isActive ? { ringColor: a.color500 } : {}),
                    }}
                    title={a.label}
                  >
                    {isActive && (
                      <Check className="w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 border-b border-[var(--border)]" />

          {/* Theme Section */}
          <div className="px-3.5 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
              Theme
            </span>
          </div>

          {/* Theme list */}
          <div className="p-1.5 pt-1 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTheme(t.id)}
                  className={`group flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${
                    isActive
                      ? "bg-[var(--color-brand-500)]/10"
                      : "hover:bg-[var(--sidebar)]"
                  }`}
                >
                  {/* Color swatch orbs */}
                  <div className="flex -space-x-1.5 shrink-0">
                    {t.colors.map((color, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full border border-[var(--border)]"
                        style={{
                          backgroundColor: i === 3 ? `var(--color-brand-500)` : color,
                          zIndex: 4 - i,
                        }}
                      />
                    ))}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium ${
                        isActive
                          ? "text-[var(--color-brand-500)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {t.label}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] leading-tight">
                      {t.description}
                    </p>
                  </div>

                  {/* Check */}
                  {isActive && (
                    <Check className="w-3.5 h-3.5 text-[var(--color-brand-500)] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
