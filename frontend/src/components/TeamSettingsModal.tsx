"use client";
import { useState, useEffect, useRef } from "react";
import { apiFetch, getApiError } from "@/lib/api";
import { X, UserPlus, Trash2, ShieldCheck, Shield, Mail, Users, AlertCircle, Crown, ChevronDown, LogOut, Loader2, Check, Link2, Copy, Clock, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  OWNER: { label: 'Owner', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', icon: Crown },
  ADMIN: { label: 'Admin', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', icon: ShieldCheck },
  MEMBER: { label: 'Member', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', icon: Shield },
};

function RoleDropdown({ currentRole, isOwner, isAdmin, isSelf, onChangeRole }: {
  currentRole: string;
  isOwner: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  onChangeRole: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.MEMBER;

  // Determine which roles can be assigned
  const canChangeRole = !isSelf && (isOwner || (isAdmin && currentRole === 'MEMBER'));
  if (!canChangeRole) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border ${config.bg} ${config.color}`}>
        <config.icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  }

  const availableRoles = isOwner
    ? ['OWNER', 'ADMIN', 'MEMBER']
    : ['ADMIN', 'MEMBER']; // ADMIN can only toggle MEMBER ↔ ADMIN

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border cursor-pointer hover:brightness-125 transition-all ${config.bg} ${config.color}`}
      >
        <config.icon className="w-3 h-3" />
        {config.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1 min-w-[160px] overflow-hidden">
          {availableRoles.map(role => {
            const rc = ROLE_CONFIG[role];
            const isActive = role === currentRole;
            return (
              <button
                key={role}
                onClick={() => {
                  if (!isActive) onChangeRole(role);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'bg-[var(--sidebar)] text-[var(--foreground)]' : 'hover:bg-[var(--sidebar)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <rc.icon className={`w-3.5 h-3.5 ${rc.color}`} />
                <span className="flex-1 text-left">{rc.label}</span>
                {isActive && <Check className="w-3 h-3 text-[var(--color-brand-500)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TeamSettingsModal({ organizationId, onClose }: { organizationId: string, onClose: () => void }) {
  const { confirmDialog } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [inviteLinks, setInviteLinks] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [generatingLink, setGeneratingLink] = useState(false);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        setCurrentUserEmail(parsed.email);
        setCurrentUserId(parsed.id);
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

      // Fetch invite links
      try {
        const linksRes = await apiFetch(`/organizations/${organizationId}/invite-links`);
        if (linksRes.ok) setInviteLinks(await linksRes.json());
      } catch { }

      // Fetch pending invitations
      try {
        const invRes = await apiFetch(`/organizations/${organizationId}/invitations`);
        if (invRes.ok) setPendingInvitations(await invRes.json());
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
    setInviting(true);
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

      toast.success(`Invitation sent to ${inviteEmail}. They need to accept it to join.`);
      setInviteEmail("");
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!(await confirmDialog(`Are you sure you want to remove ${email} from the team?`))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/users/${userId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to remove user"));
      toast.success(`Removed ${email}`);
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string, email: string) => {
    if (newRole === 'OWNER') {
      const confirmed = await confirmDialog(
        `Are you sure you want to transfer ownership to ${email}? You will be demoted to Admin.`
      );
      if (!confirmed) return;
    }
    try {
      const res = await apiFetch(`/organizations/${organizationId}/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to change role"));
      toast.success(`Changed ${email}'s role to ${ROLE_CONFIG[newRole]?.label || newRole}`);
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLeaveTeam = async () => {
    if (!(await confirmDialog("Are you sure you want to leave this team? You will lose access to all shared resources."))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/leave`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to leave team"));
      toast.success("You have left the team.");
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      onClose();
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

  const handleGenerateInviteLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await apiFetch(`/organizations/${organizationId}/invite-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 7 })
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to generate invite link"));
      toast.success("Invite link generated!");
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied to clipboard!");
  };

  const handleRevokeLink = async (linkId: string) => {
    if (!(await confirmDialog("Revoke this invite link? Anyone with the link will no longer be able to join."))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/invite-links/${linkId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke link");
      toast.success("Invite link revoked");
      loadData(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!(await confirmDialog(`Cancel the invitation to ${email}?`))) return;
    try {
      const res = await apiFetch(`/organizations/${organizationId}/invitations/${invitationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel invitation");
      toast.success("Invitation cancelled");
      loadData(false);
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

  // Sort: OWNER first, then ADMIN, then MEMBER
  const sortedUsers = [...users].sort((a, b) => {
    const order: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
    return (order[a.role] || 3) - (order[b.role] || 3);
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden modal-content">
        {/* Header */}
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
              <p className="text-xs text-[var(--muted)]">Manage your team members and roles</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-[var(--sidebar)] hover:bg-[var(--border)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">

          {/* Plan / Billing Context */}
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

          {/* Invite Section */}
          {isOwnerOrAdmin && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[var(--color-brand-500)]" />
                Invite Team Members
              </h3>
              <form onSubmit={handleInvite} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    disabled={isAtLimit || inviting}
                    placeholder="colleague@company.com"
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] disabled:opacity-50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAtLimit || !inviteEmail || inviting}
                  className="bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Invite
                </button>
              </form>
              {isAtLimit && (
                <p className="text-[11px] text-red-400 mt-1.5">Seat limit reached. Upgrade your plan or remove a member to invite someone new.</p>
              )}
            </div>
          )}

          {/* Invite Link Section */}
          {isOwnerOrAdmin && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[var(--color-brand-500)]" />
                  Invite Link
                </h3>
                <button
                  onClick={handleGenerateInviteLink}
                  disabled={generatingLink}
                  className="text-[11px] font-medium text-[var(--color-brand-500)] hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  {generatingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                  Generate New Link
                </button>
              </div>
              {inviteLinks.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">No active invite links. Generate one to share with your team.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {inviteLinks.map((link: any) => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${link.token}`;
                    const expiresText = link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Never expires';
                    const usageText = link.maxUses > 0 ? `${link.usedCount}/${link.maxUses} uses` : `${link.usedCount} uses`;
                    return (
                      <div key={link.id} className="flex items-center gap-2 bg-[var(--background)] rounded p-2.5 border border-[var(--border)] group">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-[var(--foreground)] truncate">{url}</div>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] mt-1">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{expiresText}</span>
                            <span>·</span>
                            <span>{usageText}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopyLink(link.token)}
                          className="p-1.5 text-[var(--muted)] hover:text-[var(--color-brand-500)] hover:bg-[var(--sidebar)] rounded transition-colors"
                          title="Copy link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRevokeLink(link.id)}
                          className="p-1.5 text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="Revoke link"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pending Invitations */}
          {isOwnerOrAdmin && pendingInvitations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                Pending Invitations
                <span className="text-[10px] font-normal text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">{pendingInvitations.length}</span>
              </h3>
              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)] flex flex-col divide-y divide-[var(--border)]">
                {pendingInvitations.map((inv: any) => {
                  const sentDate = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const expiresDate = inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
                  return (
                    <div key={inv.id} className="p-3 flex items-center justify-between hover:bg-[var(--sidebar)]/50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-400 text-xs font-bold border border-amber-400/20">
                          <Mail className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{inv.email}</div>
                          <div className="text-[10px] text-[var(--muted)] flex items-center gap-1.5 mt-0.5">
                            <span>Sent {sentDate}</span>
                            {expiresDate && <><span className="opacity-30">·</span><span>Expires {expiresDate}</span></>}
                            <span className="opacity-30">·</span>
                            <span className="text-amber-400">{inv.role}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(inv.id, inv.email)}
                        className="p-1.5 text-[var(--muted)] hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Cancel invitation"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-[var(--border)]"></div>

          {/* Member List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--muted)]" />
                Team Members
                <span className="text-[10px] font-normal text-[var(--muted)] bg-[var(--sidebar)] px-1.5 py-0.5 rounded-full">{users.length}</span>
              </h3>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-[var(--muted)] italic py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading members...
              </div>
            ) : (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)] flex flex-col divide-y divide-[var(--border)]">
                {sortedUsers.map(u => {
                  const isSelf = u.id === currentUserId;
                  const config = ROLE_CONFIG[u.role] || ROLE_CONFIG.MEMBER;
                  const initials = (u.name || u.email).substring(0, 2).toUpperCase();
                  const joinDate = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

                  return (
                    <div key={u.id} className="p-3.5 flex items-center justify-between hover:bg-[var(--sidebar)]/50 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        {u.avatarMimeType ? (
                          <img
                            src={`/api/users/${u.id}/avatar`}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover border border-[var(--border)]"
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase border ${config.bg} ${config.color}`}>
                            {initials}
                          </div>
                        )}
                        {/* Info */}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{u.name || u.email.split('@')[0]}</span>
                            {isSelf && <span className="text-[9px] bg-[var(--foreground)] text-[var(--background)] px-1 py-px rounded font-bold shrink-0">You</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] mt-0.5">
                            <span className="truncate">{u.email}</span>
                            {joinDate && (
                              <>
                                <span className="opacity-30">·</span>
                                <span className="shrink-0">Joined {joinDate}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <RoleDropdown
                          currentRole={u.role}
                          isOwner={!!isOwner}
                          isAdmin={currentUserMembership?.role === 'ADMIN'}
                          isSelf={isSelf}
                          onChangeRole={(role) => handleChangeRole(u.id, role, u.email)}
                        />

                        {/* Remove button */}
                        {isOwnerOrAdmin && !isSelf && u.role !== 'OWNER' && (
                          <button
                            onClick={() => handleRemove(u.id, u.email)}
                            className="p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove from team"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leave Team (for non-owners) */}
          {currentUserMembership && currentUserMembership.role !== 'OWNER' && (
            <div className="border-t border-[var(--border)] pt-4">
              <button
                onClick={handleLeaveTeam}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded transition-colors font-medium"
              >
                <LogOut className="w-4 h-4" />
                Leave Team
              </button>
              <p className="text-[11px] text-[var(--muted)] mt-1 ml-1">You will lose access to all shared workspaces and collections.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
