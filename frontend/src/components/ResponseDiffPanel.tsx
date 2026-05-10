"use client";
import { useState, useEffect, useMemo } from "react";
import { X, ArrowLeftRight, Copy, Check, ChevronDown, Trash2 } from "lucide-react";

interface SavedResponse {
  id: string;
  label: string;
  timestamp: string;
  status: number;
  body: string;
  headers: any;
  timeMs: number;
}

function diffLines(a: string, b: string): { left: DiffLine[]; right: DiffLine[] } {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  // Simple LCS-based diff
  const maxLen = Math.max(aLines.length, bLines.length);
  
  // Build a mapping
  let ai = 0, bi = 0;
  while (ai < aLines.length || bi < bLines.length) {
    if (ai < aLines.length && bi < bLines.length && aLines[ai] === bLines[bi]) {
      left.push({ text: aLines[ai], type: 'same' });
      right.push({ text: bLines[bi], type: 'same' });
      ai++; bi++;
    } else if (ai < aLines.length && bi < bLines.length) {
      left.push({ text: aLines[ai], type: 'removed' });
      right.push({ text: bLines[bi], type: 'added' });
      ai++; bi++;
    } else if (ai < aLines.length) {
      left.push({ text: aLines[ai], type: 'removed' });
      right.push({ text: '', type: 'empty' });
      ai++;
    } else {
      left.push({ text: '', type: 'empty' });
      right.push({ text: bLines[bi], type: 'added' });
      bi++;
    }
  }

  return { left, right };
}

interface DiffLine {
  text: string;
  type: 'same' | 'added' | 'removed' | 'empty';
}

export default function ResponseDiffPanel({ onClose }: { onClose: () => void }) {
  const [responses, setResponses] = useState<SavedResponse[]>([]);
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [panelWidth, setPanelWidth] = useState(500);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("jetapi_saved_responses");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setResponses(parsed);
        if (parsed.length >= 2) {
          setLeftId(parsed[1].id);
          setRightId(parsed[0].id);
        } else if (parsed.length === 1) {
          setLeftId(parsed[0].id);
        }
      } catch {}
    }
  }, []);

  const leftResp = responses.find(r => r.id === leftId);
  const rightResp = responses.find(r => r.id === rightId);

  const diff = useMemo(() => {
    if (!leftResp || !rightResp) return null;
    const leftBody = tryPrettyJson(leftResp.body);
    const rightBody = tryPrettyJson(rightResp.body);
    return diffLines(leftBody, rightBody);
  }, [leftResp, rightResp]);

  const handleCopy = (text: string, side: string) => {
    navigator.clipboard.writeText(text);
    setCopied(side);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDelete = (id: string) => {
    const updated = responses.filter(r => r.id !== id);
    setResponses(updated);
    localStorage.setItem("jetapi_saved_responses", JSON.stringify(updated));
    if (leftId === id) setLeftId("");
    if (rightId === id) setRightId("");
  };

  const handleDrag = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.max(400, Math.min(900, startW + (startX - ev.clientX))));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="h-full border-l border-[var(--border)] bg-[var(--sidebar)] flex flex-col overflow-hidden shrink-0 relative panel-slide-right"
      style={{ width: panelWidth }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-brand-500)] z-10 transition-colors" onMouseDown={handleDrag} />

      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
        <ArrowLeftRight className="w-4 h-4 text-[var(--color-brand-500)]" />
        <span className="text-xs font-semibold">Response Diff</span>
        <span className="text-[10px] text-[var(--muted)] font-mono ml-1">{responses.length} saved</span>
        <button onClick={onClose} className="ml-auto p-1 hover:bg-[var(--card)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selectors */}
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]/50 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1 block">Left (Old)</label>
            <select
              value={leftId}
              onChange={e => setLeftId(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1.5 text-[10px] text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)]"
            >
              <option value="">Select response...</option>
              {responses.map(r => (
                <option key={r.id} value={r.id}>{r.label} ({r.status}) - {new Date(r.timestamp).toLocaleTimeString()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1 block">Right (New)</label>
            <select
              value={rightId}
              onChange={e => setRightId(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1.5 text-[10px] text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)]"
            >
              <option value="">Select response...</option>
              {responses.map(r => (
                <option key={r.id} value={r.id}>{r.label} ({r.status}) - {new Date(r.timestamp).toLocaleTimeString()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {!leftResp || !rightResp ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted)] gap-2 p-4">
            <ArrowLeftRight className="w-10 h-10 opacity-20" />
            <p className="text-xs font-medium">Select two responses to compare</p>
            <p className="text-[10px] opacity-60 text-center max-w-[220px]">
              Save responses by clicking the bookmark icon in the response panel, then compare them here.
            </p>
          </div>
        ) : diff ? (
          <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
            {/* Left column */}
            <div className="relative group/col">
              <div className="sticky top-0 z-10 px-2 py-1 bg-[var(--sidebar)] border-b border-[var(--border)] flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${leftResp.status < 300 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>{leftResp.status}</span>
                <span className="text-[10px] truncate text-[var(--muted)]">{leftResp.label}</span>
                <button onClick={() => handleCopy(tryPrettyJson(leftResp.body), 'left')} className="ml-auto p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]">
                  {copied === 'left' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <pre className="text-[10px] font-mono p-2 leading-[18px]">
                {diff.left.map((line, i) => (
                  <div
                    key={i}
                    className={`px-1 rounded-sm ${
                      line.type === 'removed' ? 'bg-red-500/15 text-red-400' :
                      line.type === 'empty' ? 'opacity-20' :
                      'text-[var(--foreground)]'
                    }`}
                  >
                    <span className="inline-block w-6 text-right mr-2 opacity-30 select-none">{line.type !== 'empty' ? i + 1 : ''}</span>
                    {line.type === 'removed' && <span className="mr-1 text-red-500">-</span>}
                    {line.text}
                  </div>
                ))}
              </pre>
            </div>
            {/* Right column */}
            <div className="relative group/col">
              <div className="sticky top-0 z-10 px-2 py-1 bg-[var(--sidebar)] border-b border-[var(--border)] flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rightResp.status < 300 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>{rightResp.status}</span>
                <span className="text-[10px] truncate text-[var(--muted)]">{rightResp.label}</span>
                <button onClick={() => handleCopy(tryPrettyJson(rightResp.body), 'right')} className="ml-auto p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]">
                  {copied === 'right' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <pre className="text-[10px] font-mono p-2 leading-[18px]">
                {diff.right.map((line, i) => (
                  <div
                    key={i}
                    className={`px-1 rounded-sm ${
                      line.type === 'added' ? 'bg-green-500/15 text-green-400' :
                      line.type === 'empty' ? 'opacity-20' :
                      'text-[var(--foreground)]'
                    }`}
                  >
                    <span className="inline-block w-6 text-right mr-2 opacity-30 select-none">{line.type !== 'empty' ? i + 1 : ''}</span>
                    {line.type === 'added' && <span className="mr-1 text-green-500">+</span>}
                    {line.text}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        ) : null}
      </div>

      {/* Saved responses list */}
      {responses.length > 0 && (
        <div className="border-t border-[var(--border)] max-h-32 overflow-y-auto custom-scrollbar">
          <div className="px-2 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Saved Responses</span>
          </div>
          {responses.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--card)] rounded text-[10px] group">
              <span className={`font-bold px-1 rounded ${r.status < 300 ? 'text-green-500' : r.status < 400 ? 'text-blue-500' : 'text-red-500'}`}>{r.status}</span>
              <span className="truncate flex-1 text-[var(--muted)]">{r.label}</span>
              <span className="text-[9px] text-[var(--muted)] opacity-50">{r.timeMs}ms</span>
              <button onClick={() => handleDelete(r.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--muted)] hover:text-red-500 transition-all">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function tryPrettyJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str || '';
  }
}
