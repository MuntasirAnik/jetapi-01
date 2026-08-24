"use client";
import { useState, useEffect, useMemo } from "react";
import { apiFetch, getApiError } from "@/lib/api";
import { Search, X, ShieldCheck, User as UserIcon, Users as UsersIcon, Loader2, Trash2, Crown, ChevronDown, Shield, Edit3 } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";
import { useAppContext } from "@/lib/AppContext";

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer', icon: <UserIcon className="w-3 h-3" />, color: 'blue', description: 'Can view collection' },
  { value: 'editor', label: 'Editor', icon: <Edit3 className="w-3 h-3" />, color: 'amber', description: 'Can view & edit requests' },
  { value: 'admin', label: 'Admin', icon: <Shield className="w-3 h-3" />, color: 'purple', description: 'Can manage access & edit' },
];

function RoleSelector({ value, onChange, disabled }: { value: string, onChange: (role: string) => void, disabled?: boolean }) {
  const colorMap: Record<string, string> = {
    viewer: 'bg-blue-500/10 text-blue-400',
    editor: 'bg-amber-500/10 text-amber-400',
    admin: 'bg-purple-500/10 text-purple-400',
  };

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer appearance-auto ${colorMap[value] || colorMap.viewer} ${disabled ? 'opacity-60 cursor-default' : ''}`}
    >
      <option value="viewer">👁 Viewer</option>
      <option value="editor">✏️ Editor</option>
      <option value="admin">🛡 Admin</option>
    </select>
  );
}

export default function ShareCollectionModal({ collectionId, collectionName, onClose, onUpdate }: { collectionId: string, collectionName: string, onClose: () => void, onUpdate?: () => void }) {
  const { confirmDialog } = useDialog();
  const { organizations } = useAppContext();
  const [activeTab, setActiveTab] = useState<'people' | 'teams'>('people');
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Team states
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [inviteOrgRole, setInviteOrgRole] = useState<string>('viewer');

  useEffect(() => {
    fetchData();
  }, [collectionId]);

  const fetchData = async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true);
    try {
      const [colRes, usersRes] = await Promise.all([
        apiFetch(`/collections/${collectionId}`),
        apiFetch(`/api/auth/users`)
      ]);
      if (colRes.ok) {
        const data = await colRes.json();
        setCollection(data.collection || data);
      }
      if (usersRes.ok) setAllUsers(await usersRes.json());
    } catch (err) {
      console.error(err);
      toast.error("Failed to load access control data.");
    } finally {
      if (showLoadingState) setLoading(false);
    }
  };

  const handleShare = async (email: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole })
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to share collection")); return; }
      toast.success(`Shared with ${email} as ${inviteRole}`);
      setSearchQuery("");
      fetchData(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error(err.message || "Failed to share collection");
    } finally {
      setSaving(false);
    }
  };

  const handleUnshare = async (userId: string) => {
    if (!(await confirmDialog("Are you sure you want to remove this user's access?"))) return;
    setIsRemovingId(userId);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share/${userId}`, {
        method: "DELETE"
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to remove access")); return; }
      toast.success("Access removed.");
      fetchData(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error("Failed to remove access");
    } finally {
      setIsRemovingId(null);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    setChangingRoleId(targetUserId);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share/${targetUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to update role")); return; }
      toast.success(`Role updated to ${newRole}`);
      fetchData(false);
    } catch (err: any) {
      toast.error("Failed to update role");
    } finally {
      setChangingRoleId(null);
    }
  };

  // Team Share Handlers
  const handleShareOrg = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share-org`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrgId, role: inviteOrgRole })
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to share collection with team")); return; }
      const orgName = organizations.find((o: any) => o.id === selectedOrgId)?.name || selectedOrgId;
      toast.success(`Shared with team "${orgName}" as ${inviteOrgRole}`);
      fetchData(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error(err.message || "Failed to share collection with team");
    } finally {
      setSaving(false);
    }
  };

  const handleUnshareOrg = async (orgId: string) => {
    if (!(await confirmDialog("Are you sure you want to remove team access?"))) return;
    setIsRemovingId(orgId);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share-org/${orgId}`, {
        method: "DELETE"
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to remove team access")); return; }
      toast.success("Team access removed.");
      fetchData(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error("Failed to remove team access");
    } finally {
      setIsRemovingId(null);
    }
  };

  const handleOrgRoleChange = async (orgId: string, newRole: string) => {
    setChangingRoleId(orgId);
    try {
      const res = await apiFetch(`/collections/${collectionId}/share-org/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to update role")); return; }
      toast.success(`Team role updated to ${newRole}`);
      fetchData(false);
    } catch (err: any) {
      toast.error("Failed to update role");
    } finally {
      setChangingRoleId(null);
    }
  };

  const sharedUserIds = useMemo(() => new Set((collection?.sharedUsers || []).map((u: any) => u.id)), [collection]);
  const ownerId = collection?.ownerId;

  // Determine current user's permission level
  const currentUserId = typeof window !== 'undefined' ? (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; }
  })() : null;

  const isOwner = currentUserId === ownerId;
  const currentUserShare = (collection?.sharedUsers || []).find((u: any) => u.id === currentUserId);
  const canManageSharing = isOwner || currentUserShare?.shareRole === 'admin';

  // Filter users based on query
  const filteredUsers = useMemo(() => {
    if (!searchQuery || !Array.isArray(allUsers)) return [];
    const lowerQ = searchQuery.toLowerCase();
    const results = allUsers.filter(u => 
      !sharedUserIds.has(u.id) && 
      u.email && u.email.toLowerCase().includes(lowerQ)
    );
    return results.slice(0, 5);
  }, [allUsers, searchQuery, sharedUserIds]);

  const sharedOrgIds = useMemo(() => new Set((collection?.sharedOrganizations || []).map((o: any) => o.id)), [collection]);
  
  const availableOrgs = useMemo(() => {
    return (organizations || []).filter((org: any) => !sharedOrgIds.has(org.id));
  }, [organizations, sharedOrgIds]);

  // Adjust selectedOrgId when availableOrgs changes
  useEffect(() => {
    if (availableOrgs.length > 0) {
      setSelectedOrgId(availableOrgs[0].id);
    } else {
      setSelectedOrgId("");
    }
  }, [availableOrgs]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[var(--card)]/95 backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-[0_16px_60px_rgba(0,0,0,0.5)] w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden modal-content">
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-[var(--border)]/50 bg-[var(--sidebar)]/50 rounded-t-xl">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] drop-shadow-sm">Share Collection</h2>
            <p className="text-xs text-[var(--muted)] font-medium mt-0.5">{collectionName}</p>
          </div>
          <button onClick={onClose} className="btn-spring p-2 rounded-full hover:bg-[var(--color-brand-500)]/10 hover:text-[var(--color-brand-500)] text-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]/50 px-5 bg-[var(--sidebar)]/20">
          <button
            onClick={() => setActiveTab('people')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'people'
                ? 'border-[var(--color-brand-500)] text-[var(--color-brand-500)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            People
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'teams'
                ? 'border-[var(--color-brand-500)] text-[var(--color-brand-500)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <UsersIcon className="w-3.5 h-3.5" />
            Teams
          </button>
        </div>

        <div className="p-4 min-h-0 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative">
          {loading && !collection && (
             <div className="absolute top-1 right-2 z-10 flex items-center bg-[var(--color-brand-500)] text-white px-3 py-1.5 rounded-md shadow-lg shadow-[var(--color-brand-500)]/20 animate-in fade-in slide-in-from-top-2">
               <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
               <span className="text-xs font-bold">Loading</span>
             </div>
          )}
          
          <div className={`flex flex-col gap-6 transition-opacity duration-300 ${loading && !collection ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            {activeTab === 'people' && (
              <>
                {/* Search / Add User */}
                {canManageSharing && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Invite via Email</label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (searchQuery) handleShare(searchQuery);
                    }}
                    className="flex items-start gap-2"
                  >
                    <div className="relative group/input flex-1">
                      <div className="flex items-center bg-[var(--background)]/80 border border-[var(--border)] rounded-lg px-3 py-2.5 flex-1 focus-within:border-[var(--color-brand-500)] focus-within:ring-4 focus-within:ring-[var(--color-brand-500)]/10 transition-all shadow-inner">
                        <Search className="w-4 h-4 text-[var(--muted)] group-focus-within/input:text-[var(--color-brand-500)] transition-colors mr-2.5" />
                        <input 
                          type="email" 
                          list="user-emails-list"
                          placeholder="Search users by email..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          onFocus={async () => {
                            try {
                              const res = await apiFetch(`/api/auth/users`);
                              if (res.ok) setAllUsers(await res.json());
                            } catch {}
                          }}
                          className="bg-transparent border-none outline-none text-sm text-[var(--foreground)] w-full font-medium placeholder-[var(--muted)]"
                          required
                        />
                        <datalist id="user-emails-list">
                          {filteredUsers.map((user: any) => (
                            <option key={user.id} value={user.email} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    
                    {/* Role selector for invite */}
                    <RoleSelector value={inviteRole} onChange={setInviteRole} />

                    <button 
                      type="submit" 
                      disabled={saving || !searchQuery}
                      className="btn-spring bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
                    </button>
                  </form>
                </div>
                )}

                {!canManageSharing && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                    <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-[var(--muted)]">You have <strong className="text-amber-400">view-only</strong> access. Only the owner or admins can manage sharing.</p>
                  </div>
                )}

                {/* Current Access List */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] mb-3 uppercase tracking-wider">Current Access</label>
                  <div className="flex flex-col gap-1.5 p-2 bg-[var(--background)]/50 border border-[var(--border)] rounded-xl shadow-inner">
                    
                    {/* Owner */}
                    {collection?.owner && (
                      <div className="flex items-center justify-between p-2.5 bg-[var(--card)] border border-[var(--border)]/30 rounded-lg shadow-sm">
                        <div className="flex items-center gap-3">
                           <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                             <Crown className="w-4 h-4 text-amber-400" />
                           </div>
                           <div>
                             <div className="text-sm font-medium text-[var(--foreground)]">{collection.owner.email}</div>
                             {collection.owner.name && <div className="text-[10px] text-[var(--muted)]">{collection.owner.name}</div>}
                           </div>
                        </div>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">Owner</span>
                      </div>
                    )}

                    {/* Shared Users */}
                    {collection?.sharedUsers?.length > 0 ? (
                      collection.sharedUsers.map((user: any) => (
                        <div key={user.id} className="flex items-center justify-between p-2.5 bg-[var(--card)] hover:bg-[var(--sidebar)] border border-[var(--border)]/30 rounded-lg shadow-sm transition-all group">
                          <div className="flex items-center gap-3">
                             <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                               <UserIcon className="w-4 h-4 text-blue-400" />
                             </div>
                             <div>
                               <div className="text-sm font-medium text-[var(--foreground)]">{user.email}</div>
                               {user.name && <div className="text-[10px] text-[var(--muted)]">{user.name}</div>}
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {changingRoleId === user.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--muted)]" />
                            ) : (
                              <RoleSelector 
                                value={user.shareRole || 'viewer'} 
                                onChange={(newRole) => handleRoleChange(user.id, newRole)}
                                disabled={!canManageSharing}
                              />
                            )}
                            {canManageSharing && (
                            <button 
                              onClick={() => handleUnshare(user.id)}
                              disabled={isRemovingId === user.id}
                              className="p-1.5 rounded-md border border-transparent hover:border-red-500/30 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 text-[var(--muted)] transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                              title="Remove Access"
                            >
                              {isRemovingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-[var(--muted)] font-medium bg-[var(--background)]/30 rounded-lg border border-dashed border-[var(--border)] m-1">
                        No additional users have access to this collection.
                      </div>
                    )}
                    
                  </div>
                </div>
              </>
            )}

            {activeTab === 'teams' && (
              <>
                {/* Team sharing form */}
                {canManageSharing && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Share with a Team</label>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleShareOrg();
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="flex-1">
                        {availableOrgs.length > 0 ? (
                          <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            className="bg-[var(--background)]/80 border border-[var(--border)] rounded-lg px-3 py-2.5 w-full text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-500)]/10 transition-all font-medium"
                          >
                            {availableOrgs.map((org: any) => (
                              <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="px-3 py-2.5 bg-[var(--background)]/50 border border-[var(--border)] rounded-lg text-xs text-[var(--muted)] italic">
                            All your teams already have access
                          </div>
                        )}
                      </div>

                      <RoleSelector value={inviteOrgRole} onChange={setInviteOrgRole} />

                      <button
                        type="submit"
                        disabled={saving || !selectedOrgId}
                        className="btn-spring bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Share"}
                      </button>
                    </form>
                  </div>
                )}

                {!canManageSharing && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                    <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-[var(--muted)]">You have <strong className="text-amber-400">view-only</strong> access. Only the owner or admins can manage sharing.</p>
                  </div>
                )}

                {/* Team Access List */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] mb-3 uppercase tracking-wider">Team Access</label>
                  <div className="flex flex-col gap-1.5 p-2 bg-[var(--background)]/50 border border-[var(--border)] rounded-xl shadow-inner">
                    {collection?.sharedOrganizations?.length > 0 ? (
                      collection.sharedOrganizations.map((org: any) => (
                        <div key={org.id} className="flex items-center justify-between p-2.5 bg-[var(--card)] hover:bg-[var(--sidebar)] border border-[var(--border)]/30 rounded-lg shadow-sm transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-purple-500/10 border border-purple-500/20">
                              <UsersIcon className="w-4 h-4 text-purple-400" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-[var(--foreground)]">{org.name}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {changingRoleId === org.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--muted)]" />
                            ) : (
                              <RoleSelector
                                value={org.shareRole || 'viewer'}
                                onChange={(newRole) => handleOrgRoleChange(org.id, newRole)}
                                disabled={!canManageSharing}
                              />
                            )}
                            {canManageSharing && (
                              <button
                                onClick={() => handleUnshareOrg(org.id)}
                                disabled={isRemovingId === org.id}
                                className="p-1.5 rounded-md border border-transparent hover:border-red-500/30 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 text-[var(--muted)] transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                                title="Remove Team Access"
                              >
                                {isRemovingId === org.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-[var(--muted)] font-medium bg-[var(--background)]/30 rounded-lg border border-dashed border-[var(--border)] m-1">
                        No teams have access to this collection.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]/50 bg-[var(--sidebar)]/50 flex justify-end rounded-b-xl">
          <button 
            onClick={onClose}
            className="btn-spring px-5 py-2.5 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white text-sm font-bold rounded-lg shadow-lg hover:shadow-xl hover:shadow-[var(--color-brand-500)]/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
