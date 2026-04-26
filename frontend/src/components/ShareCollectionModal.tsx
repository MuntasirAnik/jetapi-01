"use client";
import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { Search, X, ShieldCheck, User as UserIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";

export default function ShareCollectionModal({ collectionId, collectionName, onClose, onUpdate }: { collectionId: string, collectionName: string, onClose: () => void, onUpdate?: () => void }) {
  const { confirmDialog } = useDialog();
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

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
      if (colRes.ok) setCollection(await colRes.json());
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
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to share collection");
      toast.success(`Shared with ${email}`);
      setSearchQuery("");
      fetchData(false); // Reload to get updated sharedUsers without showing generic overlay
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error(err.message);
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
      if (!res.ok) throw new Error("Failed to remove access");
      toast.success("Access removed.");
      fetchData(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error("Failed to remove access");
    } finally {
      setIsRemovingId(null);
    }
  };

  const sharedUserIds = useMemo(() => new Set((collection?.sharedUsers || []).map((u: any) => u.id)), [collection]);
  const ownerId = collection?.ownerId;

  // Filter users based on query. Exclude owner and already shared users from suggestions.
  const filteredUsers = useMemo(() => {
    if (!searchQuery || !Array.isArray(allUsers)) return [];
    const lowerQ = searchQuery.toLowerCase();
    
    // Explicitly fallback if user matching is excessively filtered
    const results = allUsers.filter(u => 
      !sharedUserIds.has(u.id) && 
      u.email && u.email.toLowerCase().includes(lowerQ)
    );
    return results.slice(0, 5); // max 5 suggestions
  }, [allUsers, searchQuery, sharedUserIds]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[var(--card)]/95 backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-[0_16px_60px_rgba(0,0,0,0.5)] w-full max-w-lg flex flex-col max-h-[85vh] modal-content">
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

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 relative">
          {loading && !collection && (
             <div className="absolute top-1 right-2 z-10 flex items-center bg-[var(--color-brand-500)] text-white px-3 py-1.5 rounded-md shadow-lg shadow-[var(--color-brand-500)]/20 animate-in fade-in slide-in-from-top-2">
               <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
               <span className="text-xs font-bold">Loading</span>
             </div>
          )}
          
          <div className={`flex flex-col gap-6 transition-opacity duration-300 ${loading && !collection ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <>
              {/* Search / Add User */}
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
                  
                  <button 
                    type="submit" 
                    disabled={saving || !searchQuery}
                    className="btn-spring bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
                  </button>
                </form>
              </div>

              {/* Current Access List */}
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] mb-3 uppercase tracking-wider">Current Access</label>
                <div className="flex flex-col gap-1.5 p-2 bg-[var(--background)]/50 border border-[var(--border)] rounded-xl shadow-inner">
                  
                  {/* Owner Row */}
                  <div className="flex items-center justify-between p-2.5 bg-[var(--sidebar)] border border-[var(--border)]/50 rounded-lg shadow-sm group">
                    <div className="flex items-center gap-3">
                       <div className="p-1.5 rounded-md bg-[var(--color-brand-500)]/10 border border-[var(--color-brand-500)]/20">
                         <ShieldCheck className="w-4 h-4 text-[var(--color-brand-500)]" />
                       </div>
                       <div className="text-sm font-semibold text-[var(--foreground)]">Workspace Owner</div>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] ring-1 ring-[var(--color-brand-500)]/20">Owner</span>
                  </div>
                  
                  {/* Shared Users */}
                  {collection?.sharedUsers?.length > 0 ? (
                    collection.sharedUsers.map((user: any) => (
                      <div key={user.id} className="flex items-center justify-between p-2.5 bg-[var(--card)] hover:bg-[var(--sidebar)] border border-[var(--border)]/30 rounded-lg shadow-sm transition-all group">
                        <div className="flex items-center gap-3">
                           <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                             <UserIcon className="w-4 h-4 text-blue-400" />
                           </div>
                           <div className="text-sm font-medium text-[var(--foreground)]">{user.email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">Viewer</span>
                          <button 
                            onClick={() => handleUnshare(user.id)}
                            disabled={isRemovingId === user.id}
                            className="p-1.5 rounded-md border border-transparent hover:border-red-500/30 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 text-[var(--muted)] transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                            title="Remove Access"
                          >
                            {isRemovingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
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
