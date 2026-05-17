"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  BarChart3, FolderOpen, FileText, Globe, TrendingUp,
  CreditCard, DollarSign, RefreshCw, Crown,
} from "lucide-react";
import UserSidebar from "@/components/UserSidebar";

interface ReportData {
  plan: string;
  limits: any;
  summary: {
    totalCollections: number;
    totalRequests: number;
    environments: number;
  };
  topCollections: { id: string; name: string; requestCount: number; createdAt: string }[];
  months: string[];
  collectionsByMonth: number[];
}

interface PaymentEntry {
  id: string;
  amount: string;
  plan: string;
  status: string;
  createdAt: string;
  method?: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [reportRes, paymentsRes] = await Promise.all([
          apiFetch("/subscriptions/report"),
          apiFetch("/subscriptions/payments"),
        ]);
        if (reportRes.ok) setReport(await reportRes.json());
        if (paymentsRes.ok) {
          const pd = await paymentsRes.json();
          setPayments(pd.payments || pd || []);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center gap-3">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-sm text-[var(--muted)]">Failed to load reports</p>
        <button onClick={() => router.back()} className="text-sm text-[var(--color-brand-500)] hover:underline">Go Back</button>
      </div>
    );
  }

  const s = report.summary;
  const chartMax = Math.max(...report.collectionsByMonth, 1);

  // Usage meters
  const usageMeters = [
    {
      label: "Collections",
      used: s.totalCollections,
      max: report.limits.maxCollections,
      color: "var(--color-brand-500)",
      icon: <FolderOpen className="w-4 h-4" />,
    },
    {
      label: "Environments",
      used: s.environments,
      max: report.limits.maxEnvironments,
      color: "#8b5cf6",
      icon: <Globe className="w-4 h-4" />,
    },
  ];

  const planColors: Record<string, string> = {
    FREE: "#6b7280", PRO: "var(--color-brand-500)", TEAM: "#f59e0b",
  };

  const completedPayments = payments.filter(p => p.status === "completed" || p.status === "active");
  const totalSpent = completedPayments.reduce((sum, p) => sum + (parseFloat(p.amount?.replace("$", "") || "0") || 0), 0);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <UserSidebar activePage="reports" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[var(--color-brand-500)]" /> My Reports
            </h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">Your personal workspace analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold uppercase"
              style={{ backgroundColor: `${planColors[report.plan] || '#6b7280'}20`, color: planColors[report.plan] || '#6b7280' }}
            >
              <Crown className="w-3 h-3 inline mr-1" />{report.plan}
            </span>
            <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2">
              <FolderOpen className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black">{s.totalCollections}</p>
            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">Collections</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black">{s.totalRequests}</p>
            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">Saved Requests</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center mb-2">
              <Globe className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black">{s.environments}</p>
            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">Environments</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-2">
              <DollarSign className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black">${totalSpent.toFixed(0)}</p>
            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">Total Spent</p>
          </div>
        </div>

        {/* Usage Meters */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Plan Usage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {usageMeters.map((m) => {
              const pct = m.max === -1 ? 0 : Math.min((m.used / m.max) * 100, 100);
              const isNearLimit = m.max !== -1 && pct >= 80;
              return (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span style={{ color: m.color }}>{m.icon}</span>
                      {m.label}
                    </div>
                    <span className={`text-xs font-mono ${isNearLimit ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
                      {m.used} / {m.max === -1 ? '∞' : m.max}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[var(--sidebar)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: m.max === -1 ? '5%' : `${Math.max(pct, 2)}%`,
                        backgroundColor: isNearLimit ? '#f59e0b' : m.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collections Growth + Top Collections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Growth Chart */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[var(--color-brand-500)]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Collections Created (6mo)</h3>
            </div>
            <div className="flex items-end gap-2 h-[120px]">
              {report.collectionsByMonth.map((val, i) => {
                const pct = (val / chartMax) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] text-[var(--muted)] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {val}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md transition-all duration-500 hover:opacity-80 min-h-[2px]"
                        style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: 'var(--color-brand-500)' }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--muted)] font-mono">{report.months[i]?.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Collections */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="w-4 h-4 text-[var(--color-brand-500)]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Top Collections</h3>
            </div>
            {report.topCollections.length === 0 ? (
              <p className="text-xs text-[var(--muted)] text-center py-6 opacity-60">No collections yet</p>
            ) : (
              <div className="space-y-2.5">
                {report.topCollections.slice(0, 5).map((c, i) => {
                  const maxReq = report.topCollections[0]?.requestCount || 1;
                  const pct = (c.requestCount / maxReq) * 100;
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-[var(--muted)] w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold truncate">{c.name}</span>
                          <span className="text-[10px] text-[var(--muted)] font-mono ml-2 shrink-0">{c.requestCount} reqs</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--sidebar)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: `hsl(${220 + i * 25}, 70%, 55%)` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Payment History */}
        {completedPayments.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-[var(--color-brand-500)]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Recent Payments</h3>
              <span className="text-[10px] text-[var(--muted)] ml-auto font-mono">{completedPayments.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                    <th className="text-left py-2 font-semibold">Date</th>
                    <th className="text-left py-2 font-semibold">Plan</th>
                    <th className="text-left py-2 font-semibold">Method</th>
                    <th className="text-right py-2 font-semibold">Amount</th>
                    <th className="text-right py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {completedPayments.slice(0, 10).map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--sidebar)] transition-colors">
                      <td className="py-2.5 font-mono text-[var(--foreground)]">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: `${planColors[p.plan] || '#6b7280'}20`, color: planColors[p.plan] || '#6b7280' }}
                        >
                          {p.plan}
                        </span>
                      </td>
                      <td className="py-2.5 text-[var(--muted)] capitalize">{p.method || 'card'}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-emerald-400">{p.amount}</td>
                      <td className="py-2.5 text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
