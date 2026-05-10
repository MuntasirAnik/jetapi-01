import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { X, UserPlus, Trash2, ShieldCheck, Mail, Users, AlertCircle } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";

export default function TeamSettingsModal({ organizationId, onClose }: { organizationId: string, onClose: () => void }) {
  const { confirmDialog } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setCurrentUserEmail(JSON.parse(userStr).email);
      }

      const orgRes = await apiFetch(`/organizations/${organizationId}`);
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        setOrg(orgData);
        setEditName(orgData.name);
      }

      const res = await apiFetch(`/organizations/${organizationId}/users`);
      if (res.ok) setUsers(await res.json());

      // Fetch subscription plan limits
      try {
        const usageRes = await apiFetch(`/subscriptions/usage`);
        if (usageRes.ok) {
          setPlanData(await usageRes.json());
        }
      } catch { }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to invite user');
      }

      toast.success(`Invited ${inviteEmail} successfully!`);
      setInviteEmail("");
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!(await confirmDialog(`Are you sure you want to remove ${email} from the team?`))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/users/${userId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to remove user");
      toast.success(`Removed ${email}`);
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateName = async () => {
    if (!editName.trim() || editName === org?.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const res = await apiFetch(`/organizations/${organizationId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName })
      });
      if (!res.ok) throw new Error("Failed to update name");
      toast.success("Team renamed successfully");
      setIsEditingName(false);
      loadData(false);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const currentUserMembership = users.find(u => u.email === currentUserEmail);
  const isOwnerOrAdmin = currentUserMembership && ['OWNER', 'ADMIN'].includes(currentUserMembership.role);
  const isOwner = currentUserMembership && currentUserMembership.role === 'OWNER';

  const currentPlan = planData?.plan || 'FREE';
  const maxUsers = planData?.limits?.maxMembers || 1;
  const seatsUsed = users.length;
  const isAtLimit = maxUsers !== -1 && seatsUsed >= maxUsers;



  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden modal-content">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-sm font-semibold bg-[var(--background)] border border-[var(--border)] rounded px-2 py-0.5 focus:outline-none focus:border-[var(--color-brand-500)]"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateName(); if (e.key === 'Escape') setIsEditingName(false); }}
                    autoFocus
                  />
                  <button onClick={handleUpdateName} className="text-xs bg-[var(--color-brand-500)] text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setIsEditingName(false)} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { if (isOwnerOrAdmin) setIsEditingName(true); }}>
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">{org?.name} Settings</h2>
                  {isOwnerOrAdmin && <span className="text-[10px] text-[var(--color-brand-500)] opacity-0 group-hover:opacity-100 transition-opacity">Edit Rename</span>}
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">Manage your team and billing</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-[var(--sidebar)] hover:bg-[var(--border)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">

          {/* Billing Context */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Plan Details</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${currentPlan === 'FREE' ? 'bg-[var(--sidebar)] text-[var(--foreground)]' : 'bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)]'} border border-[var(--border)]`}>
                {currentPlan} PLAN
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2 font-medium">
                <span>Team Seats</span>
                <span>{seatsUsed} of {maxUsers === -1 ? '∞' : maxUsers} Used</span>
              </div>
              <div className="w-full bg-[var(--sidebar)] h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isAtLimit ? 'bg-red-500' : 'bg-[var(--color-brand-500)]'}`}
                  style={{ width: `${maxUsers === -1 ? 10 : Math.min((seatsUsed / maxUsers) * 100, 100)}%` }}
                />
              </div>

              {/* Max Members Control */}
              {isOwner && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)] font-medium">Max Team Members</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUpdateMaxMembers(maxUsers - 1)}
                      disabled={maxUsers <= 1 || maxUsers <= seatsUsed}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[var(--sidebar)] border border-[var(--border)] text-sm font-bold hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums">{maxUsers}</span>
                    <button
                      onClick={() => handleUpdateMaxMembers(maxUsers + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[var(--sidebar)] border border-[var(--border)] text-sm font-bold hover:bg-[var(--border)] transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {isAtLimit && (
                <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-400/10 p-2 rounded">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>You have reached the {maxUsers}-member limit. <a href="/pricing" className="underline font-semibold hover:text-red-300">Upgrade your plan</a> to add more members.</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)]"></div>

          {/* Invitation Flow */}
          {isOwnerOrAdmin && (
            <div className="opacity-60 cursor-not-allowed">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Invite Team Members</h3>
                <span className="text-[10px] bg-[var(--sidebar)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--muted)]">Coming Soon</span>
              </div>
              <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2 pointer-events-none">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    disabled={true}
                    placeholder="colleague@company.com"
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  disabled={true}
                  className="bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite
                </button>
              </form>
            </div>
          )}

          {/* User List */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Team Members List</h3>
            {loading ? (
              <div className="text-xs text-[var(--muted)] italic">Loading users...</div>
            ) : (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)] flex flex-col divide-y divide-[var(--border)]">
                {users.map(u => (
                  <div key={u.id} className="p-3 flex items-center justify-between hover:bg-[var(--sidebar)] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-brand-500)]/20 flex items-center justify-center text-[var(--color-brand-500)] font-bold text-xs uppercase border border-[var(--color-brand-500)]/30">
                        {u.email.substring(0, 2)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{u.email} {u.email === currentUserEmail && <span className="text-[10px] bg-[var(--foreground)] text-[var(--background)] px-1 rounded ml-1">You</span>}</span>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--muted)] mt-0.5">
                          {u.role === 'OWNER' && <ShieldCheck className="w-3 h-3 text-[var(--color-brand-500)]" />}
                          {u.role}
                        </div>
                      </div>
                    </div>

                    {/* Can only remove if not self-owner or if admin removing members */}
                    {isOwnerOrAdmin && (u.role !== 'OWNER' || users.length === 1) && u.email !== currentUserEmail && (
                      <button
                        onClick={() => handleRemove(u.id, u.email)}
                        className="p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                        title="Remove User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
