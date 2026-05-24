"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Keyboard } from "lucide-react";

const shortcuts = [
  { category: "General", items: [
    { keys: ["⌘", "K"], label: "Open Command Palette" },
    { keys: ["⌘", "S"], label: "Save Current Request" },
    { keys: ["⌘", "N"], label: "New Request Tab" },
    { keys: ["⌘", "W"], label: "Close Active Tab" },
    { keys: ["⌘", "Enter"], label: "Send Request" },
    { keys: ["⌘", "⇧", "K"], label: "Keyboard Shortcuts" },
  ]},
  { category: "Navigation", items: [
    { keys: ["⌘", "1-9"], label: "Switch to Tab #" },
    { keys: ["⌘", "["], label: "Previous Tab" },
    { keys: ["⌘", "]"], label: "Next Tab" },
  ]},
  { category: "Editor", items: [
    { keys: ["⌘", "F"], label: "Search in Response" },
    { keys: ["⌘", "L"], label: "Focus URL Bar" },
    { keys: ["⌘", "⇧", "C"], label: "Copy Response" },
  ]},
  { category: "Sidebar", items: [
    { keys: ["⌘", "B"], label: "Toggle Sidebar" },
    { keys: ["⌘", "E"], label: "Environments" },
  ]},
];

export default function KeyboardShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return shortcuts;
    const q = search.toLowerCase();
    return shortcuts.map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        item.label.toLowerCase().includes(q) || item.keys.join(" ").toLowerCase().includes(q)
      ),
    })).filter(cat => cat.items.length > 0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_20px_80px_rgba(0,0,0,0.5)] overflow-hidden modal-content"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-500)]/10 border border-[var(--color-brand-500)]/20 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-[var(--color-brand-500)]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--foreground)]">Keyboard Shortcuts</h2>
              <p className="text-[10px] text-[var(--muted)]">Navigate JetAPI faster with shortcuts</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors cursor-pointer">
            <X className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-2 border-b border-[var(--border)]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search shortcuts..."
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--foreground)] placeholder-[var(--muted)] outline-none focus:border-[var(--color-brand-500)] transition-colors"
            autoFocus
          />
        </div>

        {/* Shortcuts List */}
        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar px-5 py-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[var(--muted)] text-xs">No shortcuts found</div>
          ) : (
            filtered.map(cat => (
              <div key={cat.category} className="mb-4 last:mb-0">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">{cat.category}</h3>
                <div className="space-y-1">
                  {cat.items.map(item => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[var(--sidebar)] transition-colors">
                      <span className="text-xs text-[var(--foreground)]">{item.label}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key, i) => (
                          <kbd
                            key={i}
                            className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[10px] font-mono font-medium bg-[var(--background)] border border-[var(--border)] rounded text-[var(--muted)] shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--sidebar)]/50 text-[10px] text-[var(--muted)] text-center">
          Press <kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono mx-0.5">⌘</kbd>
          <kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono mx-0.5">⇧</kbd>
          <kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono mx-0.5">K</kbd>
          to toggle this panel
        </div>
      </div>
    </div>
  );
}
