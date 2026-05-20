"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useDialog } from "@/components/DialogProvider";
import {
  LayoutDashboard, Users, Building2, CreditCard, Sliders, ChevronLeft,
  Search, Shield, Trash2, UserCog, Crown, Save, RotateCcw, Edit3,
  DollarSign, ChevronRight, Smartphone, Calendar, Ban, CheckCircle,
  Megaphone, Plus, Eye, EyeOff, GripVertical, Pencil,
  Activity, LogIn, Power, AlertTriangle, Clock, TrendingUp, BarChart3,
  Download, Settings, ToggleLeft, ToggleRight, Filter, CheckSquare, Square,
  Lock, Unlock, KeyRound, Globe, ShieldCheck, LogOut, RefreshCw, ChevronDown, Check,
} from "lucide-react";

type Tab = "overview" | "users" | "organizations" | "subscriptions" | "plans" | "payments" | "banners" | "audit-log" | "reports" | "settings" | "security";

export default function AdminPage() {
  const router = useRouter();
  const { confirmDialog } = useDialog();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const redirectingRef = useRef(false);

  // Data
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any>(null);
  const [banners, setBanners] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [growthData, setGrowthData] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any>({ enabled: false, message: '' });
  const [auditLogs, setAuditLogs] = useState<any>({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [auditPage, setAuditPage] = useState(1);
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authorized) loadTabData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authorized]);

  const checkAccess = async () => {
    if (redirectingRef.current) return;
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
        redirectingRef.current = true;
        setLoading(false);
        router.replace("/");
        return;
      }
      const res = await apiFetch("/admin/stats");
      if (res.ok) {
        setAuthorized(true);
        setStats(await res.json());
      } else {
        // User claims admin role but API denied — don't redirect (avoids loop)
        toast.error("Admin access denied. Try logging out and back in.");
        setAuthorized(false);
      }
    } catch {
      toast.error("Failed to connect to server.");
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async () => {
    try {
      switch (tab) {
        case "overview": {
          const fetches: Promise<Response>[] = [
            apiFetch("/admin/stats/growth"),
            apiFetch("/admin/maintenance"),
          ];
          // Only re-fetch stats if not already loaded (checkAccess loads it)
          if (!stats) fetches.unshift(apiFetch("/admin/stats"));
          const results = await Promise.all(fetches);
          if (!stats) {
            const statsRes = results.shift()!;
            if (statsRes.ok) setStats(await statsRes.json());
          }
          const [growthRes, maintRes] = results;
          if (growthRes.ok) setGrowthData(await growthRes.json());
          if (maintRes.ok) setMaintenance(await maintRes.json());
          break;
        }
        case "users": break; // UsersTab manages its own data loading
        case "organizations": {
          const res = await apiFetch("/admin/organizations");
          if (res.ok) setOrgs(await res.json());
          break;
        }
        case "subscriptions": {
          const [subsRes, plansRes] = await Promise.all([
            apiFetch("/admin/subscriptions"),
            plans.length === 0 ? apiFetch("/admin/plans") : Promise.resolve(null),
          ]);
          if (subsRes.ok) setSubs(await subsRes.json());
          if (plansRes?.ok) setPlans(await plansRes.json());
          break;
        }
        case "plans": {
          const res = await apiFetch("/admin/plans");
          if (res.ok) setPlans(await res.json());
          break;
        }
        case "payments": {
          const now = new Date();
          const res = await apiFetch(`/admin/payments?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
          if (res.ok) setPayments(await res.json());
          break;
        }
        case "banners": {
          const res = await apiFetch("/admin/banners");
          if (res.ok) setBanners(await res.json());
          break;
        }
        case "audit-log": break; // AuditLogTab manages its own data loading
        case "settings": {
          const res = await apiFetch("/admin/feature-flags");
          if (res.ok) setFeatureFlags(await res.json());
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (!(await confirmDialog(`Deactivate user ${email}? They will not be able to login until reactivated.`))) return;
    const res = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`Deactivated ${email}`); loadTabData(); }
    else toast.error("Failed to deactivate user");
  };

  const handleToggleActive = async (id: string, email: string, isActive: boolean) => {
    const action = isActive ? 'Deactivate' : 'Activate';
    if (!(await confirmDialog(`${action} user ${email}?`))) return;
    const res = await apiFetch(`/admin/users/${id}/toggle-active`, { method: "PUT" });
    if (res.ok) { toast.success(`${email} ${isActive ? 'deactivated' : 'activated'}`); loadTabData(); }
    else { const err = await res.json().catch(() => null); toast.error(err?.message || `Failed to ${action.toLowerCase()} user`); }
  };

  const handleToggleAdmin = async (id: string, currentRole: string) => {
    if (currentRole === "SUPER_ADMIN") {
      toast.error("Super Admin role cannot be changed from here.");
      return;
    }
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    if (!(await confirmDialog(`Change role to ${newRole}?`))) return;
    const res = await apiFetch(`/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) { toast.success(`Role updated to ${newRole}`); loadTabData(); }
    else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.message || "Failed to update role");
    }
  };

  const handleImpersonate = async (id: string, email: string) => {
    if (!(await confirmDialog(`Login as ${email}? You will be redirected to their view.`))) return;
    try {
      const res = await apiFetch(`/admin/users/${id}/impersonate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        // Save current admin session for exit
        const currentToken = localStorage.getItem("token") || "";
        const currentUser = localStorage.getItem("user") || "";
        localStorage.setItem("admin_token", currentToken);
        localStorage.setItem("admin_user", currentUser);
        // Set impersonated user
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("impersonating", "true");
        // Full reload to ensure clean state
        window.location.href = "/";
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Impersonation failed");
      }
    } catch { toast.error("Impersonation failed"); }
  };

  const handleDeleteOrg = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete team "${name}"? All members will be removed.`))) return;
    const res = await apiFetch(`/admin/organizations/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`Deleted ${name}`); loadTabData(); }
    else toast.error("Failed to delete team");
  };

  const handleOverridePlan = async (userId: string, planId: string) => {
    const res = await apiFetch(`/admin/subscriptions/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    if (res.ok) { toast.success("Plan updated"); loadTabData(); }
    else toast.error("Failed to override plan");
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
      <div className="text-center max-w-sm">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-60" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-sm text-[var(--muted)] mb-6">You don&apos;t have admin access, or your session has expired.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              localStorage.removeItem("impersonating");
              localStorage.removeItem("admin_token");
              localStorage.removeItem("admin_user");
              window.location.href = "/login";
            }}
            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
          >
            Logout
          </button>
          <button
            onClick={() => window.location.href = "/"}
            className="px-4 py-2 rounded-lg bg-[var(--sidebar)] hover:bg-[var(--border)] text-sm font-semibold transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "organizations", label: "Teams", icon: <Building2 className="w-4 h-4" /> },
    { id: "subscriptions", label: "Subscriptions", icon: <CreditCard className="w-4 h-4" /> },
    { id: "plans", label: "Plan Config", icon: <Sliders className="w-4 h-4" /> },
    { id: "payments", label: "Payments", icon: <DollarSign className="w-4 h-4" /> },
    { id: "banners", label: "Announcements", icon: <Megaphone className="w-4 h-4" /> },
    { id: "audit-log", label: "Audit Log", icon: <Activity className="w-4 h-4" /> },
    { id: "reports", label: "Reports", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "security", label: "Security", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col p-4 flex-shrink-0">
        <div className="mb-8 pl-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--color-brand-500)]" /> Admin Panel
          </h1>
          <p className="text-xs text-[var(--muted)] ml-7 mt-0.5">Platform Control</p>
        </div>

        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors ${
                tab === t.id
                  ? "bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--card)]"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <button
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              router.push("/login");
            }}
            className="text-sm text-red-400 hover:text-white hover:bg-red-500 flex items-center gap-2 border-t border-[var(--border)] pt-4 px-3 py-2 rounded transition-colors w-full"
          >
            <ChevronLeft className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-5xl mx-auto px-6 py-5 sm:py-8">
          {tab === "overview" && <OverviewTab stats={stats} growthData={growthData} maintenance={maintenance} onMaintenanceChange={async (enabled: boolean, msg: string) => {
            const res = await apiFetch("/admin/maintenance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, message: msg }) });
            if (res.ok) { const d = await res.json(); setMaintenance(d); toast.success(enabled ? "Maintenance mode enabled" : "Maintenance mode disabled"); }
          }} />}
          {tab === "users" && (
            <UsersTab
              onDelete={handleDeleteUser}
              onToggleAdmin={handleToggleAdmin}
              onToggleActive={handleToggleActive}
              onImpersonate={handleImpersonate}
              currentUserRole={(() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return 'ADMIN'; } })()}
            />
          )}
          {tab === "organizations" && <OrganizationsTab orgs={orgs} onDelete={handleDeleteOrg} />}
          {tab === "subscriptions" && <SubscriptionsTab subs={subs} onOverride={handleOverridePlan} />}
          {tab === "plans" && <PlansTab plans={plans} onReload={loadTabData} />}
          {tab === "payments" && <PaymentsTab data={payments} onReload={loadTabData} />}
          {tab === "banners" && <BannersTab banners={banners} onReload={loadTabData} />}
          {tab === "audit-log" && <AuditLogTab />}
          {tab === "reports" && <ReportsTab />}
          {tab === "settings" && <SettingsTab flags={featureFlags} onReload={loadTabData} />}
          {tab === "security" && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────
function OverviewTab({ stats, growthData, maintenance, onMaintenanceChange }: { stats: any; growthData: any; maintenance: any; onMaintenanceChange: (enabled: boolean, msg: string) => void }) {
  const [maintMsg, setMaintMsg] = useState(maintenance?.message || '');

  useEffect(() => { setMaintMsg(maintenance?.message || ''); }, [maintenance]);

  if (!stats) return null;

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: <Users className="w-5 h-5" />, gradient: "from-blue-500/20 to-blue-600/5", iconBg: "bg-blue-500/20 text-blue-400", border: "border-blue-500/20" },
    { label: "Teams", value: stats.totalOrgs, icon: <Building2 className="w-5 h-5" />, gradient: "from-emerald-500/20 to-emerald-600/5", iconBg: "bg-emerald-500/20 text-emerald-400", border: "border-emerald-500/20" },
    { label: "Collections", value: stats.totalCollections, icon: <Sliders className="w-5 h-5" />, gradient: "from-violet-500/20 to-violet-600/5", iconBg: "bg-violet-500/20 text-violet-400", border: "border-violet-500/20" },
    { label: "Subscriptions", value: stats.totalSubscriptions, icon: <CreditCard className="w-5 h-5" />, gradient: "from-amber-500/20 to-amber-600/5", iconBg: "bg-amber-500/20 text-amber-400", border: "border-amber-500/20" },
    { label: "Total Revenue", value: `$${stats.totalRevenue || 0}`, icon: <DollarSign className="w-5 h-5" />, gradient: "from-green-500/20 to-green-600/5", iconBg: "bg-green-500/20 text-green-400", border: "border-green-500/20" },
    { label: "Payments", value: stats.totalPayments || 0, icon: <CheckCircle className="w-5 h-5" />, gradient: "from-pink-500/20 to-pink-600/5", iconBg: "bg-pink-500/20 text-pink-400", border: "border-pink-500/20" },
  ];

  const maxUsers = growthData ? Math.max(...growthData.users, 1) : 1;
  const maxRev = growthData ? Math.max(...growthData.revenue, 1) : 1;

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-brand-600)] flex items-center justify-center shadow-lg shadow-[var(--color-brand-500)]/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-[var(--muted)]">Platform overview and system metrics</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((c, i) => (
          <div key={i} className={`rounded-xl border ${c.border} bg-gradient-to-br ${c.gradient} p-5 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wider">{c.label}</p>
              <div className={`w-9 h-9 rounded-lg ${c.iconBg} flex items-center justify-center`}>{c.icon}</div>
            </div>
            <p className="text-3xl font-black text-[var(--foreground)]">{c.value}</p>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/[0.03] group-hover:bg-white/[0.05] transition-colors"></div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {growthData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* User Growth */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" /> User Growth (6 months)
            </h3>
            <div className="flex items-end gap-2 h-32">
              {growthData.months.map((m: string, i: number) => {
                const h = maxUsers > 0 ? (growthData.users[i] / maxUsers) * 100 : 0;
                return (
                  <div key={m} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity font-bold">{growthData.users[i]}</span>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-500 hover:from-blue-400 hover:to-blue-300" style={{ height: `${Math.max(h, 4)}%`, minHeight: '4px' }}></div>
                    <span className="text-[10px] text-[var(--muted)]">{m.split('-')[1]}/{m.split('-')[0].slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Revenue */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-400" /> Revenue Trend (6 months)
            </h3>
            <div className="flex items-end gap-2 h-32">
              {growthData.months.map((m: string, i: number) => {
                const h = maxRev > 0 ? (growthData.revenue[i] / maxRev) * 100 : 0;
                return (
                  <div key={m} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity font-bold">${growthData.revenue[i]}</span>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-green-500 to-emerald-400 transition-all duration-500 hover:from-green-400 hover:to-emerald-300" style={{ height: `${Math.max(h, 4)}%`, minHeight: '4px' }}></div>
                    <span className="text-[10px] text-[var(--muted)]">{m.split('-')[1]}/{m.split('-')[0].slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Plan Distribution, System Info & Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plan Distribution */}
        {stats.planBreakdown?.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" /> Plan Distribution
            </h3>
            <div className="space-y-3">
              {stats.planBreakdown.map((p: any) => {
                const total = stats.planBreakdown.reduce((s: number, x: any) => s + parseInt(x.count), 0);
                const pct = total > 0 ? Math.round((parseInt(p.count) / total) * 100) : 0;
                return (
                  <div key={p.plan}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">{p.plan}</span>
                      <span className="text-xs text-[var(--muted)]">{p.count} users ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-[var(--sidebar)] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-brand-400)] rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Maintenance Mode */}
        <div className={`rounded-xl border p-5 transition-colors ${maintenance?.enabled ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--border)] bg-[var(--card)]'}`}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            {maintenance?.enabled ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <Power className="w-4 h-4 text-green-400" />}
            Maintenance Mode
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${maintenance?.enabled ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
              {maintenance?.enabled ? '● ACTIVE' : '● OFF'}
            </span>
          </h3>
          <input
            type="text"
            value={maintMsg}
            onChange={(e) => setMaintMsg(e.target.value)}
            placeholder="Custom maintenance message..."
            className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[var(--color-brand-500)]"
          />
          <button
            onClick={() => onMaintenanceChange(!maintenance?.enabled, maintMsg)}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${maintenance?.enabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            {maintenance?.enabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
          </button>
        </div>

        {/* System Health */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" /> System Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[var(--muted)]">API Server</span>
              <span className="text-xs font-semibold bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full">● Online</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[var(--muted)]">Database</span>
              <span className="text-xs font-semibold bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full">● Connected</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[var(--muted)]">Active Users</span>
              <span className="text-sm font-bold">{stats.totalUsers}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[var(--muted)]">Platform Version</span>
              <span className="text-xs font-mono bg-[var(--sidebar)] px-2.5 py-1 rounded-full">v2.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Select Dropdown ──────────────────────────
type SelectOption = { value: string; label: string };
type SelectGroup = { group: string; items: SelectOption[] };

function CustomSelect({ value, onChange, options, groups, compact }: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const handleScroll = () => updatePosition();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, updatePosition]);

  const allOptions = [...(options ?? []), ...(groups?.flatMap(g => g.items) ?? [])];
  const selectedLabel = allOptions.find(o => o.value === value)?.label || value;

  const renderOption = (opt: SelectOption) => (
    <button
      key={opt.value}
      onClick={() => { onChange(opt.value); setOpen(false); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
        opt.value === value
          ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] font-semibold'
          : 'text-[var(--foreground)] hover:bg-[var(--sidebar)]'
      }`}
    >
      <Check className={`w-3.5 h-3.5 shrink-0 ${opt.value === value ? 'opacity-100 text-[var(--color-brand-500)]' : 'opacity-0'}`} />
      {opt.label}
    </button>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 bg-[var(--sidebar)] border rounded-lg ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} font-medium cursor-pointer transition-all ${
          open ? 'border-[var(--color-brand-500)] shadow-[0_0_0_1px_var(--color-brand-500)]' : 'border-[var(--border)] hover:border-[var(--color-brand-500)]/50'
        }`}
      >
        <span className="text-[var(--foreground)]">{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="min-w-[180px] max-h-[320px] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl shadow-black/40 py-1"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {options && options.map(renderOption)}
          {options && options.length > 0 && groups && groups.length > 0 && <div className="h-px bg-[var(--border)] my-1" />}
          {groups && groups.map((g, gi) => (
            <div key={g.group}>
              {gi > 0 && <div className="h-px bg-[var(--border)] my-1" />}
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{g.group}</div>
              {g.items.map(renderOption)}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Users Tab ───────────────────────────────────────
function UsersTab({
  onDelete, onToggleAdmin, onToggleActive, onImpersonate, currentUserRole,
}: {
  onDelete: (id: string, email: string) => void | Promise<void>;
  onToggleAdmin: (id: string, role: string) => void | Promise<void>;
  onToggleActive: (id: string, email: string, isActive: boolean) => void | Promise<void>;
  onImpersonate: (id: string, email: string) => void;
  currentUserRole?: string;
}) {
  const { confirmDialog } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("USER");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [showCreate, setShowCreate] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadUsersRef = useRef<((p?: number, s?: string, r?: string, st?: string) => Promise<void>) | undefined>(undefined);
  loadUsersRef.current = async (p = page, s = search, r = filterRole, st = filterStatus) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(limit));
      if (s) params.set("search", s);
      if (r !== "all") params.set("role", r);
      if (st !== "all") params.set("status", st);
      const res = await apiFetch(`/admin/users?${params}`);
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users); setTotal(d.total); setPage(d.page); setTotalPages(d.totalPages);
      }
    } catch {}
    setLoading(false);
  };

  const loadUsers = (p?: number) => loadUsersRef.current?.(p);

  useEffect(() => { loadUsersRef.current?.(1, search, filterRole, filterStatus); }, [filterRole, filterStatus, limit]);

  const handleSearch = () => { loadUsersRef.current?.(1, search, filterRole, filterStatus); };

  const allSelected = users.length > 0 && users.every(u => selectedIds.has(u.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(users.map(u => u.id)));
  };

  const handleBulk = async (action: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const label = action === "deactivate" ? "Deactivate" : action === "activate" ? "Activate" : "Delete";
    if (!(await confirmDialog(`${label} ${ids.length} selected user(s)?`))) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch("/admin/users/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action }) });
      if (res.ok) { const d = await res.json(); toast.success(`${d.affected} user(s) ${action}d${d.skippedProtected ? ` (${d.skippedProtected} protected skipped)` : ""}`); setSelectedIds(new Set()); loadUsers(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.message || "Bulk action failed"); }
    } catch { toast.error("Bulk action failed"); }
    setBulkLoading(false);
  };

  const exportCSV = () => {
    const rows = ["Name,Email,Role,Status,Plan,Joined", ...users.map(u =>
      `"${u.name || ""}","${u.email}","${u.role}","${u.isActive !== false ? "Active" : "Inactive"}","${u.plan || "FREE"}","${new Date(u.createdAt).toLocaleDateString()}"`)].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = `users_${new Date().toISOString().split("T")[0]}.csv`; a.click(); toast.success("Users exported as CSV");
  };

  const handleCreateAdmin = async () => {
    if (!newAdmin.name.trim() || !newAdmin.email.trim() || !newAdmin.password.trim()) { toast.error("All fields are required"); return; }
    if (newAdmin.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setCreating(true);
    try {
      const res = await apiFetch("/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newAdmin) });
      if (res.ok) { toast.success("Admin user created"); setNewAdmin({ name: "", email: "", password: "" }); setShowCreate(false); loadUsers(); }
      else { const d = await res.json(); toast.error(d.message || "Failed to create admin"); }
    } catch { toast.error("Failed to create admin"); }
    setCreating(false);
  };

  const hasFilters = filterRole !== "all" || filterStatus !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Users</h1>
          <p className="text-[var(--muted)] text-sm">Manage all platform users · {total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors" title="Export CSV">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${showCreate ? 'bg-[var(--sidebar)] text-[var(--muted)]' : 'bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white'}`}>
            {showCreate ? <RotateCcw className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreate ? "Cancel" : "Create Admin"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 p-5 rounded-xl border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-[var(--color-brand-500)]" /> Create New Admin User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input type="text" placeholder="Full Name" value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} className="bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-brand-500)]" />
            <input type="email" placeholder="Email" value={newAdmin.email} onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })} className="bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-brand-500)]" />
            <input type="password" placeholder="Password (min 6)" value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} className="bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-brand-500)]" onKeyDown={e => e.key === "Enter" && handleCreateAdmin()} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--muted)]">Created with <strong className="text-amber-400">ADMIN</strong> role</p>
            <button onClick={handleCreateAdmin} disabled={creating} className="bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{creating ? "Creating..." : "Create Admin"}</button>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Search by email or name..." className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)]" />
        </div>
        <CustomSelect
          value={filterRole}
          onChange={setFilterRole}
          options={[
            { value: "all", label: "All Roles" },
            { value: "USER", label: "User" },
            { value: "ADMIN", label: "Admin" },
            { value: "SUPER_ADMIN", label: "Super Admin" },
          ]}
        />
        <CustomSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "all", label: "All Status" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <CustomSelect
          value={String(limit)}
          onChange={(v) => setLimit(parseInt(v))}
          options={[
            { value: "10", label: "10 / page" },
            { value: "20", label: "20 / page" },
            { value: "50", label: "50 / page" },
            { value: "100", label: "100 / page" },
          ]}
        />
        {hasFilters && <button onClick={() => { setFilterRole("all"); setFilterStatus("all"); }} className="px-3 py-2 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold">Clear</button>}
        <button onClick={handleSearch} className="px-4 py-2 bg-[var(--color-brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-brand-600)]">Search</button>
      </div>

      {/* Bulk Bar */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--color-brand-500)]/10 border border-[var(--color-brand-500)]/20 animate-in fade-in">
          <span className="text-sm font-bold text-[var(--color-brand-500)]">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => handleBulk("activate")} disabled={bulkLoading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 disabled:opacity-50"><CheckCircle className="w-3 h-3" /> Activate</button>
          <button onClick={() => handleBulk("deactivate")} disabled={bulkLoading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-bold hover:bg-amber-500/25 disabled:opacity-50"><Ban className="w-3 h-3" /> Deactivate</button>
          <button onClick={() => handleBulk("delete")} disabled={bulkLoading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Delete</button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] ml-1">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" /></div>
      ) : (<>
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 w-10"><button onClick={toggleAll}>{allSelected ? <CheckSquare className="w-4 h-4 text-[var(--color-brand-500)]" /> : <Square className="w-4 h-4" />}</button></th>
              <th className="text-left px-4 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Plan</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-[var(--sidebar)] transition-colors ${u.isActive === false ? 'opacity-60' : ''} ${selectedIds.has(u.id) ? 'bg-[var(--color-brand-500)]/5' : ''}`}>
                <td className="px-4 py-3"><button onClick={() => toggleSelect(u.id)}>{selectedIds.has(u.id) ? <CheckSquare className="w-4 h-4 text-[var(--color-brand-500)]" /> : <Square className="w-4 h-4 text-[var(--muted)]" />}</button></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-brand-500)]/20 flex items-center justify-center text-[var(--color-brand-500)] text-xs font-bold uppercase">{u.email?.substring(0, 2)}</div>
                    <div><p className="font-medium">{u.name || "—"}</p><p className="text-xs text-[var(--muted)]">{u.email}</p></div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${u.role === "SUPER_ADMIN" ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/20" : u.role === "ADMIN" ? "bg-violet-500/15 text-violet-400 border border-violet-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                    {u.role === "SUPER_ADMIN" && <Crown className="w-3 h-3" />}{u.role === "ADMIN" && <Shield className="w-3 h-3" />}{(!u.role || u.role === "USER") && <Users className="w-3 h-3" />}
                    {u.role === "SUPER_ADMIN" ? "Super Admin" : u.role === "ADMIN" ? "Admin" : "User"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${u.isActive !== false ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {u.isActive !== false ? <><CheckCircle className="w-3 h-3" /> Active</> : <><Ban className="w-3 h-3" /> Inactive</>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.role === "ADMIN" || u.role === "SUPER_ADMIN" ? (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  ) : (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${u.plan === "FREE" ? "bg-[var(--sidebar)]" : u.plan === "PRO" ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)]" : "bg-amber-500/20 text-amber-400"}`}>{u.plan}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--muted)] text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(u.role !== 'SUPER_ADMIN' || currentUserRole === 'SUPER_ADMIN') ? (<>
                      <button onClick={() => onImpersonate(u.id, u.email)} title="Login as" className="p-1.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"><LogIn className="w-4 h-4" /></button>
                      <button onClick={async () => {
                        const res = await apiFetch(`/admin/users/${u.id}/force-logout`, { method: "POST" });
                        if (res.ok) toast.success(`Force logged out ${u.email}`);
                        else toast.error("Failed");
                      }} title="Force logout" className="p-1.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"><Power className="w-4 h-4" /></button>
                      <button onClick={async () => {
                        await onToggleActive(u.id, u.email, u.isActive !== false);
                        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: x.isActive === false ? true : false } : x));
                      }} title={u.isActive !== false ? "Deactivate" : "Activate"} className={`p-1.5 rounded ${u.isActive !== false ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}>
                        {u.isActive !== false ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={async () => {
                        await onToggleAdmin(u.id, u.role);
                        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: x.role === 'ADMIN' ? 'USER' : 'ADMIN' } : x));
                      }} title="Toggle role" className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"><UserCog className="w-4 h-4" /></button>
                    </>) : <span className="text-[10px] text-[var(--muted)] italic">Protected</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div className="text-center py-8 text-[var(--muted)] text-sm">No users found</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages} · {total} users</p>
          <div className="flex items-center gap-1">
            <button onClick={() => loadUsers(page - 1)} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--sidebar)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button key={p} onClick={() => loadUsers(p)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${p === page ? 'bg-[var(--color-brand-500)] text-white' : 'bg-[var(--sidebar)] hover:bg-[var(--border)]'}`}>{p}</button>
              );
            })}
            <button onClick={() => loadUsers(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--sidebar)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
// ─── Teams Tab ───────────────────────────────
function OrganizationsTab({ orgs, onDelete }: { orgs: any[]; onDelete: (id: string, name: string) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Teams</h1>
      <p className="text-[var(--muted)] text-sm mb-4">All teams on the platform</p>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">Team</th>
              <th className="text-left px-4 py-3 font-semibold">Owner</th>
              <th className="text-center px-4 py-3 font-semibold">Members</th>
              <th className="text-left px-4 py-3 font-semibold">Created</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {orgs.map((o) => (
              <tr key={o.id} className="hover:bg-[var(--sidebar)] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--muted)]" />
                    <span className="font-medium">{o.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{o.ownerEmail}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs font-bold bg-[var(--sidebar)] px-2 py-0.5 rounded-full">{o.memberCount}</span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)] text-xs">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(o.id, o.name)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orgs.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No teams found</div>
        )}
      </div>
    </div>
  );
}

// ─── Subscriptions Tab ───────────────────────────────
function SubscriptionsTab({ subs, onOverride }: { subs: any[]; onOverride: (userId: string, plan: string) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Subscriptions</h1>
      <p className="text-[var(--muted)] text-sm mb-4">All user subscriptions</p>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Plan</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Interval</th>
              <th className="text-right px-4 py-3 font-semibold">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {subs.map((s) => (
              <tr key={s.id} className="hover:bg-[var(--sidebar)] transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{s.userName || "—"}</p>
                  <p className="text-xs text-[var(--muted)]">{s.userEmail}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    s.plan === "FREE" ? "bg-[var(--sidebar)] text-[var(--foreground)]" :
                    s.plan === "PRO" ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)]" :
                    "bg-amber-500/20 text-amber-400"
                  }`}>
                    {s.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold ${
                    s.status === "active" ? "text-emerald-400" :
                    s.status === "past_due" ? "text-red-400" :
                    "text-[var(--muted)]"
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{s.billingInterval}</td>
                <td className="px-4 py-3 text-right">
                  <CustomSelect
                    compact
                    value={s.plan}
                    onChange={(v) => onOverride(s.userId, v)}
                    options={[
                      { value: "FREE", label: "FREE" },
                      { value: "PRO", label: "PRO" },
                      { value: "TEAM", label: "TEAM" },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {subs.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No subscriptions found</div>
        )}
      </div>
    </div>
  );
}

// ─── Plans Tab ───────────────────────────────────────
function PlansTab({ plans, onReload }: { plans: any[]; onReload: () => void }) {
  const [editing, setEditing] = useState<Record<string, any>>({});

  const handleChange = (planId: string, key: string, value: string) => {
    setEditing((prev) => ({
      ...prev,
      [planId]: { ...(prev[planId] || {}), [key]: parseInt(value) || 0 },
    }));
  };

  const handleBoolChange = (planId: string, key: string, value: boolean) => {
    setEditing((prev) => ({
      ...prev,
      [planId]: { ...(prev[planId] || {}), [key]: value },
    }));
  };

  const handleSave = async (planId: string) => {
    const overrides = editing[planId];
    if (!overrides) return;

    const res = await apiFetch(`/admin/plans/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });

    if (res.ok) {
      toast.success(`${planId} plan updated`);
      setEditing((prev) => { const n = { ...prev }; delete n[planId]; return n; });
      onReload();
    } else {
      toast.error("Failed to update plan");
    }
  };

  const handleReset = async (planId: string) => {
    const res = await apiFetch(`/admin/plans/${planId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${planId} plan reset to defaults`);
      setEditing((prev) => { const n = { ...prev }; delete n[planId]; return n; });
      onReload();
    }
  };

  const limitFields = [
    { key: "maxCollections", label: "Max Collections", hint: "-1 = unlimited" },
    { key: "maxRequestsPerCollection", label: "Max Requests/Collection", hint: "-1 = unlimited" },
    { key: "maxMembers", label: "Max Team Members", hint: "" },
    { key: "maxCollaborators", label: "Max Collaborators", hint: "-1 = unlimited" },
    { key: "maxEnvironments", label: "Max Environments", hint: "-1 = unlimited" },
    { key: "historyDays", label: "History (days)", hint: "" },
    { key: "maxUploadMb", label: "Max Upload (MB)", hint: "" },
  ];

  const toggleFields = [
    { key: "analyticsAccess", label: "Analytics Panel", description: "Allow access to the analytics sidebar" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Plan Configuration</h1>
      <p className="text-[var(--muted)] text-sm mb-5">Edit plan limits — changes apply to all users on that plan instantly</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const edits = editing[plan.id] || {};
          const hasEdits = Object.keys(edits).length > 0;

          return (
            <div key={plan.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Crown className={`w-4 h-4 ${
                    plan.id === "FREE" ? "text-[var(--muted)]" :
                    plan.id === "PRO" ? "text-[var(--color-brand-500)]" :
                    "text-amber-400"
                  }`} />
                  <h3 className="font-bold">{plan.name}</h3>
                </div>
                {plan.hasOverride && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">MODIFIED</span>
                )}
              </div>

              <div className="space-y-3 flex-1">
                {limitFields.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-[var(--muted)] font-medium mb-0.5 block">{f.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={edits[f.key] !== undefined ? edits[f.key] : plan.limits[f.key]}
                        onChange={(e) => handleChange(plan.id, f.key, e.target.value)}
                        className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)]"
                      />
                      {f.hint && <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{f.hint}</span>}
                    </div>
                  </div>
                ))}

                {/* Feature Toggles */}
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                  <div className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Feature Access</div>
                  {toggleFields.map((f) => {
                    const currentValue = edits[f.key] !== undefined ? edits[f.key] : plan.limits[f.key];
                    return (
                      <div key={f.key} className="flex items-center justify-between py-1.5">
                        <div>
                          <div className="text-xs font-medium">{f.label}</div>
                          <div className="text-[10px] text-[var(--muted)]">{f.description}</div>
                        </div>
                        <button
                          onClick={() => handleBoolChange(plan.id, f.key, !currentValue)}
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${currentValue ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${currentValue ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--border)]">
                <button
                  onClick={() => handleSave(plan.id)}
                  disabled={!hasEdits}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={() => handleReset(plan.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Payments Tab ────────────────────────────────────
function PaymentsTab({ data, onReload }: { data: any; onReload: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(data);

  useEffect(() => {
    setPaymentData(data);
  }, [data]);

  const loadMonth = async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/payments?year=${y}&month=${m}`);
      if (res.ok) setPaymentData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrev = () => {
    let newMonth = month - 1;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
    loadMonth(newYear, newMonth);
  };

  const handleNext = () => {
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
    loadMonth(newYear, newMonth);
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const payments = paymentData?.payments || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Payments</h1>
      <p className="text-[var(--muted)] text-sm mb-4">Monthly payment records and revenue</p>

      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="p-2 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm font-bold">{monthNames[month - 1]} {year}</span>
          </div>
          <button onClick={handleNext} className="p-2 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-[var(--muted)]">Monthly Revenue</p>
            <p className="text-lg font-black text-green-400">${paymentData?.monthlyTotal || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--muted)]">Transactions</p>
            <p className="text-lg font-black">{paymentData?.total || 0}</p>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold">User</th>
                <th className="text-left px-4 py-3 font-semibold">Plan</th>
                <th className="text-left px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Method</th>
                <th className="text-left px-4 py-3 font-semibold">Details</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-[var(--sidebar)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.userName || "—"}</p>
                    <p className="text-xs text-[var(--muted)]">{p.userEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      p.plan === "PRO" ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)]" :
                      p.plan === "TEAM" ? "bg-amber-500/20 text-amber-400" :
                      "bg-[var(--sidebar)] text-[var(--foreground)]"
                    }`}>
                      {p.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-green-400">{p.amount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {p.method === "card" ? (
                        <CreditCard className="w-3.5 h-3.5 text-[var(--muted)]" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5 text-[var(--muted)]" />
                      )}
                      <span className="text-xs font-medium capitalize">{p.method === "mfs" ? p.mfsProvider || "MFS" : "Card"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {p.method === "card" && p.cardLast4 && `****${p.cardLast4}`}
                    {p.method === "mfs" && p.transactionId && `TrxID: ${p.transactionId}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && payments.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No payments found for {monthNames[month - 1]} {year}</div>
        )}
      </div>
    </div>
  );
}

// ─── Banners Tab ────────────────────────────────────────────
function BannersTab({ banners, onReload }: { banners: any[]; onReload: () => void }) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const reloadAndNotify = () => {
    onReload();
    window.dispatchEvent(new Event("banners-updated"));
  };

  const handleCreate = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    const res = await apiFetch("/admin/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText.trim() }),
    });
    if (res.ok) {
      toast.success("Announcement created");
      setNewText("");
      reloadAndNotify();
    } else {
      toast.error("Failed to create announcement");
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const res = await apiFetch(`/admin/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      toast.success(`Announcement ${isActive ? "hidden" : "shown"}`);
      reloadAndNotify();
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const res = await apiFetch(`/admin/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText.trim() }),
    });
    if (res.ok) {
      toast.success("Announcement updated");
      setEditingId(null);
      reloadAndNotify();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this banner? It can be restored later.")) return;
    const res = await apiFetch(`/admin/banners/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Announcement deleted");
      reloadAndNotify();
    }
  };

  const handleRestore = async (id: string) => {
    const res = await apiFetch(`/admin/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDeleted: false, isActive: true }),
    });
    if (res.ok) {
      toast.success("Announcement restored");
      reloadAndNotify();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Announcement Management</h2>
      <p className="text-sm text-[var(--muted)] mb-6">Control the announcement ticker shown to all users below the top bar.</p>

      {/* Add new banner */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Enter new announcement text (supports emojis 🚀)..."
          className="flex-1 bg-[var(--sidebar)] border border-[var(--border)] px-4 py-2.5 rounded-lg text-sm outline-none focus:border-[var(--color-brand-500)] transition-colors"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button
          onClick={handleCreate}
          disabled={saving || !newText.trim()}
          className="flex items-center gap-2 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add Announcement
        </button>
      </div>

      {/* Banner list */}
      <div className="flex flex-col gap-2">
        {banners.filter(b => !b.isDeleted).map((b, i) => (
          <div
            key={b.id}
            className={`flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 group transition-all ${
              !b.isActive ? "opacity-50" : ""
            }`}
          >
            <span className="text-xs text-[var(--muted)] font-mono w-6 text-center shrink-0">{i + 1}</span>

            {editingId === b.id ? (
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 bg-[var(--sidebar)] border border-[var(--color-brand-500)] px-3 py-1.5 rounded text-sm outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit(b.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <span className="flex-1 text-sm truncate">{b.text}</span>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              {editingId === b.id ? (
                <>
                  <button
                    onClick={() => handleSaveEdit(b.id)}
                    className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
                    title="Save"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1.5 rounded hover:bg-[var(--card)] text-[var(--muted)] transition-colors"
                    title="Cancel"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleToggle(b.id, b.isActive)}
                    className={`p-1.5 rounded transition-colors ${
                      b.isActive
                        ? "hover:bg-yellow-500/20 text-green-400"
                        : "hover:bg-green-500/20 text-[var(--muted)]"
                    }`}
                    title={b.isActive ? "Hide banner" : "Show banner"}
                  >
                    {b.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(b.id);
                      setEditText(b.text);
                    }}
                    className="p-1.5 rounded hover:bg-blue-500/20 text-[var(--muted)] hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Deleted banners section */}
        {banners.some(b => b.isDeleted) && (
          <>
            <div className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Deleted Announcements
            </div>
            {banners.filter(b => b.isDeleted).map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-lg px-4 py-3 opacity-40 hover:opacity-70 transition-all"
              >
                <span className="flex-1 text-sm truncate line-through">{b.text}</span>
                <button
                  onClick={() => handleRestore(b.id)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-semibold transition-colors"
                  title="Restore banner"
                >
                  <RotateCcw className="w-3 h-3" /> Restore
                </button>
              </div>
            ))}
          </>
        )}

        {banners.length === 0 && (
          <div className="text-center py-12 text-[var(--muted)] text-sm border border-dashed border-[var(--border)] rounded-lg">
            No announcements yet. Add one above to get started.
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-[var(--sidebar)] rounded-lg border border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">How it works:</strong> Active banners are displayed in the scrolling ticker below the top bar for all users.
          Users can individually hide the ticker from their Profile → Preferences. Toggle the <Eye className="w-3 h-3 inline" /> icon to show/hide specific banners.
        </p>
      </div>
    </div>
  );
}

// ─── Audit Log Tab ───────────────────────────────────
function AuditLogTab() {
  const [data, setData] = useState<any>({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [stats, setStats] = useState<any>({ total: 0, today: 0, thisWeek: 0, actionCounts: [], uniqueAdmins: 0, dailyBreakdown: [] });

  const loadLogs = async (p = page, s = search, act = filterAction) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(limit));
      if (s) params.set("search", s);
      if (act !== "all") params.set("action", act);
      if (dateRange !== "all") params.set("dateRange", dateRange);
      const res = await apiFetch(`/admin/audit-logs?${params}`);
      if (res.ok) { const d = await res.json(); setData(d); setPage(d.page); }
    } catch {}
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await apiFetch("/admin/audit-logs/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  useEffect(() => { loadLogs(1, "", filterAction); }, [limit, filterAction, dateRange]);
  useEffect(() => { loadStats(); }, []);

  const handleSearch = () => loadLogs(1, search, filterAction);

  const relativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const actionConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
    'user.role_changed':              { icon: <UserCog className="w-4 h-4" />,       label: 'Role Changed',         color: 'text-blue-400',    bg: 'bg-blue-500/15' },
    'user.deactivated':               { icon: <Ban className="w-4 h-4" />,           label: 'User Deactivated',     color: 'text-red-400',     bg: 'bg-red-500/15' },
    'user.activated':                  { icon: <CheckCircle className="w-4 h-4" />,   label: 'User Activated',       color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    'user.toggled_active':             { icon: <Power className="w-4 h-4" />,         label: 'Status Toggled',       color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    'user.impersonated':               { icon: <LogIn className="w-4 h-4" />,         label: 'User Impersonated',    color: 'text-violet-400',  bg: 'bg-violet-500/15' },
    'user.created':                    { icon: <Plus className="w-4 h-4" />,          label: 'Admin Created',        color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    'user.force_logout':               { icon: <Power className="w-4 h-4" />,         label: 'Force Logged Out',     color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    'user.force_logout_all':           { icon: <Power className="w-4 h-4" />,         label: 'Force Logout All',     color: 'text-red-400',     bg: 'bg-red-500/15' },
    'system.maintenance_enabled':      { icon: <AlertTriangle className="w-4 h-4" />, label: 'Maintenance On',       color: 'text-red-400',     bg: 'bg-red-500/15' },
    'system.maintenance_disabled':     { icon: <Power className="w-4 h-4" />,         label: 'Maintenance Off',      color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    'banner.created':                  { icon: <Megaphone className="w-4 h-4" />,     label: 'Banner Created',       color: 'text-blue-400',    bg: 'bg-blue-500/15' },
    'banner.updated':                  { icon: <Pencil className="w-4 h-4" />,        label: 'Banner Updated',       color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    'banner.deleted':                  { icon: <Trash2 className="w-4 h-4" />,        label: 'Banner Deleted',       color: 'text-red-400',     bg: 'bg-red-500/15' },
    'plan.overridden':                 { icon: <Sliders className="w-4 h-4" />,       label: 'Plan Overridden',      color: 'text-violet-400',  bg: 'bg-violet-500/15' },
  };

  const getCategory = (action: string) => {
    if (action.startsWith('user.')) return { label: 'User', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    if (action.startsWith('system.')) return { label: 'System', cls: 'bg-red-500/10 text-red-400 border-red-500/20' };
    if (action.startsWith('banner.')) return { label: 'Banner', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    if (action.startsWith('plan.')) return { label: 'Plan', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' };
    return { label: 'Other', cls: 'bg-[var(--sidebar)] text-[var(--muted)] border-[var(--border)]' };
  };

  const defaultCfg = { icon: <Activity className="w-4 h-4" />, label: '', color: 'text-[var(--muted)]', bg: 'bg-[var(--sidebar)]' };

  const topAction = stats.actionCounts?.[0];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--color-brand-500)]" /> Audit Log
          </h1>
          <p className="text-[var(--muted)] text-xs mt-0.5">Complete audit trail of all admin actions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (filterAction !== "all") params.set("action", filterAction);
            if (dateRange !== "all") params.set("dateRange", dateRange);
            const res = await apiFetch(`/admin/audit-logs/export?${params}`);
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'audit-logs.csv'; a.click();
              URL.revokeObjectURL(url);
            }
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={() => { loadLogs(page, search, filterAction); loadStats(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
            <RotateCcw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Total</p>
          <p className="text-lg font-bold mt-0.5">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Today</p>
          <p className="text-lg font-bold mt-0.5 text-emerald-400">{stats.today}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">This Week</p>
          <p className="text-lg font-bold mt-0.5 text-blue-400">{stats.thisWeek}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Admins</p>
          <p className="text-lg font-bold mt-0.5 text-violet-400">{stats.uniqueAdmins}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Top Action</p>
          <p className="text-xs font-bold mt-1 truncate text-amber-400">{topAction ? (actionConfig[topAction.action]?.label || topAction.action) : '—'}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") { setSearch(""); loadLogs(1, "", filterAction); } }} placeholder="Search actions, users, targets..." className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] transition-colors" />
        </div>
        <CustomSelect
          value={filterAction}
          onChange={setFilterAction}
          options={[{ value: "all", label: "All Actions" }]}
          groups={[
            { group: "User", items: [
              { value: "user.role_changed", label: "Role Changed" },
              { value: "user.activated", label: "Activated" },
              { value: "user.deactivated", label: "Deactivated" },
              { value: "user.toggled_active", label: "Status Toggled" },
              { value: "user.impersonated", label: "Impersonated" },
              { value: "user.created", label: "Admin Created" },
              { value: "user.force_logout", label: "Force Logout" },
            ]},
            { group: "System", items: [
              { value: "system.maintenance_enabled", label: "Maintenance On" },
              { value: "system.maintenance_disabled", label: "Maintenance Off" },
            ]},
            { group: "Banner", items: [
              { value: "banner.created", label: "Created" },
              { value: "banner.updated", label: "Updated" },
              { value: "banner.deleted", label: "Deleted" },
            ]},
            { group: "Plan", items: [
              { value: "plan.overridden", label: "Overridden" },
            ]},
          ]}
        />
        <CustomSelect
          value={dateRange}
          onChange={setDateRange}
          options={[
            { value: "all", label: "All Time" },
            { value: "today", label: "Today" },
            { value: "7d", label: "Last 7 Days" },
            { value: "30d", label: "Last 30 Days" },
            { value: "90d", label: "Last 90 Days" },
          ]}
        />
        <CustomSelect
          value={String(limit)}
          onChange={(v) => setLimit(parseInt(v))}
          options={[
            { value: "10", label: "10 / page" },
            { value: "25", label: "25 / page" },
            { value: "50", label: "50 / page" },
            { value: "100", label: "100 / page" },
          ]}
        />
        {(filterAction !== "all" || dateRange !== "all") && <button onClick={() => { setFilterAction("all"); setDateRange("all"); }} className="px-3 py-2 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold">Clear</button>}
        <button onClick={handleSearch} className="px-4 py-2 bg-[var(--color-brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-brand-600)] transition-colors">Search</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" /></div>
      ) : data.logs.length === 0 ? (
        <div className="text-center py-10 rounded-lg border border-dashed border-[var(--border)]">
          <Activity className="w-10 h-10 text-[var(--muted)] mx-auto mb-2 opacity-20" />
          <p className="text-[var(--muted)] text-sm font-medium">No entries found</p>
        </div>
      ) : (<>
        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-[var(--border)]" />
          <div className="space-y-0">
            {data.logs.map((log: any, idx: number) => {
              const cfg = actionConfig[log.action] || defaultCfg;
              const cat = getCategory(log.action);
              let details: any = {};
              try { details = log.details ? JSON.parse(log.details) : {}; } catch {}
              const hasDetails = Object.keys(details).length > 0;
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id} className={`relative flex items-start gap-2.5 py-1.5 px-2 rounded-lg transition-all cursor-pointer group ${isExpanded ? 'bg-[var(--sidebar)] border border-[var(--border)]' : 'hover:bg-[var(--sidebar)]/50'}`}
                  onClick={() => hasDetails && setExpandedId(isExpanded ? null : log.id)}>
                  <div className={`relative z-10 w-[30px] h-[30px] rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105`}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold">{cfg.label || log.action}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border ${cat.cls}`}>{cat.label}</span>
                      {log.targetLabel && (
                        <span className="text-xs bg-[var(--sidebar)] text-[var(--muted)] px-2 py-0.5 rounded-md font-mono truncate max-w-[220px] border border-[var(--border)]">{log.targetLabel}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-[var(--muted)]">by <strong className="text-[var(--foreground)]">{log.performerName || 'System'}</strong></span>
                      <span className="text-[10px] text-[var(--muted)] opacity-40">•</span>
                      <span className="text-[11px] text-[var(--muted)] flex items-center gap-1" title={new Date(log.createdAt).toLocaleString()}>
                        <Clock className="w-3 h-3 opacity-50" />{relativeTime(log.createdAt)}
                      </span>
                      {hasDetails && (
                        <>
                          <span className="text-[10px] text-[var(--muted)] opacity-40">•</span>
                          <span className="text-[10px] text-[var(--color-brand-500)] font-semibold">{isExpanded ? '▾ Details' : '▸ Details'}</span>
                        </>
                      )}
                    </div>

                    {/* Expandable details */}
                    {isExpanded && hasDetails && (
                      <div className="mt-1.5 p-2 rounded-md bg-[var(--background)] border border-[var(--border)] text-[10px] font-mono text-[var(--muted)] overflow-x-auto">
                        {Object.entries(details).map(([k, v]) => (
                          <div key={k} className="flex gap-2 py-0.5">
                            <span className="text-[var(--color-brand-500)] font-semibold shrink-0">{k}:</span>
                            <span className="text-[var(--foreground)] break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time badge (right side) */}
                  <span className="text-[10px] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 tabular-nums pt-1 font-mono">
                    {new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--muted)]">Page {page} of {data.totalPages} · {data.total} entries</p>
            <div className="flex items-center gap-1">
              <button onClick={() => loadLogs(page - 1, search, filterAction)} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--sidebar)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5" /> Prev</button>
              {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                let p: number;
                if (data.totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= data.totalPages - 2) p = data.totalPages - 4 + i;
                else p = page - 2 + i;
                return <button key={p} onClick={() => loadLogs(p, search, filterAction)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${p === page ? 'bg-[var(--color-brand-500)] text-white' : 'bg-[var(--sidebar)] hover:bg-[var(--border)]'}`}>{p}</button>;
              })}
              <button onClick={() => loadLogs(page + 1, search, filterAction)} disabled={page >= data.totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--sidebar)] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">Next <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}


// ─── Reports Tab ─────────────────────────────────────
function ReportsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<'users' | 'revenue' | 'collections' | 'orgs' | 'audit'>('users');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/admin/reports');
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-[var(--muted)]">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Failed to load report data</p>
      </div>
    );
  }

  const s = data.summary;
  const chartConfigs: Record<string, { label: string; data: number[]; color: string; prefix?: string }> = {
    users: { label: 'User Signups', data: data.userGrowth, color: 'var(--color-brand-500)' },
    revenue: { label: 'Revenue', data: data.revenueGrowth, color: '#10b981', prefix: '$' },
    collections: { label: 'Collections Created', data: data.collectionGrowth, color: '#8b5cf6' },
    orgs: { label: 'Teams Created', data: data.orgGrowth, color: '#f59e0b' },
    audit: { label: 'Admin Actions', data: data.auditActivity, color: '#ef4444' },
  };

  const chart = chartConfigs[activeChart];
  const chartMax = Math.max(...chart.data, 1);
  const chartTotal = chart.data.reduce((a: number, b: number) => a + b, 0);

  const planColors: Record<string, string> = { FREE: '#6b7280', PRO: 'var(--color-brand-500)', TEAM: '#f59e0b' };
  const totalPlanUsers = data.planDistribution.reduce((a: number, p: any) => a + p.count, 0) || 1;

  const kpiCards = [
    { label: 'Total Users', value: s.totalUsers, sub: `${s.signupsLast7d} this week`, icon: <Users className="w-5 h-5" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Active Users', value: s.activeUsers, sub: `${s.inactiveUsers} inactive`, icon: <CheckCircle className="w-5 h-5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Total Revenue', value: `$${s.totalRevenue.toFixed(0)}`, sub: `MRR: $${s.mrr.toFixed(0)}`, icon: <DollarSign className="w-5 h-5" />, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Collections', value: s.totalCollections, sub: `${s.totalOrgs} teams`, icon: <Building2 className="w-5 h-5" />, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Signups (30d)', value: s.signupsLast30d, sub: `${s.signupsLast7d} last 7 days`, icon: <TrendingUp className="w-5 h-5" />, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Payments', value: s.totalPayments, sub: 'completed', icon: <CreditCard className="w-5 h-5" />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Reports</h1>
          <p className="text-[var(--muted)] text-sm">Platform analytics and trends — last 12 months</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {kpiCards.map((k, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col gap-2">
            <div className={`w-9 h-9 rounded-lg ${k.bg} ${k.color} flex items-center justify-center`}>
              {k.icon}
            </div>
            <div>
              <p className="text-xl font-black">{k.value}</p>
              <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">{k.label}</p>
              <p className="text-[10px] text-[var(--muted)] mt-0.5">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-6">
        {/* Chart Tabs */}
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {Object.entries(chartConfigs).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setActiveChart(key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeChart === key
                  ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]'
              }`}
            >
              {cfg.label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-xs text-[var(--muted)] font-mono">
            Total: {chart.prefix || ''}{chartTotal.toLocaleString()}
          </span>
        </div>

        {/* Bar Chart */}
        <div className="flex items-end gap-1.5 h-[180px]">
          {chart.data.map((val: number, i: number) => {
            const pct = (val / chartMax) * 100;
            const monthLabel = data.months[i]?.slice(5) || '';
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] text-[var(--muted)] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  {chart.prefix || ''}{val}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md transition-all duration-500 hover:opacity-80 min-h-[2px]"
                    style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: chart.color }}
                  />
                </div>
                <span className="text-[9px] text-[var(--muted)] font-mono">{monthLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Row: Plan Distribution + Trend Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plan Distribution */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Plan Distribution</h3>
          {/* Stacked bar */}
          <div className="h-4 rounded-full overflow-hidden flex mb-4 bg-[var(--sidebar)]">
            {data.planDistribution.map((p: any) => (
              <div
                key={p.plan}
                style={{ width: `${(p.count / totalPlanUsers) * 100}%`, backgroundColor: planColors[p.plan] || '#6b7280' }}
                className="transition-all duration-500"
                title={`${p.plan}: ${p.count}`}
              />
            ))}
          </div>
          <div className="space-y-3">
            {data.planDistribution.map((p: any) => (
              <div key={p.plan} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: planColors[p.plan] || '#6b7280' }} />
                  <span className="text-sm font-semibold">{p.plan}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-[var(--muted)]">{p.count} users</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--sidebar)]">
                    {((p.count / totalPlanUsers) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trends Summary Table */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Monthly Trends</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--muted)] uppercase tracking-wider">
                  <th className="text-left py-2 font-semibold">Month</th>
                  <th className="text-right py-2 font-semibold">Users</th>
                  <th className="text-right py-2 font-semibold">Revenue</th>
                  <th className="text-right py-2 font-semibold">Collections</th>
                  <th className="text-right py-2 font-semibold">Orgs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.months.slice().reverse().slice(0, 6).map((m: string, i: number) => {
                  const idx = data.months.indexOf(m);
                  return (
                    <tr key={m} className="hover:bg-[var(--sidebar)] transition-colors">
                      <td className="py-2 font-mono font-semibold text-[var(--foreground)]">{m}</td>
                      <td className="text-right py-2 font-mono">{data.userGrowth[idx]}</td>
                      <td className="text-right py-2 font-mono text-emerald-400">${data.revenueGrowth[idx].toFixed(0)}</td>
                      <td className="text-right py-2 font-mono">{data.collectionGrowth[idx]}</td>
                      <td className="text-right py-2 font-mono">{data.orgGrowth[idx]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab (Feature Flags) ────────────────────
function SettingsTab({ flags, onReload }: { flags: any[]; onReload: () => void }) {
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setToggling(key);
    try {
      const res = await apiFetch(`/admin/feature-flags/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        toast.success(`${key} ${!currentEnabled ? "enabled" : "disabled"}`);
        onReload();
      } else {
        toast.error("Failed to update flag");
      }
    } catch { toast.error("Failed to update flag"); }
    setToggling(null);
  };

  const iconMap: Record<string, React.ReactNode> = {
    allow_signups: <Users className="w-4 h-4" />,
    allow_api_execution: <Activity className="w-4 h-4" />,
    show_pricing: <DollarSign className="w-4 h-4" />,
    allow_subscriptions: <CreditCard className="w-4 h-4" />,
    require_email_verification: <Shield className="w-4 h-4" />,
    allow_collection_upload: <Download className="w-4 h-4" />,
    allow_variable_upload: <Download className="w-4 h-4" />,
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold mb-0.5">Settings</h1>
        <p className="text-[var(--muted)] text-xs">Manage platform feature flags and configuration</p>
      </div>

      <div className="space-y-1.5">
        {flags.map(flag => (
          <div key={flag.key} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
            flag.enabled
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-[var(--border)] bg-[var(--sidebar)]"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                flag.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-[var(--border)] text-[var(--muted)]"
              }`}>
                {iconMap[flag.key] || <Settings className="w-4 h-4" />}
              </div>
              <div>
                <p className="font-semibold text-xs">{flag.label}</p>
                <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-tight">{flag.description}</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(flag.key, flag.enabled)}
              disabled={toggling === flag.key}
              className={`relative w-10 h-5.5 rounded-full transition-all duration-200 flex-shrink-0 ${
                flag.enabled ? "bg-emerald-500" : "bg-[var(--border)]"
              } ${toggling === flag.key ? "opacity-50" : ""}`}
              style={{ width: 40, height: 22 }}
            >
              <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                flag.enabled ? "translate-x-[21px]" : "translate-x-[3px]"
              }`} />
            </button>
          </div>
        ))}

        {flags.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)]">
            <Settings className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No feature flags configured</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Security Tab ────────────────────────────────────
function SecurityTab() {
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [lockedAccounts, setLockedAccounts] = useState<any[]>([]);
  const [policy, setPolicy] = useState({ minLength: 6, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecial: false });
  const [policyDirty, setPolicyDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false);
  const [secSettings, setSecSettings] = useState({ maxLoginAttempts: 5, sessionTimeoutMinutes: 1440, lockoutDurationMinutes: 30, requireEmailVerification: false });
  const [secDirty, setSecDirty] = useState(false);
  const [savingSec, setSavingSec] = useState(false);
  const [overview, setOverview] = useState<any>({ totalUsers: 0, activeUsers: 0, inactiveUsers: 0, failedAttemptUsers: 0, recentSecurityEvents: [] });

  const load = async () => {
    setLoading(true);
    try {
      const [sessRes, lockRes, polRes, secRes, ovRes] = await Promise.all([
        apiFetch("/admin/security/active-sessions"),
        apiFetch("/admin/security/locked-accounts"),
        apiFetch("/admin/security/password-policy"),
        apiFetch("/admin/security/settings"),
        apiFetch("/admin/security/overview"),
      ]);
      if (sessRes.ok) setActiveSessions(await sessRes.json());
      if (lockRes.ok) setLockedAccounts(await lockRes.json());
      if (polRes.ok) { const d = await polRes.json(); setPolicy(d); }
      if (secRes.ok) setSecSettings(await secRes.json());
      if (ovRes.ok) setOverview(await ovRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const { confirmDialog } = useDialog();

  const handleForceLogoutAll = async () => {
    if (!(await confirmDialog("This will invalidate ALL user sessions. Everyone will need to log in again. Continue?"))) return;
    setForceLogoutLoading(true);
    try {
      const res = await apiFetch("/admin/users/force-logout-all", { method: "POST" });
      if (res.ok) toast.success("All sessions invalidated");
      else toast.error("Failed to invalidate sessions");
    } catch { toast.error("Error"); }
    setForceLogoutLoading(false);
  };

  const handleUnlock = async (id: string) => {
    try {
      const res = await apiFetch(`/admin/users/${id}/unlock`, { method: "POST" });
      if (res.ok) { toast.success("Account unlocked"); load(); }
      else toast.error("Failed to unlock");
    } catch { toast.error("Error"); }
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      const res = await apiFetch("/admin/security/password-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (res.ok) { toast.success("Password policy updated"); setPolicyDirty(false); }
      else toast.error("Failed to update policy");
    } catch { toast.error("Error"); }
    setSavingPolicy(false);
  };

  const handleSaveSecSettings = async () => {
    setSavingSec(true);
    try {
      const res = await apiFetch("/admin/security/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(secSettings) });
      if (res.ok) { toast.success("Security settings updated"); setSecDirty(false); }
      else toast.error("Failed to save");
    } catch { toast.error("Error"); }
    setSavingSec(false);
  };

  const handleForceLogoutUser = async (userId: string, email: string) => {
    if (!(await confirmDialog(`Force logout ${email}?`))) return;
    try {
      const res = await apiFetch(`/admin/users/${userId}/force-logout`, { method: "POST" });
      if (res.ok) { toast.success(`Logged out ${email}`); load(); }
      else toast.error("Failed");
    } catch { toast.error("Error"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const policyScore = [policy.requireUppercase, policy.requireLowercase, policy.requireNumber, policy.requireSpecial].filter(Boolean).length;
  const strengthLabel = policyScore === 0 ? 'Weak' : policyScore <= 2 ? 'Medium' : policyScore <= 3 ? 'Strong' : 'Very Strong';
  const strengthColor = policyScore === 0 ? 'text-red-400' : policyScore <= 2 ? 'text-amber-400' : policyScore <= 3 ? 'text-blue-400' : 'text-emerald-400';
  const strengthBg = policyScore === 0 ? 'bg-red-400' : policyScore <= 2 ? 'bg-amber-400' : policyScore <= 3 ? 'bg-blue-400' : 'bg-emerald-400';
  const relTime = (d: string) => { if (!d) return '—'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return new Date(d).toLocaleDateString(); };
  const roleBadge = (r: string) => r === 'SUPER_ADMIN' ? 'bg-red-500/10 text-red-400 border-red-500/20' : r === 'ADMIN' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[var(--color-brand-500)]" /> Security & Control</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">Monitor sessions, manage lockouts, and configure security policies</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--sidebar)] hover:bg-[var(--border)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"><RotateCcw className="w-3 h-3" /> Refresh</button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Total Users</p>
          <p className="text-lg font-bold mt-0.5">{overview.totalUsers}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Active Now</p>
          <p className={`text-lg font-bold mt-0.5 ${activeSessions.length > 0 ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>{activeSessions.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Locked</p>
          <p className={`text-lg font-bold mt-0.5 ${lockedAccounts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{lockedAccounts.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Failed Logins</p>
          <p className={`text-lg font-bold mt-0.5 ${overview.failedAttemptUsers > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{overview.failedAttemptUsers}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Inactive</p>
          <p className={`text-lg font-bold mt-0.5 ${overview.inactiveUsers > 0 ? 'text-amber-400' : 'text-[var(--muted)]'}`}>{overview.inactiveUsers}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5" title={`Min ${policy.minLength} chars · ${policyScore}/4 rules enabled`}>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Policy</p>
          <p className="text-xs font-bold mt-0.5 whitespace-nowrap">{policy.minLength}ch · <span className={strengthColor}>{policyScore === 4 ? 'Max' : strengthLabel}</span></p>
          <div className="flex gap-0.5 mt-1">{[0,1,2,3].map(i => <div key={i} className={`w-4 h-1 rounded-full ${i < policyScore ? strengthBg : 'bg-[var(--border)]'}`} />)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Session Control */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-red-500/10"><LogOut className="w-3.5 h-3.5 text-red-400" /></div>
            <div><h3 className="font-semibold text-xs">Session Control</h3><p className="text-[10px] text-[var(--muted)]">Invalidate all active user sessions</p></div>
          </div>
          <button onClick={handleForceLogoutAll} disabled={forceLogoutLoading} className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {forceLogoutLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} Force Logout All Users
          </button>
          <p className="text-[10px] text-[var(--muted)] mt-1.5">All users will be required to sign in again. This action is logged.</p>
        </div>

        {/* Locked Accounts */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-amber-500/10"><Lock className="w-3.5 h-3.5 text-amber-400" /></div>
            <div><h3 className="font-semibold text-xs">Locked Accounts</h3><p className="text-[10px] text-[var(--muted)]">{lockedAccounts.length === 0 ? 'No locked accounts' : `${lockedAccounts.length} restricted`}</p></div>
          </div>
          {lockedAccounts.length === 0 ? (
            <div className="flex items-center justify-center py-4 rounded-lg border border-dashed border-[var(--border)]">
              <div className="text-center"><CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-1 opacity-40" /><p className="text-[10px] text-[var(--muted)]">All accounts in good standing</p></div>
            </div>
          ) : (
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {lockedAccounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-[var(--sidebar)]">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{acc.name || acc.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {!acc.isActive && <span className="text-[9px] px-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold">Deactivated</span>}
                      {acc.failedLoginAttempts >= 5 && <span className="text-[9px] px-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">{acc.failedLoginAttempts} failed</span>}
                    </div>
                  </div>
                  <button onClick={() => handleUnlock(acc.id)} className="shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1"><Unlock className="w-3 h-3" /> Unlock</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Password Policy */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[var(--color-brand-500)]/10"><KeyRound className="w-3.5 h-3.5 text-[var(--color-brand-500)]" /></div>
              <div><h3 className="font-semibold text-xs">Password Policy</h3><p className="text-[10px] text-[var(--muted)]">Enforce strength requirements</p></div>
            </div>
            <div className="flex items-center gap-1">{[0,1,2,3].map(i => <div key={i} className={`w-5 h-1 rounded-full ${i < policyScore ? strengthBg : 'bg-[var(--border)]'}`} />)}</div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Min Length</label>
                <span className="text-xs font-bold text-[var(--color-brand-500)]">{policy.minLength} chars</span>
              </div>
              <input type="range" min="4" max="32" value={policy.minLength} onChange={e => { setPolicy({...policy, minLength: parseInt(e.target.value)}); setPolicyDirty(true); }} className="w-full accent-[var(--color-brand-500)] h-1" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: 'requireUppercase', label: 'Uppercase (A-Z)', icon: 'Aa' },
                { key: 'requireLowercase', label: 'Lowercase (a-z)', icon: 'aa' },
                { key: 'requireNumber', label: 'Number (0-9)', icon: '01' },
                { key: 'requireSpecial', label: 'Special (!@#)', icon: '#!' },
              ].map(({ key, label, icon }) => {
                const active = (policy as any)[key];
                return (
                  <button key={key} onClick={() => { setPolicy({...policy, [key]: !active}); setPolicyDirty(true); }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all border ${active ? 'bg-[var(--color-brand-500)]/10 border-[var(--color-brand-500)]/30 text-[var(--color-brand-500)]' : 'bg-[var(--sidebar)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-brand-500)]/30'}`}>
                    <span className="text-[10px] font-bold font-mono w-5 opacity-50">{icon}</span>{label}
                    {active && <CheckCircle className="w-3 h-3 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
          {policyDirty && (
            <button onClick={handleSavePolicy} disabled={savingPolicy} className="w-full mt-3 py-1.5 rounded-lg bg-[var(--color-brand-500)] text-white text-xs font-semibold hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {savingPolicy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Policy
            </button>
          )}
        </div>

        {/* Active Sessions - updated */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10"><Globe className="w-3.5 h-3.5 text-emerald-400" /></div>
            <div><h3 className="font-semibold text-xs">Active Sessions <span className="text-[var(--muted)] font-normal">(24h)</span></h3><p className="text-[10px] text-[var(--muted)]">{activeSessions.length} recently</p></div>
          </div>
          {activeSessions.length === 0 ? (
            <div className="flex items-center justify-center py-4 rounded-lg border border-dashed border-[var(--border)]"><div className="text-center"><Globe className="w-5 h-5 text-[var(--muted)] mx-auto mb-1 opacity-20" /><p className="text-[10px] text-[var(--muted)]">No recent activity</p></div></div>
          ) : (
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {activeSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-[var(--sidebar)] hover:bg-[var(--border)]/50 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-[var(--border)] flex items-center justify-center text-[9px] font-bold shrink-0">{(s.name || s.email || '?')[0].toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate">{s.name || s.email}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold px-1 py-px rounded uppercase border ${roleBadge(s.role)}`}>{s.role?.replace('_', ' ') || 'USER'}</span>
                        {s.lastLoginIp && <span className="text-[9px] text-[var(--muted)] font-mono">{s.lastLoginIp}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-[var(--muted)]">{relTime(s.lastLoginAt)}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleForceLogoutUser(s.id, s.email); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-400 transition-all" title="Force logout"><LogOut className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Settings */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10"><Settings className="w-3.5 h-3.5 text-blue-400" /></div>
            <div><h3 className="font-semibold text-xs">Security Settings</h3><p className="text-[10px] text-[var(--muted)]">Login limits & session config</p></div>
          </div>
          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Max Login Attempts</label><span className="text-xs font-bold text-blue-400">{secSettings.maxLoginAttempts}</span></div>
              <input type="range" min="1" max="20" value={secSettings.maxLoginAttempts} onChange={e => { setSecSettings({...secSettings, maxLoginAttempts: parseInt(e.target.value)}); setSecDirty(true); }} className="w-full accent-blue-400 h-1" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Lockout Duration</label><span className="text-xs font-bold text-amber-400">{secSettings.lockoutDurationMinutes} min</span></div>
              <input type="range" min="1" max="1440" step="5" value={secSettings.lockoutDurationMinutes} onChange={e => { setSecSettings({...secSettings, lockoutDurationMinutes: parseInt(e.target.value)}); setSecDirty(true); }} className="w-full accent-amber-400 h-1" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Session Timeout</label><span className="text-xs font-bold text-emerald-400">{secSettings.sessionTimeoutMinutes >= 60 ? `${Math.floor(secSettings.sessionTimeoutMinutes / 60)}h` : `${secSettings.sessionTimeoutMinutes}m`}</span></div>
              <input type="range" min="5" max="10080" step="15" value={secSettings.sessionTimeoutMinutes} onChange={e => { setSecSettings({...secSettings, sessionTimeoutMinutes: parseInt(e.target.value)}); setSecDirty(true); }} className="w-full accent-emerald-400 h-1" />
            </div>
            <button onClick={() => { setSecSettings({...secSettings, requireEmailVerification: !secSettings.requireEmailVerification}); setSecDirty(true); }} className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${secSettings.requireEmailVerification ? 'bg-[var(--color-brand-500)]/10 border-[var(--color-brand-500)]/30 text-[var(--color-brand-500)]' : 'bg-[var(--sidebar)] border-[var(--border)] text-[var(--muted)]'}`}>
              <span>Require Email Verification</span>
              {secSettings.requireEmailVerification ? <CheckCircle className="w-3 h-3" /> : <Square className="w-3 h-3 opacity-40" />}
            </button>
          </div>
          {secDirty && (
            <button onClick={handleSaveSecSettings} disabled={savingSec} className="w-full mt-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSec ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Settings
            </button>
          )}
        </div>

        {/* Recent Security Events */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-violet-500/10"><Activity className="w-3.5 h-3.5 text-violet-400" /></div>
            <div><h3 className="font-semibold text-xs">Recent Security Events</h3><p className="text-[10px] text-[var(--muted)]">Latest security-related actions</p></div>
          </div>
          {overview.recentSecurityEvents?.length === 0 ? (
            <div className="flex items-center justify-center py-4 rounded-lg border border-dashed border-[var(--border)]"><p className="text-[10px] text-[var(--muted)]">No security events</p></div>
          ) : (
            <div className="space-y-1 max-h-[140px] overflow-y-auto">
              {overview.recentSecurityEvents?.map((ev: any) => (
                <div key={ev.id} className="flex items-center justify-between py-1 px-2 rounded-md bg-[var(--sidebar)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider shrink-0">{ev.action?.split('.').pop()?.replace(/_/g, ' ') || 'event'}</span>
                    <span className="text-[11px] text-[var(--muted)] truncate">{ev.performerName || 'System'} → {ev.targetLabel || '—'}</span>
                  </div>
                  <span className="text-[10px] text-[var(--muted)] shrink-0 ml-2">{relTime(ev.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
