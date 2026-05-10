"use client";
import { useState, useRef } from "react";
import { Play, X, CheckCircle, XCircle, Loader2, Clock, Zap, BarChart3, StopCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface RunResult {
  name: string;
  method: string;
  url: string;
  status: number | null;
  timeMs: number;
  passed: boolean;
  error?: string;
}

export default function BulkRunnerModal({ 
  collectionName, 
  requests, 
  envVariables = [],
  onClose 
}: { 
  collectionName: string; 
  requests: any[]; 
  envVariables?: any[];
  onClose: () => void;
}) {
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const interpolate = (str: string): string => {
    if (!str) return str;
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
      const v = envVariables.find((e: any) => e.key === key.trim());
      return v?.value || `{{${key}}}`;
    });
  };

  const runAll = async () => {
    setRunning(true);
    setDone(false);
    setResults([]);
    abortRef.current = false;

    for (let i = 0; i < requests.length; i++) {
      if (abortRef.current) break;
      setCurrentIndex(i);
      const req = requests[i];

      try {
        const url = interpolate(req.url || "");
        const headers: any = {};
        if (Array.isArray(req.headers)) {
          req.headers.forEach((h: any) => {
            if (h.enabled !== false && h.key) headers[interpolate(h.key)] = interpolate(h.value || "");
          });
        }

        let body: any = undefined;
        if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
          try { body = JSON.parse(interpolate(req.body)); } catch { body = interpolate(req.body); }
        }

        const payload = { method: req.method || "GET", url, body, headers, params: {} };

        const res = await apiFetch("/proxy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        const passed = data.status >= 200 && data.status < 400;

        setResults(prev => [...prev, {
          name: req.name || "Untitled",
          method: req.method || "GET",
          url: req.url || "",
          status: data.status || null,
          timeMs: data.timeMs || 0,
          passed,
        }]);
      } catch (err: any) {
        setResults(prev => [...prev, {
          name: req.name || "Untitled",
          method: req.method || "GET",
          url: req.url || "",
          status: null,
          timeMs: 0,
          passed: false,
          error: err.message,
        }]);
      }
    }

    setRunning(false);
    setDone(true);
    setCurrentIndex(-1);
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((a, b) => a + b.timeMs, 0);
  const avgTime = results.length ? Math.round(totalTime / results.length) : 0;

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "text-green-500 bg-green-500/10";
      case "POST": return "text-orange-500 bg-orange-500/10";
      case "PUT": return "text-blue-500 bg-blue-500/10";
      case "DELETE": return "text-red-500 bg-red-500/10";
      case "PATCH": return "text-yellow-500 bg-yellow-500/10";
      default: return "text-[var(--muted)] bg-[var(--card)]";
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_16px_60px_rgba(0,0,0,0.5)] w-full max-w-2xl flex flex-col max-h-[85vh] modal-content">
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-[var(--border)]/50 bg-[var(--sidebar)]/50 rounded-t-xl">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Play className="w-4 h-4 text-[var(--color-brand-500)]" /> Collection Runner
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">{collectionName} • {requests.length} requests</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-500)] text-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Bar */}
        {results.length > 0 && (
          <div className="px-5 py-3 border-b border-[var(--border)]/50 bg-[var(--background)]/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-bold text-green-500">{passedCount}</span>
                <span className="text-[10px] text-[var(--muted)]">passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-bold text-red-500">{failedCount}</span>
                <span className="text-[10px] text-[var(--muted)]">failed</span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Clock className="w-3 h-3 text-[var(--muted)]" />
                <span className="text-[10px] text-[var(--muted)]">{totalTime}ms total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[var(--muted)]" />
                <span className="text-[10px] text-[var(--muted)]">{avgTime}ms avg</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-[var(--border)]">
              {passedCount > 0 && <div className="bg-green-500 transition-all duration-300" style={{ width: `${(passedCount / requests.length) * 100}%` }} />}
              {failedCount > 0 && <div className="bg-red-500 transition-all duration-300" style={{ width: `${(failedCount / requests.length) * 100}%` }} />}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {!running && !done && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-[var(--muted)]">
              <BarChart3 className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">Ready to run {requests.length} requests</p>
                <p className="text-[11px] opacity-60 mt-1">Requests will be executed sequentially</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {requests.map((req, i) => {
              const result = results[i];
              const isCurrent = currentIndex === i;

              return (
                <div
                  key={req.id || i}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                    isCurrent ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/5" :
                    result?.passed ? "border-green-500/20 bg-green-500/5" :
                    result && !result.passed ? "border-red-500/20 bg-red-500/5" :
                    "border-[var(--border)]/50 bg-[var(--background)]/30"
                  }`}
                >
                  {/* Status */}
                  <div className="w-5 shrink-0 flex justify-center">
                    {isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-brand-500)]" />
                    ) : result?.passed ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : result && !result.passed ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border-2 border-[var(--border)]" />
                    )}
                  </div>

                  {/* Method */}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${getMethodColor(req.method || "GET")}`}>
                    {req.method || "GET"}
                  </span>

                  {/* Name */}
                  <span className="text-xs font-medium truncate flex-1">{req.name || "Untitled"}</span>

                  {/* Result details */}
                  {result && (
                    <div className="flex items-center gap-2 shrink-0">
                      {result.status && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          result.status < 300 ? "text-green-500 bg-green-500/10" :
                          result.status < 400 ? "text-blue-500 bg-blue-500/10" :
                          "text-red-500 bg-red-500/10"
                        }`}>
                          {result.status}
                        </span>
                      )}
                      {result.error && (
                        <span className="text-[10px] text-red-500 truncate max-w-[100px]">{result.error}</span>
                      )}
                      <span className="text-[10px] text-[var(--muted)] font-mono">{result.timeMs}ms</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]/50 bg-[var(--sidebar)]/50 flex items-center gap-3 rounded-b-xl">
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              <StopCircle className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button
              onClick={runAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white text-sm font-bold rounded-lg shadow-lg hover:shadow-xl transition-all"
            >
              <Play className="w-4 h-4" /> {done ? "Run Again" : "Run All"}
            </button>
          )}
          <span className="text-[10px] text-[var(--muted)] ml-auto">
            {running ? `Running ${currentIndex + 1}/${requests.length}...` : done ? `Completed in ${totalTime}ms` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
