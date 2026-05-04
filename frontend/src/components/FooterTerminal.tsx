"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, ChevronUp, ChevronDown, Trash2, X, Copy, Check, Trash } from "lucide-react";
import { useRouter } from "next/navigation";

export type LogEntry = {
  id: string;
  timestamp: Date;
  type: "request" | "response" | "error" | "info";
  method?: string;
  url?: string;
  status?: number;
  duration?: number;
  message?: string;
};

// Global log store so other components can push logs
let globalLogs: LogEntry[] = [];
let listeners: (() => void)[] = [];

export function pushLog(entry: Omit<LogEntry, "id" | "timestamp">) {
  const log: LogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(),
  };
  globalLogs = [...globalLogs, log].slice(-200); // keep last 200
  listeners.forEach((fn) => fn());
}

export function clearLogs() {
  globalLogs = [];
  listeners.forEach((fn) => fn());
}

function useLogStore() {
  const [logs, setLogs] = useState<LogEntry[]>(globalLogs);
  useEffect(() => {
    const listener = () => setLogs([...globalLogs]);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);
  return logs;
}

export default function FooterTerminal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(220);
  const [copied, setCopied] = useState(false);
  const logs = useLogStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, isOpen]);

  // Resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setPanelHeight(Math.max(120, Math.min(500, dragRef.current.startHeight + delta)));
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelHeight]);

  const handleCopyAll = () => {
    const text = logs.map(l => {
      const ts = l.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (l.type === "request") return `[${ts}] → ${l.method} ${l.url}`;
      if (l.type === "response") return `[${ts}] ← ${l.status} ${l.url} (${l.duration}ms)`;
      if (l.type === "error") return `[${ts}] ✕ ${l.message}`;
      return `[${ts}] ${l.message}`;
    }).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getMethodColor = (method?: string) => {
    switch (method) {
      case "GET": return "text-green-400";
      case "POST": return "text-orange-400";
      case "PUT": return "text-blue-400";
      case "PATCH": return "text-yellow-400";
      case "DELETE": return "text-red-400";
      default: return "text-[var(--muted)]";
    }
  };

  const getStatusColor = (status?: number) => {
    if (!status) return "text-[var(--muted)]";
    if (status < 300) return "text-green-400";
    if (status < 400) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="shrink-0 flex flex-col">
      {/* Console Panel */}
      {isOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--sidebar)] flex flex-col anim-slide-up" style={{ height: panelHeight }}>
          {/* Resize handle */}
          <div
            className="h-1 cursor-ns-resize hover:bg-[var(--color-brand-500)]/40 transition-colors shrink-0"
            onMouseDown={handleMouseDown}
          />
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-[var(--color-brand-500)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Console</span>
              <span className="text-[10px] text-[var(--muted)]/60 font-mono">{logs.length} entries</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={handleCopyAll} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors" title="Copy all">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <button onClick={() => clearLogs()} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors" title="Clear">
                <Trash2 className="w-3 h-3" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors" title="Close">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* Log output */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed px-3 py-1.5 select-text">
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--muted)]/40 text-xs">
                No logs yet. Make an API request to see output here.
              </div>
            ) : (
              logs.map((log) => {
                const ts = log.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <div key={log.id} className="flex items-start gap-2 py-px hover:bg-[var(--border)]/30 rounded px-1 -mx-1">
                    <span className="text-[var(--muted)]/40 shrink-0 tabular-nums">{ts}</span>
                    {log.type === "request" && (
                      <>
                        <span className="text-[var(--muted)]/50 shrink-0">→</span>
                        <span className={`font-bold shrink-0 ${getMethodColor(log.method)}`}>{log.method}</span>
                        <span className="text-[var(--foreground)]/70 truncate">{log.url}</span>
                      </>
                    )}
                    {log.type === "response" && (
                      <>
                        <span className="text-[var(--muted)]/50 shrink-0">←</span>
                        <span className={`font-bold shrink-0 ${getStatusColor(log.status)}`}>{log.status}</span>
                        <span className="text-[var(--foreground)]/70 truncate">{log.url}</span>
                        {log.duration != null && (
                          <span className="text-[var(--muted)]/50 shrink-0 ml-auto">{log.duration}ms</span>
                        )}
                      </>
                    )}
                    {log.type === "error" && (
                      <>
                        <span className="text-red-500 shrink-0">✕</span>
                        <span className="text-red-400">{log.message}</span>
                      </>
                    )}
                    {log.type === "info" && (
                      <>
                        <span className="text-blue-400/50 shrink-0">ℹ</span>
                        <span className="text-[var(--foreground)]/60">{log.message}</span>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Footer Bar */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--sidebar)]/50 px-4 py-1 flex items-center gap-3 relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${isOpen ? "text-[var(--color-brand-500)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
        >
          <Terminal className="w-3 h-3" />
          Console
          {logs.length > 0 && (
            <span className="bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)] text-[9px] font-bold px-1.5 rounded-full">{logs.length}</span>
          )}
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-[var(--muted)] font-medium tracking-wide pointer-events-none">
          © {new Date().getFullYear()} Muntasir Anik
        </span>

        <button
          onClick={() => router.push("/trash")}
          className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors ml-auto"
        >
          <Trash className="w-3 h-3" />
          Trash
        </button>
      </div>
    </div>
  );
}
