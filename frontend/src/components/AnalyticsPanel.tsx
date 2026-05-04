"use client";
import { useState, useEffect, useMemo } from "react";
import { BarChart3, Clock, Zap, TrendingUp, Globe, ArrowUp, ArrowDown, Activity } from "lucide-react";

interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  name: string;
  status: number;
  timeMs: number;
  timestamp: string;
}

// Mini bar chart component (pure SVG)
function MiniBarChart({ data, color, height = 80 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const barW = Math.max(4, Math.min(16, Math.floor(200 / data.length) - 2));
  const w = data.length * (barW + 2);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 4));
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={height - h}
            width={barW}
            height={h}
            rx={2}
            fill={color}
            opacity={0.8 + (i / data.length) * 0.2}
          />
        );
      })}
    </svg>
  );
}


// Sparkline (pure SVG)
function Sparkline({ data, color, height = 32, width = 120 }: { data: number[]; color: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Horizontal bar
function HorizontalBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-[11px] text-[var(--muted)] w-24 truncate shrink-0 group-hover:text-[var(--foreground)] transition-colors">{label}</span>
      <div className="flex-1 h-4 bg-[var(--background)] rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-bold text-[var(--foreground)] w-8 text-right">{value}</span>
    </div>
  );
}

export default function AnalyticsPanel() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        const saved = localStorage.getItem("jetapi_history");
        if (saved) setHistory(JSON.parse(saved));
      } catch (e) {}
    };
    load();
    // Also listen for new history pushes
    window.addEventListener("jetapi-history-push", load);
    return () => window.removeEventListener("jetapi-history-push", load);
  }, []);

  const analytics = useMemo(() => {
    if (!history.length) return null;

    // Requests per day (last 7 days)
    const now = new Date();
    const dayLabels: string[] = [];
    const dayCounts: number[] = [];
    const dayAvgTimes: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      dayLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
      const dayEntries = history.filter(h => new Date(h.timestamp).toDateString() === key);
      dayCounts.push(dayEntries.length);
      const times = dayEntries.filter(e => e.timeMs).map(e => e.timeMs);
      dayAvgTimes.push(times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0);
    }

    // Method breakdown
    const methods: Record<string, number> = {};
    history.forEach(h => { methods[h.method] = (methods[h.method] || 0) + 1; });
    const methodColors: Record<string, string> = {
      GET: "#22c55e", POST: "#f97316", PUT: "#3b82f6", DELETE: "#ef4444", PATCH: "#eab308", OPTIONS: "#8b5cf6", HEAD: "#6b7280"
    };

    // Status distribution
    const statusGroups = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "Other": 0 };
    history.forEach(h => {
      if (!h.status) statusGroups["Other"]++;
      else if (h.status < 300) statusGroups["2xx"]++;
      else if (h.status < 400) statusGroups["3xx"]++;
      else if (h.status < 500) statusGroups["4xx"]++;
      else statusGroups["5xx"]++;
    });
    const statusColors: Record<string, string> = {
      "2xx": "#22c55e", "3xx": "#3b82f6", "4xx": "#f59e0b", "5xx": "#ef4444", "Other": "#6b7280"
    };

    // Top endpoints
    const endpointMap: Record<string, { count: number; avgTime: number; times: number[] }> = {};
    history.forEach(h => {
      const key = `${h.method} ${h.name || h.url}`;
      if (!endpointMap[key]) endpointMap[key] = { count: 0, avgTime: 0, times: [] };
      endpointMap[key].count++;
      if (h.timeMs) endpointMap[key].times.push(h.timeMs);
    });
    Object.values(endpointMap).forEach(ep => {
      ep.avgTime = ep.times.length ? Math.round(ep.times.reduce((a, b) => a + b, 0) / ep.times.length) : 0;
    });
    const topEndpoints = Object.entries(endpointMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Averages
    const allTimes = history.filter(h => h.timeMs).map(h => h.timeMs);
    const avgResponseTime = allTimes.length ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length) : 0;
    const fastestTime = allTimes.length ? Math.min(...allTimes) : 0;
    const slowestTime = allTimes.length ? Math.max(...allTimes) : 0;

    // Success rate
    const successCount = history.filter(h => h.status && h.status < 400).length;
    const successRate = history.length ? Math.round((successCount / history.length) * 100) : 0;

    return {
      dayLabels, dayCounts, dayAvgTimes,
      methods, methodColors,
      statusGroups, statusColors,
      topEndpoints,
      avgResponseTime, fastestTime, slowestTime,
      successRate, totalRequests: history.length
    };
  }, [history]);

  if (!history.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] gap-2 p-4">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-xs font-medium">No analytics yet</p>
        <p className="text-[10px] opacity-60 max-w-[180px] text-center">Send some requests and your analytics will appear here.</p>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-3 pb-2 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-[var(--color-brand-500)]" />
        <span className="font-semibold text-xs tracking-wide">Analytics</span>
        <span className="text-[10px] text-[var(--muted)] font-mono ml-auto">{analytics.totalRequests} requests</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1">
              <Zap className="w-3 h-3 text-green-500" />
              <span className="text-[10px] font-medium">Avg Response</span>
            </div>
            <div className="text-base font-bold">{analytics.avgResponseTime}<span className="text-[10px] text-[var(--muted)] font-normal">ms</span></div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1">
              <Activity className="w-3 h-3 text-[var(--color-brand-500)]" />
              <span className="text-[10px] font-medium">Success Rate</span>
            </div>
            <div className="text-base font-bold">{analytics.successRate}<span className="text-[10px] text-[var(--muted)] font-normal">%</span></div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1">
              <ArrowUp className="w-3 h-3 text-green-500" />
              <span className="text-[10px] font-medium">Fastest</span>
            </div>
            <div className="text-base font-bold">{analytics.fastestTime}<span className="text-[10px] text-[var(--muted)] font-normal">ms</span></div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1">
              <ArrowDown className="w-3 h-3 text-red-500" />
              <span className="text-[10px] font-medium">Slowest</span>
            </div>
            <div className="text-base font-bold">{analytics.slowestTime}<span className="text-[10px] text-[var(--muted)] font-normal">ms</span></div>
          </div>
        </div>

        {/* Requests per Day */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-3 h-3 text-[var(--color-brand-500)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Requests / Day (7d)</span>
          </div>
          <MiniBarChart data={analytics.dayCounts} color="var(--color-brand-500)" height={50} />
          <div className="flex justify-between mt-1.5">
            {analytics.dayLabels.map((l, i) => (
              <span key={i} className="text-[8px] text-[var(--muted)] font-medium">{l}</span>
            ))}
          </div>
        </div>

        {/* Avg Response Time Trend */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Avg Time / Day (7d)</span>
          </div>
          <Sparkline data={analytics.dayAvgTimes} color="#3b82f6" height={40} width={200} />
          <div className="flex justify-between mt-1.5">
            {analytics.dayLabels.map((l, i) => (
              <span key={i} className="text-[8px] text-[var(--muted)] font-medium">{l}</span>
            ))}
          </div>
        </div>

        {/* Methods Breakdown */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2.5 block">Methods</span>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-3 bg-[var(--background)]">
            {Object.entries(analytics.methods).map(([m, v]) => (
              <div
                key={m}
                style={{ width: `${(v / analytics.totalRequests) * 100}%`, background: analytics.methodColors[m] || "#6b7280" }}
                className="h-full transition-all duration-500"
                title={`${m}: ${v}`}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {Object.entries(analytics.methods).map(([m, v]) => (
              <div key={m} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded shrink-0" style={{ background: analytics.methodColors[m] || "#6b7280" }}></div>
                <span className="text-[11px] font-mono font-bold">{m}</span>
                <span className="text-[10px] text-[var(--muted)] ml-auto">{v} <span className="opacity-60">({Math.round((v / analytics.totalRequests) * 100)}%)</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Status Codes Breakdown */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2.5 block">Status Codes</span>
          {/* Stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-3 bg-[var(--background)]">
            {Object.entries(analytics.statusGroups).filter(([, v]) => v > 0).map(([s, v]) => (
              <div
                key={s}
                style={{ width: `${(v / analytics.totalRequests) * 100}%`, background: analytics.statusColors[s] }}
                className="h-full transition-all duration-500"
                title={`${s}: ${v}`}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {Object.entries(analytics.statusGroups).filter(([, v]) => v > 0).map(([s, v]) => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded shrink-0" style={{ background: analytics.statusColors[s] }}></div>
                <span className="text-[11px] font-bold">{s}</span>
                <span className="text-[10px] text-[var(--muted)] ml-auto">{v} <span className="opacity-60">({Math.round((v / analytics.totalRequests) * 100)}%)</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Endpoints */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Globe className="w-3 h-3 text-[var(--color-brand-500)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Top Endpoints</span>
          </div>
          <div className="space-y-2">
            {analytics.topEndpoints.map(([name, data], i) => (
              <HorizontalBar
                key={i}
                label={name}
                value={data.count}
                maxValue={analytics.topEndpoints[0]?.[1]?.count || 1}
                color={`hsl(${24 + i * 30}, 85%, 55%)`}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
