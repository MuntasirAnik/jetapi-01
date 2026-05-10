"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useDialog } from "@/components/DialogProvider";
import {
  LayoutDashboard, Users, Building2, CreditCard, Sliders, ChevronLeft,
  Search, Shield, Trash2, UserCog, Crown, Save, RotateCcw, Edit3,
  DollarSign, ChevronRight, Smartphone, Calendar, Ban, CheckCircle,
} from "lucide-react";

type Tab = "overview" | "users" | "organizations" | "subscriptions" | "plans" | "payments";

export default function AdminPage() {
  const router = useRouter();
  const { confirmDialog } = useDialog();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Data
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (authorized) loadTabData();
  }, [tab, authorized]);

  const checkAccess = async () => {
    try {
      const res = await apiFetch("/admin/stats");
      if (res.ok) {
        setAuthorized(true);
        setStats(await res.json());
      } else {
        setAuthorized(false);
        toast.error("You don't have admin access");
        router.push("/");
      }
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async () => {
    try {
      switch (tab) {
        case "overview": {
          const res = await apiFetch("/admin/stats");
          if (res.ok) setStats(await res.json());
          break;
        }
        case "users": {
          const res = await apiFetch(`/admin/users${search ? `?search=${search}` : ""}`);
          if (res.ok) setUsers(await res.json());
          break;
        }
        case "organizations": {
          const res = await apiFetch("/admin/organizations");
          if (res.ok) setOrgs(await res.json());
          break;
        }
        case "subscriptions": {
          const res = await apiFetch("/admin/subscriptions");
          if (res.ok) setSubs(await res.json());
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
    const newRole = currentRole === "SUPER_ADMIN" ? "USER" : "SUPER_ADMIN";
    if (!(await confirmDialog(`Change role to ${newRole}?`))) return;
    const res = await apiFetch(`/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) { toast.success(`Role updated to ${newRole}`); loadTabData(); }
    else toast.error("Failed to update role");
  };

  const handleDeleteOrg = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete organization "${name}"? All members will be removed.`))) return;
    const res = await apiFetch(`/admin/organizations/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success(`Deleted ${name}`); loadTabData(); }
    else toast.error("Failed to delete organization");
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

  if (!authorized) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "organizations", label: "Organizations", icon: <Building2 className="w-4 h-4" /> },
    { id: "subscriptions", label: "Subscriptions", icon: <CreditCard className="w-4 h-4" /> },
    { id: "plans", label: "Plan Config", icon: <Sliders className="w-4 h-4" /> },
    { id: "payments", label: "Payments", icon: <DollarSign className="w-4 h-4" /> },
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

        <div className="mt-auto flex flex-col gap-2">
          <button
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              router.push("/login");
            }}
            className="text-sm text-red-400 hover:text-red-300 flex items-center gap-2 border-t border-[var(--border)] pt-4 px-2"
          >
            <ChevronLeft className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-5xl mx-auto px-6 py-5 sm:py-8">
          {tab === "overview" && <OverviewTab stats={stats} />}
          {tab === "users" && (
            <UsersTab
              users={users}
              search={search}
              setSearch={setSearch}
              onSearch={loadTabData}
              onDelete={handleDeleteUser}
              onToggleAdmin={handleToggleAdmin}
              onToggleActive={handleToggleActive}
            />
          )}
          {tab === "organizations" && <OrganizationsTab orgs={orgs} onDelete={handleDeleteOrg} />}
          {tab === "subscriptions" && <SubscriptionsTab subs={subs} onOverride={handleOverridePlan} />}
          {tab === "plans" && <PlansTab plans={plans} onReload={loadTabData} />}
          {tab === "payments" && <PaymentsTab data={payments} onReload={loadTabData} />}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────
function OverviewTab({ stats }: { stats: any }) {
  if (!stats) return null;

  const cards = [
    { label: "Total Users", value: stats.totalUsers, color: "text-blue-400" },
    { label: "Organizations", value: stats.totalOrgs, color: "text-emerald-400" },
    { label: "Collections", value: stats.totalCollections, color: "text-[var(--color-brand-500)]" },
    { label: "Active Subscriptions", value: stats.totalSubscriptions, color: "text-violet-400" },
    { label: "Total Revenue", value: `$${stats.totalRevenue || 0}`, color: "text-green-400" },
    { label: "Payments", value: stats.totalPayments || 0, color: "text-amber-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Platform Overview</h1>
      <p className="text-[var(--muted)] text-sm mb-5">System-wide metrics and status</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {cards.map((c, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider mb-1">{c.label}</p>
            <p className={`text-3xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {stats.planBreakdown?.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-3">Plan Distribution</h3>
          <div className="flex gap-4">
            {stats.planBreakdown.map((p: any) => (
              <div key={p.plan} className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.plan}</span>
                <span className="text-xs bg-[var(--sidebar)] text-[var(--foreground)] px-2 py-0.5 rounded-full font-bold">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────
function UsersTab({
  users, search, setSearch, onSearch, onDelete, onToggleAdmin, onToggleActive,
}: {
  users: any[]; search: string; setSearch: (s: string) => void;
  onSearch: () => void; onDelete: (id: string, email: string) => void;
  onToggleAdmin: (id: string, role: string) => void;
  onToggleActive: (id: string, email: string, isActive: boolean) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-[var(--muted)] text-sm mb-4">Manage all platform users</p>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Search by email or name..."
            className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)]"
          />
        </div>
        <button onClick={onSearch} className="px-4 py-2 bg-[var(--color-brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-brand-600)] transition-colors">
          Search
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Plan</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <tr key={u.id} className={`hover:bg-[var(--sidebar)] transition-colors ${u.isActive === false ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-brand-500)]/20 flex items-center justify-center text-[var(--color-brand-500)] text-xs font-bold uppercase">
                      {u.email?.substring(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium">{u.name || "—"}</p>
                      <p className="text-xs text-[var(--muted)]">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    u.role === "SUPER_ADMIN"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-[var(--sidebar)] text-[var(--muted)]"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${
                    u.isActive !== false
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}>
                    {u.isActive !== false ? <><CheckCircle className="w-3 h-3" /> Active</> : <><Ban className="w-3 h-3" /> Inactive</>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    u.plan === "FREE" ? "bg-[var(--sidebar)] text-[var(--foreground)]" :
                    u.plan === "PRO" ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)]" :
                    "bg-amber-500/20 text-amber-400"
                  }`}>
                    {u.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)] text-xs">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onToggleActive(u.id, u.email, u.isActive !== false)}
                      title={u.isActive !== false ? "Deactivate User" : "Activate User"}
                      className={`p-1.5 rounded transition-colors ${
                        u.isActive !== false
                          ? "hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400"
                          : "hover:bg-emerald-500/10 text-[var(--muted)] hover:text-emerald-400"
                      }`}
                    >
                      {u.isActive !== false ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => onToggleAdmin(u.id, u.role)}
                      title={u.role === "SUPER_ADMIN" ? "Revoke Admin" : "Make Admin"}
                      className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <UserCog className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No users found</div>
        )}
      </div>
    </div>
  );
}

// ─── Organizations Tab ───────────────────────────────
function OrganizationsTab({ orgs, onDelete }: { orgs: any[]; onDelete: (id: string, name: string) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Organizations</h1>
      <p className="text-[var(--muted)] text-sm mb-4">All teams on the platform</p>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sidebar)] text-[var(--muted)] text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">Organization</th>
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
          <div className="text-center py-8 text-[var(--muted)] text-sm">No organizations found</div>
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
                  <select
                    value={s.plan}
                    onChange={(e) => onOverride(s.userId, e.target.value)}
                    className="bg-[var(--sidebar)] border border-[var(--border)] rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-[var(--color-brand-500)]"
                  >
                    <option value="FREE">FREE</option>
                    <option value="PRO">PRO</option>
                    <option value="TEAM">TEAM</option>
                  </select>
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
