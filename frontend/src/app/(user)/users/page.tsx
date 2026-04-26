"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Users, Search, ChevronLeft, Loader2, Mail, Trash2, RefreshCw, Folder, UserCheck
} from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "@/components/DialogProvider";


export default function UsersPage() {
  const router = useRouter();
  const { confirmDialog } = useDialog();

  const [collections, setCollections] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"my-users" | "collaborators">("my-users");
  const [tabKey, setTabKey] = useState(0); // For re-triggering animations on tab switch
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const colRes = await apiFetch("/collections");
      if (colRes.ok) setCollections(await colRes.json());
      // Get current user ID from localStorage
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        setCurrentUserId(u?.id || null);
      } catch { setCurrentUserId(null); }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const mySharedUsers = useMemo(() => {
    const ownedCols = collections.filter(c => !c.ownerId || c.ownerId === currentUserId);
    const userMap = new Map<string, { user: any; collections: string[] }>();
    ownedCols.forEach(col => {
      (col.sharedUsers || []).forEach((su: any) => {
        if (!userMap.has(su.id)) userMap.set(su.id, { user: su, collections: [] });
        userMap.get(su.id)!.collections.push(col.name);
      });
    });
    return Array.from(userMap.values());
  }, [collections, currentUserId]);

  const collaborators = useMemo(() => {
    const sharedWithMe = collections.filter(c => c.ownerId && c.ownerId !== currentUserId);
    const userMap = new Map<string, { user: any; collections: string[]; role: string }>();
    sharedWithMe.forEach(col => {
      if (col.owner && col.owner.id !== currentUserId) {
        if (!userMap.has(col.owner.id)) userMap.set(col.owner.id, { user: col.owner, collections: [], role: "Owner" });
        userMap.get(col.owner.id)!.collections.push(col.name);
      }
      (col.sharedUsers || []).forEach((su: any) => {
        if (su.id !== currentUserId) {
          if (!userMap.has(su.id)) userMap.set(su.id, { user: su, collections: [], role: "Collaborator" });
          userMap.get(su.id)!.collections.push(col.name);
        }
      });
    });
    return Array.from(userMap.values());
  }, [collections, currentUserId]);

  const currentList = activeSection === "my-users" ? mySharedUsers : collaborators;

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase();
    return currentList.filter(({ user: u }) =>
      (u.name && u.name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q))
    );
  }, [currentList, searchQuery]);

  const handleRemoveUser = async (userId: string, userName: string) => {
    const confirmed = await confirmDialog(`Remove "${userName}" from all your collections?`);
    if (!confirmed) return;
    setRemovingUserId(userId);
    try {
      const ownedCols = collections.filter(c => !c.ownerId || c.ownerId === currentUserId);
      const colsWithUser = ownedCols.filter(col => (col.sharedUsers || []).some((su: any) => su.id === userId));
      await Promise.all(colsWithUser.map(col => apiFetch(`/collections/${col.id}/share/${userId}`, { method: "DELETE" })));
      toast.success(`Removed "${userName}" from ${colsWithUser.length} collection${colsWithUser.length > 1 ? 's' : ''}`);
      fetchData(false);
    } catch { toast.error("Failed to remove user."); }
    finally { setRemovingUserId(null); }
  };

  const switchTab = (tab: "my-users" | "collaborators") => {
    setActiveSection(tab);
    setSearchQuery("");
    setTabKey(prev => prev + 1);
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] font-sans">

      <div className="flex-1 overflow-auto">

        {/* Header */}
        <div className={`border-b border-[var(--border)] bg-[var(--sidebar)]/30 ${mounted ? 'anim-slide-up' : 'opacity-0'}`}>
          <div className="max-w-4xl mx-auto px-6 py-5">
            <button
              onClick={() => router.push("/profile")}
              className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--color-brand-500)] mb-4 transition-all duration-200 group"
            >
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform duration-200" /> Back to Profile
            </button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-purple-500 flex items-center justify-center shadow-md shadow-[var(--color-brand-500)]/15 hover:shadow-lg hover:shadow-[var(--color-brand-500)]/25 transition-shadow duration-300">
                  <Users className="w-4.5 h-4.5 text-white" />
                </div>
                <h1 className="text-lg font-bold">People</h1>
              </div>
              <button
                onClick={() => fetchData(false)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-medium hover:border-[var(--color-brand-500)]/50 hover:shadow-sm active:scale-95 transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 transition-transform duration-500 ${refreshing ? "animate-spin" : "group-hover:rotate-45"}`} /> Refresh
              </button>
            </div>
          </div>
        </div>

        <div className={`max-w-4xl mx-auto px-6 py-4 ${mounted ? 'anim-slide-up anim-delay-2' : 'opacity-0'}`}>
          {/* Tabs + Search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-md p-0.5 gap-0.5">
              <button
                onClick={() => switchTab("my-users")}
                className={`tab-transition flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold ${activeSection === "my-users"
                    ? "bg-[var(--color-brand-500)] text-white tab-active"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]"
                  }`}
              >
                <Users className="w-3 h-3" /> My Shared Users
                <span className={`text-[10px] px-1.5 rounded-full transition-colors duration-200 ${activeSection === "my-users" ? "bg-white/20" : "bg-[var(--sidebar)]"}`}>{mySharedUsers.length}</span>
              </button>
              <button
                onClick={() => switchTab("collaborators")}
                className={`tab-transition flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold ${activeSection === "collaborators"
                    ? "bg-[var(--color-brand-500)] text-white tab-active"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]"
                  }`}
              >
                <UserCheck className="w-3 h-3" /> Collaborators
                <span className={`text-[10px] px-1.5 rounded-full transition-colors duration-200 ${activeSection === "collaborators" ? "bg-white/20" : "bg-[var(--sidebar)]"}`}>{collaborators.length}</span>
              </button>
            </div>

            {currentList.length > 0 && (
              <div className="flex-1 relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] transition-colors duration-200" />
                <input
                  type="text"
                  placeholder="Filter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 text-xs outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px] focus:shadow-[var(--color-brand-500)]/10 transition-all duration-200 placeholder-[var(--muted)]"
                />
              </div>
            )}
          </div>

          {/* User List */}
          <div className="mt-4" key={tabKey}>
            {loading ? (
              /* Skeleton loader */
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? "border-b border-[var(--border)]" : ""}`}>
                    <div className="w-8 h-8 rounded-full skeleton shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-28 rounded skeleton" />
                      <div className="h-2.5 w-40 rounded skeleton" style={{ animationDelay: '0.15s' }} />
                    </div>
                    <div className="h-5 w-16 rounded-full skeleton" style={{ animationDelay: '0.3s' }} />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 anim-scale-in">
                <div className="w-12 h-12 rounded-full bg-[var(--sidebar)] flex items-center justify-center">
                  <Users className="w-6 h-6 text-[var(--muted)]" />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {searchQuery ? "No matches found" : activeSection === "my-users" ? "No shared users yet" : "No collaborators yet"}
                </p>
              </div>
            ) : (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden anim-scale-in">
                {filteredUsers.map(({ user, collections: colNames, role }, index) => {
                  const isRemoving = removingUserId === user.id;
                  const uniqueCols = [...new Set(colNames)];
                  return (
                    <div
                      key={user.id}
                      className={`anim-slide-up row-hover flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--sidebar)]/60 cursor-default ${index < filteredUsers.length - 1 ? "border-b border-[var(--border)]" : ""
                        }`}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      {/* Avatar */}
                      {user.avatarMimeType ? (
                        <img
                          src={`${apiUrl}/api/auth/users/${user.id}/avatar`}
                          alt=""
                          className="avatar-pop w-8 h-8 rounded-full object-cover border border-[var(--border)] shrink-0"
                        />
                      ) : (
                        <div className="avatar-pop w-8 h-8 rounded-full bg-[var(--color-brand-500)]/10 flex items-center justify-center text-[var(--color-brand-500)] font-bold text-[11px] uppercase border border-[var(--color-brand-500)]/15 shrink-0">
                          {(user.name || user.email || "?").substring(0, 2)}
                        </div>
                      )}

                      {/* Name + Email */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="user-name text-sm font-medium truncate">{user.name || "Unnamed"}</span>
                          {activeSection === "collaborators" && role && (
                            <span className={`text-[9px] uppercase font-bold px-1.5 py-px rounded-full shrink-0 transition-transform duration-200 hover:scale-105 ${role === "Owner" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                              }`}>{role}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--muted)] truncate block">{user.email}</span>
                      </div>

                      {/* Collection pills */}
                      <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end max-w-[35%]">
                        {uniqueCols.slice(0, 3).map((colName, idx) => (
                          <span key={idx} className="pill-lift inline-flex items-center gap-0.5 bg-[var(--sidebar)] border border-[var(--border)] text-[9px] font-semibold px-1.5 py-px rounded-full text-[var(--muted)] whitespace-nowrap cursor-default">
                            <Folder className="w-2 h-2" /> {colName}
                          </span>
                        ))}
                        {uniqueCols.length > 3 && (
                          <span className="text-[9px] text-[var(--muted)] font-medium">+{uniqueCols.length - 3}</span>
                        )}
                      </div>

                      {/* Remove button */}
                      {activeSection === "my-users" && (
                        <button
                          onClick={() => handleRemoveUser(user.id, user.name || user.email)}
                          disabled={isRemoving}
                          className="btn-spring flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-white hover:bg-red-500 border border-red-500/20 hover:border-red-500 px-2 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
