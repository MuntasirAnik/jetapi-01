"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { Search, ArrowRight, FileText, Folder, Server, Moon, Sun, Keyboard, X, Globe, Clock, BarChart3, Activity as ActivityIcon, Zap } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  keywords?: string;
}

export default function CommandPalette({
  isOpen,
  onClose,
  workspaces = [],
  onSelectRequest,
  onSwitchTab,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaces: any[];
  onSelectRequest: (req: any) => void;
  onSwitchTab?: (tab: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "text-green-500";
      case "POST": return "text-orange-500";
      case "PUT": return "text-blue-500";
      case "DELETE": return "text-red-500";
      case "PATCH": return "text-yellow-500";
      default: return "text-[var(--muted)]";
    }
  };

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // All requests from all collections
    workspaces.forEach((ws: any) => {
      (ws.collections || []).forEach((col: any) => {
        (col.requests || []).forEach((req: any) => {
          items.push({
            id: `req-${req.id}`,
            label: req.name || "Untitled",
            description: `${col.name} • ${req.method || "GET"} ${req.url || ""}`,
            icon: <span className={`text-[10px] font-bold ${getMethodColor(req.method || "GET")}`}>{req.method || "GET"}</span>,
            category: "Requests",
            action: () => { onSelectRequest(req); onClose(); },
            keywords: `${req.name} ${req.method} ${req.url} ${col.name}`,
          });
        });
      });
    });

    // Navigation
    const navItems = [
      { id: "nav-collections", label: "Go to Collections", icon: <Folder className="w-4 h-4" />, tab: "collections" },
      { id: "nav-environments", label: "Go to Environments", icon: <Server className="w-4 h-4" />, tab: "environments" },
      { id: "nav-history", label: "Go to History", icon: <Clock className="w-4 h-4" />, tab: "history" },
      { id: "nav-analytics", label: "Go to Analytics", icon: <BarChart3 className="w-4 h-4" />, tab: "analytics" },
      { id: "nav-activity", label: "Go to Activity", icon: <ActivityIcon className="w-4 h-4" />, tab: "activity" },
    ];
    navItems.forEach(nav => {
      items.push({
        id: nav.id,
        label: nav.label,
        icon: nav.icon,
        category: "Navigation",
        action: () => { onSwitchTab?.(nav.tab); onClose(); },
      });
    });

    // Actions
    items.push({
      id: "action-theme",
      label: "Cycle Theme",
      description: "Switch to next theme",
      icon: <Moon className="w-4 h-4" />,
      category: "Actions",
      action: () => {
        const html = document.documentElement;
        const themes = ["dark", "light", "nord", "solarized", "rose", "ocean", "forest", "mocha", "dracula", "tokyo"];
        const current = html.getAttribute("data-theme") || "dark";
        const idx = themes.indexOf(current);
        const next = themes[(idx + 1) % themes.length];
        html.setAttribute("data-theme", next);
        localStorage.setItem("app-theme", next);
        onClose();
      },
      keywords: "dark light mode theme toggle nord solarized rose ocean forest mocha",
    });

    items.push({
      id: "action-shortcuts",
      label: "Keyboard Shortcuts",
      description: "View all keyboard shortcuts",
      icon: <Keyboard className="w-4 h-4" />,
      category: "Actions",
      action: () => { onClose(); },
      keywords: "keyboard shortcuts hotkeys",
    });

    return items;
  }, [workspaces, onSelectRequest, onClose, onSwitchTab]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => {
      const searchStr = `${cmd.label} ${cmd.description || ""} ${cmd.keywords || ""} ${cmd.category}`.toLowerCase();
      return searchStr.includes(q);
    });
  }, [query, commands]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filtered.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filtered]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, filtered, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_20px_80px_rgba(0,0,0,0.5)] overflow-hidden modal-content"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-5 h-5 text-[var(--muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search requests, navigate, or run actions..."
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--muted)] outline-none"
          />
          <kbd className="text-[10px] text-[var(--muted)] bg-[var(--background)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[var(--muted)]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">No results found</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{category}</span>
                </div>
                {items.map(item => {
                  flatIndex++;
                  const idx = flatIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 w-full px-4 py-2 text-left transition-colors ${
                        selectedIndex === idx ? "bg-[var(--color-brand-500)]/10 text-[var(--foreground)]" : "text-[var(--foreground)] hover:bg-[var(--sidebar)]"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.label}</p>
                        {item.description && (
                          <p className="text-[10px] text-[var(--muted)] truncate">{item.description}</p>
                        )}
                      </div>
                      {selectedIndex === idx && (
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--color-brand-500)] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--sidebar)]/50 flex items-center gap-4 text-[10px] text-[var(--muted)]">
          <span className="flex items-center gap-1"><kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono">↵</kbd> Select</span>
          <span className="flex items-center gap-1"><kbd className="bg-[var(--background)] border border-[var(--border)] px-1 rounded font-mono">esc</kbd> Close</span>
          <span className="ml-auto flex items-center gap-1"><Zap className="w-3 h-3" /> {filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
