import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { X, UserPlus, Trash2, ShieldCheck, Mail, Users, AlertCircle, Loader2, Clock, CheckCircle2, XCircle, RotateCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";
import { soundManager } from "@/lib/sound";

export default function TeamSettingsModal({ organizationId, onClose }: { organizationId: string, onClose: () => void }) {
  const { confirmDialog } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isTeamMuted, setIsTeamMuted] = useState(false);

  useEffect(() => {
    if (organizationId) {
      setIsTeamMuted(soundManager.isTeamMuted(organizationId));
    }
  }, [organizationId]);

  const handleToggleTeamSound = () => {
    const nextState = soundManager.toggleTeamMuted(organizationId);
    setIsTeamMuted(nextState);
    toast.info(
      nextState
        ? `Muted notification sound for ${org?.name || 'this team'}`
        : `Unmuted notification sound for ${org?.name || 'this team'}`,
      { autoClose: 1500 }
    );
  };

  const memberEmails = useMemo(() => new Set((users || []).filter((u: any) => u.status === 'ACCEPTED').map((u: any) => u.email)), [users]);

  const filteredUsers = useMemo(() => {
    if (!inviteEmail || !Array.isArray(allUsers)) return [];
    const lowerQ = inviteEmail.toLowerCase();
    const results = allUsers.filter(u => 
      !memberEmails.has(u.email) && 
      u.email && u.email.toLowerCase().includes(lowerQ)
    );
    return results.slice(0, 5);
  }, [allUsers, inviteEmail, memberEmails]);

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
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (email: string) => {
    setResendingEmail(email);
    try {
      const res = await apiFetch(`/organizations/${organizationId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to send invite');
      }
      toast.success(`Invitation sent to ${email}!`);
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResendingEmail(null);
    }
  };

  const handleRemove = async (userId: string, email: string, status: string) => {
    const promptMsg = status === 'PENDING' 
      ? `Are you sure you want to cancel the invitation for ${email}?`
      : status === 'REJECTED'
      ? `Are you sure you want to remove ${email} from the list?`
      : `Are you sure you want to remove ${email} from the team?`;
    if (!(await confirmDialog(promptMsg))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/users/${userId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to remove user");
      toast.success(status === 'PENDING' ? `Invitation cancelled for ${email}` : `Removed ${email}`);
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
  const seatsUsed = users.filter(u => u.status !== 'REJECTED').length;
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
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => { if (isOwnerOrAdmin) setIsEditingName(true); }}>
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">{org?.name} Settings</h2>
                  {isOwnerOrAdmin && (
                    <button className="p-1 rounded hover:bg-[var(--sidebar)] text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-colors" title="Rename team">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">Manage your team and billing</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-[var(--sidebar)] hover:bg-[var(--border)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 flex-1 overflow-y-auto">

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

              {isAtLimit && (
                <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-400/10 p-2 rounded">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>You have reached the {maxUsers}-member limit. <a href="/pricing" className="underline font-semibold hover:text-red-300">Upgrade your plan</a> to add more members.</p>
                </div>
              )}
            </div>
          </div>

          {/* Notifications & Sound Setting */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isTeamMuted ? 'bg-rose-500/10 text-rose-500' : 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]'}`}>
                {isTeamMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[var(--foreground)]">Team Notification Sound</h4>
                <p className="text-[11px] text-[var(--muted)]">
                  {isTeamMuted 
                    ? "Notification sounds are muted for this team"
                    : "Play chime sound when messages arrive in this team"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleTeamSound}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                !isTeamMuted ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--sidebar)] border border-[var(--border)]'
              }`}
              title={isTeamMuted ? "Unmute sound for this team" : "Mute sound for this team"}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  !isTeamMuted ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-[var(--border)]"></div>

          {/* Invitation Flow */}
          {isOwnerOrAdmin && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Invite Team Members</h3>
              </div>
              <form onSubmit={handleInvite} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
                  <input
                    type="email"
                    required
                    list="invite-emails-list"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onFocus={async () => {
                      try {
                        const res = await apiFetch(`/api/auth/users`);
                        if (res.ok) setAllUsers(await res.json());
                      } catch {}
                    }}
                    disabled={saving || isAtLimit}
                    placeholder="colleague@company.com"
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] disabled:opacity-50"
                  />
                  <datalist id="invite-emails-list">
                    {filteredUsers.map((user: any) => (
                      <option key={user.id} value={user.email} />
                    ))}
                  </datalist>
                </div>
                <button
                  type="submit"
                  disabled={saving || isAtLimit || !inviteEmail}
                  className="bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase border ${
                        u.status === 'PENDING'
                          ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                          : u.status === 'REJECTED'
                          ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                          : 'bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)] border-[var(--color-brand-500)]/30'
                      }`}>
                        {u.email?.substring(0, 2)}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${u.status === 'REJECTED' ? 'line-through opacity-60' : ''}`}>{u.email}</span>
                          {u.email === currentUserEmail && (
                            <span className="text-[10px] bg-[var(--foreground)] text-[var(--background)] px-1 rounded ml-0.5">You</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] mt-0.5">
                          <span className="flex items-center gap-1">
                            {u.role === 'OWNER' && <ShieldCheck className="w-3 h-3 text-[var(--color-brand-500)]" />}
                            {u.role}
                          </span>
                          <span>•</span>
                          {u.status === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                              <Clock className="w-2.5 h-2.5" /> Pending Invite
                            </span>
                          ) : u.status === 'REJECTED' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-medium">
                              <XCircle className="w-2.5 h-2.5" /> Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Resend / Re-invite button for pending or rejected users */}
                      {isOwnerOrAdmin && (u.status === 'PENDING' || u.status === 'REJECTED') && (
                        <button
                          onClick={() => handleResend(u.email)}
                          disabled={resendingEmail === u.email}
                          className="p-1.5 text-[var(--muted)] hover:bg-[var(--sidebar)] hover:text-[var(--color-brand-500)] rounded transition-colors disabled:opacity-50"
                          title={u.status === 'REJECTED' ? "Re-invite Member" : "Resend Invitation"}
                        >
                          {resendingEmail === u.email ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-brand-500)]" />
                          ) : (
                            <RotateCw className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Can only remove if not self-owner or if admin removing members */}
                      {isOwnerOrAdmin && (u.role !== 'OWNER' || users.length === 1) && u.email !== currentUserEmail && (
                        <button
                          onClick={() => handleRemove(u.id, u.email, u.status)}
                          className="p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                          title={u.status === 'PENDING' ? "Cancel Invitation" : u.status === 'REJECTED' ? "Remove Record" : "Remove User"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
