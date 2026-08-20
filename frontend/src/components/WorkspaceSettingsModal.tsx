"use client";
import { useState, useEffect, useRef } from "react";
import { apiFetch, getApiError } from "@/lib/api";
import { X, FolderGit2, Trash2, Users, UserPlus, Mail, Shield, ShieldCheck, Eye, ChevronDown, Check, Loader2, Crown } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";

const WS_ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  ADMIN: { label: 'Admin', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', icon: ShieldCheck },
  EDITOR: { label: 'Editor', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', icon: Shield },
  VIEWER: { label: 'Viewer', color: 'text-gray-400', bg: 'bg-gray-400/10 border-gray-400/20', icon: Eye },
};

function WsRoleDropdown({ currentRole, canChange, onChangeRole }: {
  currentRole: string;
  canChange: boolean;
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

  const config = WS_ROLE_CONFIG[currentRole] || WS_ROLE_CONFIG.EDITOR;

  if (!canChange) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border ${config.bg} ${config.color}`}>
        <config.icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  }

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
        <div className="absolute right-0 top-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1 min-w-[140px] overflow-hidden">
          {['ADMIN', 'EDITOR', 'VIEWER'].map(role => {
            const rc = WS_ROLE_CONFIG[role];
            const isActive = role === currentRole;
            return (
              <button
                key={role}
                onClick={() => { if (!isActive) onChangeRole(role); setOpen(false); }}
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

export default function WorkspaceSettingsModal({ workspaceId, organizationId, onClose }: { workspaceId: string, organizationId: string, onClose: () => void }) {
  const { confirmDialog } = useDialog();
  const [workspace, setWorkspace] = useState<any>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [orgUsers, setOrgUsers] = useState<any[]>([]);
  const [wsMembers, setWsMembers] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("EDITOR");
  const [adding, setAdding] = useState(false);

  const loadData = async () => {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const parsed = JSON.parse(userStr);
        setCurrentUserEmail(parsed.email);
        setCurrentUserId(parsed.id);
      }
      
      const res = await apiFetch(`/workspaces/${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkspace(data);
        setEditName(data.name);
      }

      const usersRes = await apiFetch(`/organizations/${organizationId}/users`);
      if (usersRes.ok) {
        setOrgUsers(await usersRes.json());
      }

      // Load workspace members
      try {
        const membersRes = await apiFetch(`/workspaces/${workspaceId}/members`);
        if (membersRes.ok) setWsMembers(await membersRes.json());
      } catch { }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const handleUpdateName = async () => {
    if (!editName.trim() || editName === workspace?.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName })
      });
      if (!res.ok) throw new Error("Failed to update workspace");
      toast.success("Workspace renamed successfully");
      setIsEditingName(false);
      loadData();
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!(await confirmDialog(`Are you sure you want to delete the workspace "${workspace?.name}"?`))) return;
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete workspace");
      toast.success("Workspace deleted");
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail) return;
    setAdding(true);
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole })
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to add member"));
      toast.success(`Added ${addEmail} as ${addRole}`);
      setAddEmail("");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (memberId: string, email: string) => {
    if (!(await confirmDialog(`Remove ${email} from this workspace?`))) return;
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove member");
      toast.success(`Removed ${email}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/members/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to change role"));
      toast.success("Role updated");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleVisibilityChange = async (visibility: string) => {
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility })
      });
      if (!res.ok) throw new Error("Failed to update visibility");
      toast.success(`Workspace visibility set to ${visibility}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const currentUserMembership = orgUsers.find(u => u.email === currentUserEmail);
  const isOwner = currentUserMembership && currentUserMembership.role === 'OWNER';
  const isOwnerOrAdmin = currentUserMembership && ['OWNER', 'ADMIN'].includes(currentUserMembership.role);

  const VISIBILITY_OPTIONS = [
    { value: 'TEAM', label: 'Team', desc: 'All team members can access', icon: Users },
    { value: 'PERSONAL', label: 'Personal', desc: 'Only invited members can access', icon: Shield },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 modal-backdrop">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] rounded-lg">
              <FolderGit2 className="w-5 h-5" />
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
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">{workspace?.name}</h2>
                  {isOwnerOrAdmin && (
                    <button className="p-1 rounded hover:bg-[var(--sidebar)] text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-colors" title="Rename workspace">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">Workspace Settings</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-[var(--sidebar)] hover:bg-[var(--border)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--background)]">
          {[
            { key: 'general', label: 'General', icon: FolderGit2 },
            { key: 'members', label: 'Members', icon: Users, count: wsMembers.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-[var(--color-brand-500)] text-[var(--color-brand-500)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[9px] bg-[var(--sidebar)] px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 bg-[var(--background)] flex-1 overflow-y-auto custom-scrollbar space-y-6">
          
          {activeTab === 'general' && (
            <>
              {/* Visibility */}
              {isOwnerOrAdmin && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Visibility</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {VISIBILITY_OPTIONS.map(opt => {
                      const isActive = workspace?.visibility === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleVisibilityChange(opt.value)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isActive
                              ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5'
                              : 'border-[var(--border)] hover:border-[var(--muted)] bg-[var(--card)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <opt.icon className={`w-4 h-4 ${isActive ? 'text-[var(--color-brand-500)]' : 'text-[var(--muted)]'}`} />
                            <span className="text-sm font-medium">{opt.label}</span>
                          </div>
                          <p className="text-[10px] text-[var(--muted)]">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-[var(--border)]"></div>

              {/* Danger Zone */}
              {isOwner && (
                <div>
                  <h3 className="text-sm font-semibold text-red-500 mb-3">Danger Zone</h3>
                  <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Delete Workspace</h4>
                        <p className="text-xs text-[var(--muted)]">Permanently remove this workspace and all its collections.</p>
                      </div>
                      <button 
                        onClick={handleDeleteWorkspace}
                        className="bg-red-500 text-white hover:bg-red-600 px-4 py-2 rounded text-xs font-semibold whitespace-nowrap"
                      >
                        Delete Workspace
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'members' && (
            <>
              {/* Add member form */}
              {isOwnerOrAdmin && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[var(--color-brand-500)]" />
                    Add Workspace Member
                  </h3>
                  <form onSubmit={handleAddMember} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
                      <input
                        type="email"
                        required
                        value={addEmail}
                        onChange={e => setAddEmail(e.target.value)}
                        disabled={adding}
                        placeholder="member@company.com"
                        className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] disabled:opacity-50"
                      />
                    </div>
                    <select
                      value={addRole}
                      onChange={e => setAddRole(e.target.value)}
                      className="bg-[var(--sidebar)] border border-[var(--border)] rounded py-2 px-2 text-xs font-medium focus:outline-none focus:border-[var(--color-brand-500)]"
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="ADMIN">Admin</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!addEmail || adding}
                      className="bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Add
                    </button>
                  </form>
                  <p className="text-[10px] text-[var(--muted)] mt-1.5">User must already be a team member to be added to a workspace.</p>
                </div>
              )}

              {/* Members List */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--muted)]" />
                  Workspace Members
                  {wsMembers.length > 0 && (
                    <span className="text-[10px] font-normal text-[var(--muted)] bg-[var(--sidebar)] px-1.5 py-0.5 rounded-full">{wsMembers.length}</span>
                  )}
                </h3>
                {wsMembers.length === 0 ? (
                  <div className="text-xs text-[var(--muted)] italic bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No specific members assigned.</p>
                    <p className="mt-1">
                      {workspace?.visibility === 'TEAM' 
                        ? 'All team members have Editor access by default.' 
                        : 'Add members to give them access to this workspace.'}
                    </p>
                  </div>
                ) : (
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)] flex flex-col divide-y divide-[var(--border)]">
                    {wsMembers.map((m: any) => {
                      const isSelf = m.userId === currentUserId;
                      const initials = (m.name || m.email).substring(0, 2).toUpperCase();
                      const config = WS_ROLE_CONFIG[m.role] || WS_ROLE_CONFIG.EDITOR;
                      return (
                        <div key={m.id} className="p-3 flex items-center justify-between hover:bg-[var(--sidebar)]/50 transition-colors group">
                          <div className="flex items-center gap-3 min-w-0">
                            {m.avatarMimeType ? (
                              <img src={`/api/users/${m.userId}/avatar`} alt="" className="w-8 h-8 rounded-full object-cover border border-[var(--border)]" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] uppercase border ${config.bg} ${config.color}`}>
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">{m.name || m.email.split('@')[0]}</span>
                                {isSelf && <span className="text-[9px] bg-[var(--foreground)] text-[var(--background)] px-1 py-px rounded font-bold shrink-0">You</span>}
                              </div>
                              <span className="text-[11px] text-[var(--muted)]">{m.email}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <WsRoleDropdown
                              currentRole={m.role}
                              canChange={!!isOwnerOrAdmin}
                              onChangeRole={(role) => handleChangeRole(m.id, role)}
                            />
                            {isOwnerOrAdmin && (
                              <button
                                onClick={() => handleRemoveMember(m.id, m.email)}
                                className="p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="Remove"
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

                {/* Info about implicit access */}
                {workspace?.visibility === 'TEAM' && (
                  <div className="mt-3 text-[11px] text-[var(--muted)] bg-[var(--sidebar)] rounded-lg p-3 flex items-start gap-2">
                    <Users className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-brand-500)]" />
                    <div>
                      <strong>Note:</strong> This workspace has <strong>Team</strong> visibility. All team members have implicit <strong>Editor</strong> access. Members listed above have explicitly assigned roles that override the default.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
