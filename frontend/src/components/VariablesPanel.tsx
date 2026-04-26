"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Eye, EyeOff, Layers, Copy, Check, AlertTriangle, Link2, FileText, Route } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";

// Extract all {{variable}} references from a request object
function extractReferencedKeys(request: any): string[] {
  const keys = new Set<string>();
  const regex = /\{\{\s*([^}\s]+)\s*\}\}/g;

  const scan = (val: any) => {
    if (typeof val === 'string') {
      let match;
      while ((match = regex.exec(val)) !== null) {
        keys.add(match[1]);
      }
    } else if (Array.isArray(val)) {
      val.forEach(scan);
    } else if (val && typeof val === 'object') {
      Object.values(val).forEach(scan);
    }
  };

  if (request) {
    scan(request.url);
    scan(request.headers);
    scan(request.params);
    scan(request.body);
    scan(request.auth);
    scan(request.rawBody);
  }

  return Array.from(keys);
}

// Extract request params (query, headers, path variables)
function extractRequestParams(request: any) {
  const queryParams = (request?.params || []).filter((p: any) => p.key);
  const headers = (request?.headers || []).filter((h: any) => h.key);
  const pathVars = (request?.pathVariables || []).filter((p: any) => p.key);
  return { queryParams, headers, pathVars };
}

export default function VariablesPanel({ 
  request,
  envVariables = [], 
  globalVariables = [], 
  activeEnvName = "No Environment",
  onClose 
}: { 
  request: any;
  envVariables: any[]; 
  globalVariables: any[];
  activeEnvName?: string;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(340);
  const [isDragging, setIsDragging] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"params" | "variables">("params");

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX - 40;
      setWidth(Math.min(Math.max(newWidth, 260), window.innerWidth - 300));
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const varLookup = useMemo(() => {
    const map = new Map<string, { value: string; source: "env" | "global" }>();
    globalVariables.filter(v => v.key && v.enabled !== false).forEach(v => {
      map.set(v.key, { value: v.value || "", source: "global" });
    });
    envVariables.filter(v => v.key && v.enabled !== false).forEach(v => {
      map.set(v.key, { value: v.value || "", source: "env" });
    });
    return map;
  }, [envVariables, globalVariables]);

  const referencedKeys = useMemo(() => extractReferencedKeys(request), [request]);

  const resolvedVars = useMemo(() => {
    return referencedKeys.map(key => {
      const found = varLookup.get(key);
      return { key, value: found?.value || "", source: found?.source || null, resolved: !!found };
    });
  }, [referencedKeys, varLookup]);

  const unresolvedCount = resolvedVars.filter(v => !v.resolved).length;

  const { queryParams, headers, pathVars } = useMemo(() => extractRequestParams(request), [request]);
  const totalParams = queryParams.length + headers.length + pathVars.length;

  const handleCopyRef = async (key: string) => {
    await copyToClipboard(`{{${key}}}`);
    setCopiedKey(key);
    toast.success(`Copied {{${key}}}`);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyValue = async (value: string) => {
    await copyToClipboard(value);
    toast.success("Copied value");
  };

  const isSecret = (key: string) => {
    const lower = key.toLowerCase();
    return lower.includes("secret") || lower.includes("password") || lower.includes("token") || lower.includes("key") || lower.includes("api_key");
  };

  return (
    <div 
      className="h-full bg-[var(--sidebar)] border-l border-[var(--border)] flex flex-col overflow-hidden flex-shrink-0 anim-slide-down"
      style={{ width: `${width}px` }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 z-10 transition-colors"
        onMouseDown={() => setIsDragging(true)}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] bg-[var(--card)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--color-brand-500)]" />
          <span className="text-xs font-bold uppercase tracking-wider">Request Info</span>
        </div>
        <button onClick={onClose} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => setActiveTab("params")}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === "params" 
              ? "text-[var(--color-brand-500)] border-b-2 border-[var(--color-brand-500)]" 
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Params {totalParams > 0 && <span className="ml-1 text-[9px] opacity-60">({totalParams})</span>}
        </button>
        <button
          onClick={() => setActiveTab("variables")}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
            activeTab === "variables" 
              ? "text-[var(--color-brand-500)] border-b-2 border-[var(--color-brand-500)]" 
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Variables {resolvedVars.length > 0 && <span className="ml-1 text-[9px] opacity-60">({resolvedVars.length})</span>}
          {unresolvedCount > 0 && <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-amber-400 rounded-full" />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "params" ? (
          <div>
            {queryParams.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] sticky top-0 z-[1]">
                  <Link2 className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Query Params</span>
                  <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{queryParams.length}</span>
                </div>
                {queryParams.map((p: any, i: number) => (
                  <ParamRow key={`qp-${i}`} param={p} onCopy={() => handleCopyValue(p.value)} />
                ))}
              </>
            )}

            {pathVars.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] sticky top-0 z-[1]">
                  <Route className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Path Variables</span>
                  <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{pathVars.length}</span>
                </div>
                {pathVars.map((p: any, i: number) => (
                  <ParamRow key={`pv-${i}`} param={p} onCopy={() => handleCopyValue(p.value)} />
                ))}
              </>
            )}

            {headers.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] sticky top-0 z-[1]">
                  <FileText className="w-3 h-3 text-sky-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Headers</span>
                  <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{headers.length}</span>
                </div>
                {headers.map((h: any, i: number) => (
                  <ParamRow key={`hdr-${i}`} param={h} onCopy={() => handleCopyValue(h.value)} />
                ))}
              </>
            )}

            {totalParams === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                <Link2 className="w-8 h-8 text-[var(--muted)] opacity-40" />
                <p className="text-xs text-[var(--muted)]">No params or headers defined</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {resolvedVars.length > 0 ? (
              <>
                {resolvedVars.filter(v => v.resolved).length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] sticky top-0 z-[1]">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Resolved</span>
                      <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{resolvedVars.filter(v => v.resolved).length}</span>
                    </div>
                    {resolvedVars.filter(v => v.resolved).map((v, i) => (
                      <VariableRow
                        key={`r-${v.key}-${i}`}
                        variable={v}
                        isSecret={isSecret(v.key)}
                        isVisible={visibleSecrets[v.key] || false}
                        isCopied={copiedKey === v.key}
                        onToggleVisibility={() => setVisibleSecrets(prev => ({ ...prev, [v.key]: !prev[v.key] }))}
                        onCopy={() => handleCopyRef(v.key)}
                      />
                    ))}
                  </>
                )}
                {unresolvedCount > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)]/50 border-b border-[var(--border)] sticky top-0 z-[1]">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Unresolved</span>
                      <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{unresolvedCount}</span>
                    </div>
                    {resolvedVars.filter(v => !v.resolved).map((v, i) => (
                      <VariableRow
                        key={`u-${v.key}-${i}`}
                        variable={v}
                        isSecret={false}
                        isVisible={true}
                        isCopied={copiedKey === v.key}
                        onToggleVisibility={() => {}}
                        onCopy={() => handleCopyRef(v.key)}
                      />
                    ))}
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                <Layers className="w-8 h-8 text-[var(--muted)] opacity-40" />
                <p className="text-xs text-[var(--muted)]">No variables used in this request</p>
                <p className="text-[10px] text-[var(--muted)] opacity-70">
                  Use <code className="bg-[var(--background)] px-1 rounded text-[var(--color-brand-500)]">{"{{variable}}"}</code> in URL, headers, or body
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex items-center justify-between shrink-0 bg-[var(--card)]/30">
        <span>{totalParams} param{totalParams !== 1 ? 's' : ''} · {resolvedVars.length} var{resolvedVars.length !== 1 ? 's' : ''}</span>
        <span className="opacity-60">{activeEnvName}</span>
      </div>
    </div>
  );
}

function ParamRow({ param, onCopy }: { param: any; onCopy: () => void }) {
  const disabled = param.enabled === false;
  return (
    <div className={`group flex items-start gap-2 px-3 py-2 border-b border-[var(--border)]/50 hover:bg-[var(--background)]/40 transition-colors ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-mono font-semibold text-[var(--foreground)] truncate">{param.key}</div>
        <div className="text-[10px] font-mono text-[var(--muted)] truncate mt-0.5" title={param.value}>
          {param.value || <span className="italic opacity-50">empty</span>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        <button onClick={onCopy} className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-colors">
          <Copy className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function VariableRow({ variable, isSecret, isVisible, isCopied, onToggleVisibility, onCopy }: {
  variable: any;
  isSecret: boolean;
  isVisible: boolean;
  isCopied: boolean;
  onToggleVisibility: () => void;
  onCopy: () => void;
}) {
  const isResolved = variable.resolved;
  const displayValue = !isResolved 
    ? "" 
    : isSecret && !isVisible 
      ? "••••••••" 
      : (variable.value || "");

  return (
    <div className="group flex items-start gap-2 px-3 py-2 border-b border-[var(--border)]/50 hover:bg-[var(--background)]/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCopy}
            className={`text-[11px] font-mono font-semibold truncate cursor-pointer hover:underline ${isResolved ? 'text-[var(--color-brand-500)]' : 'text-amber-400'}`}
            title={`Copy {{${variable.key}}}`}
          >
            {variable.key}
          </button>
          {isCopied && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
          {isResolved && variable.source && (
            <span className={`text-[8px] px-1 rounded font-semibold shrink-0 ${
              variable.source === 'env' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
            }`}>
              {variable.source === 'env' ? 'ENV' : 'GLOBAL'}
            </span>
          )}
        </div>
        <div className="text-[10px] font-mono truncate mt-0.5" title={variable.value}>
          {isResolved ? (
            <span className="text-[var(--muted)]">{displayValue || <span className="italic opacity-50">empty</span>}</span>
          ) : (
            <span className="text-amber-400/70 italic">not defined in any environment</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        {isSecret && isResolved && (
          <button onClick={onToggleVisibility} className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-colors">
            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        )}
        <button onClick={onCopy} className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-colors">
          <Copy className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
