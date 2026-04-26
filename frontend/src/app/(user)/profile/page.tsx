"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { 
  User, LogOut, Layout, Folder, Activity, ChevronLeft, 
  ShieldCheck, Download, Import, Trash2, Users, UserPlus, X, Server, Upload, Search, Loader2
} from "lucide-react";
import { toast } from "react-toastify";
import { useAppContext } from "@/lib/AppContext";
import { ShieldAlert, Shield } from "lucide-react";
import ImportCollectionModal from "@/components/ImportCollectionModal";
import { useDialog } from "@/components/DialogProvider";

export default function UserDashboard() {
  const router = useRouter();
  const { activeOrganizationId } = useAppContext();
  const { confirmDialog } = useDialog();

  const [userRole, setUserRole] = useState("Member");
  const [profile, setProfile] = useState<any>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [avatarKey, setAvatarKey] = useState(Date.now());
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [shareEmails, setShareEmails] = useState<Record<string, string>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [sharingColId, setSharingColId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  
  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (activeOrganizationId && profile?.user?.id) {
       apiFetch(`/organizations/${activeOrganizationId}/users`)
         .then(res => res.json())
         .then(data => {
            if (Array.isArray(data)) {
               setAllUsers(data);
               const me = data.find((u: any) => u.id === profile.user.id);
               if (me && me.role) setUserRole(me.role);
            }
         }).catch(console.error);
    }
  }, [activeOrganizationId, profile?.user?.id]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileRes, colRes, sysUsersRes] = await Promise.all([
        apiFetch("/api/auth/me"),
        apiFetch("/collections"),
        apiFetch("/api/auth/users")
      ]);
      
      if (!profileRes.ok) throw new Error("Failed to load profile");
      const profileData = await profileRes.json();
      setProfile(profileData);
      
      if (colRes.ok) setCollections(await colRes.json());
      if (sysUsersRes.ok) setSystemUsers(await sysUsersRes.json());
      
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const refreshSystemUsers = async () => {
    try {
      const res = await apiFetch("/api/auth/users");
      if (res.ok) setSystemUsers(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3.5 * 1024 * 1024) {
      toast.error("Image must be smaller than 3.5MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiFetch("/api/auth/profile/avatar", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setProfile({ ...profile, user: data.user });
      localStorage.setItem("user", JSON.stringify(data.user));
      setAvatarKey(Date.now());
      toast.success("Profile image updated!");
      
      // Dispatch event so sidebar updates instantly
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to change password");
      toast.success("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ---- Collections Operations ----
  const handleExport = async (colId: string, colName: string) => {
    try {
      const res = await apiFetch(`/collections/${colId}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${colName.replace(/\\s+/g, '_').toLowerCase()}.postclone.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed.");
    }
  };

  // Replaced via custom ImportCollectionModal
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Deprecated logic
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete "${name}"? All requests in this collection will be permanently removed.`))) return;
    try {
      const res = await apiFetch(`/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Collection deleted");
      fetchData();
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err) {
      toast.error("Delete failed.");
    }
  };

  // ---- Access Control Operations ----
  const handleShare = async (colId: string) => {
    const email = shareEmails[colId];
    if (!email) return;
    setSharingColId(colId);
    try {
      const res = await apiFetch(`/collections/${colId}/share`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error((await res.json()).message || "Share failed");
      setShareEmails({ ...shareEmails, [colId]: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSharingColId(null);
    }
  };

  const handleUnshare = async (colId: string, userId: string) => {
    setRevokingUserId(userId);
    try {
      await apiFetch(`/collections/${colId}/share/${userId}`, { method: "DELETE" });
      toast.success("Access revoked");
      fetchData();
    } catch (err) {
      toast.error("Revoke failed.");
    } finally {
      setRevokingUserId(null);
    }
  };




  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
           <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand-500)]" />
           <span className="text-sm font-semibold">Loading Profile...</span>
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="p-8 flex items-center justify-center h-full w-full bg-[var(--background)]">
      <div className="bg-[var(--card)] border border-[var(--border)] p-6 rounded-xl flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
          <X className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">Session Error</h2>
          <p className="text-sm font-semibold text-red-500">{error}</p>
          <p className="text-xs text-[var(--muted)] mt-2">Your session may have expired or user data was wiped. Please sign out and log back in.</p>
        </div>
        <button onClick={handleLogout} className="bg-[var(--color-brand-500)] text-white w-full py-2 rounded font-bold text-sm hover:bg-[var(--color-brand-600)] transition-colors mt-2 flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Go to Login
        </button>
      </div>
    </div>
  );

  const { user, stats } = profile;
  const ownedCollections = collections.filter(c => !c.ownerId || c.ownerId === user.id);
  const sharedWithMe = collections.filter(c => c.ownerId && c.ownerId !== user.id);
  const manageableCollections = ownedCollections;

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] font-sans relative">
      
      {/* Background Overlay Spinner for Refreshes without wiping state */}
      {loading && profile && (
        <div className="absolute inset-0 z-50 bg-[var(--background)]/40 backdrop-blur-[1px] flex items-center justify-center">
           <div className="bg-[var(--card)] border border-[var(--border)] shadow-xl rounded-full p-3 flex items-center justify-center anim-scale-in">
             <Loader2 className="w-6 h-6 animate-spin text-[var(--color-brand-500)]" />
           </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col p-4 relative z-10">
        <div className="mb-8 pl-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="text-[var(--color-brand-500)]" /> <span className="truncate">{user.name || user.email.split('@')[0]}</span>
          </h1>
          <span className={`text-xs font-bold ml-8 flex items-center gap-1 capitalize ${userRole === 'OWNER' ? 'text-purple-500' : userRole === 'ADMIN' ? 'text-blue-500' : 'text-[var(--muted)]'}`}>
            {userRole === 'OWNER' ? <ShieldAlert className="w-3 h-3"/> : userRole === 'ADMIN' ? <Shield className="w-3 h-3"/> : <User className="w-3 h-3"/>}
            {userRole.toLowerCase()}
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          <button onClick={() => setActiveTab('overview')} className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'overview' ? 'bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm' : 'hover:bg-[var(--card)] text-[var(--muted)]'}`}>
            <Activity className="w-4 h-4" /> Overview
          </button>
          <button onClick={() => setActiveTab('collections')} className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'collections' ? 'bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm' : 'hover:bg-[var(--card)] text-[var(--muted)]'}`}>
            <Folder className="w-4 h-4" /> My Collections
          </button>
          {ownedCollections.length > 0 && (
            <button onClick={() => setActiveTab('access')} className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'access' ? 'bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm' : 'hover:bg-[var(--card)] text-[var(--muted)]'}`}>
              <Users className="w-4 h-4" /> Access Control
            </button>
          )}
          <button onClick={() => router.push('/users')} className="flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors hover:bg-[var(--card)] text-[var(--muted)]">
            <UserPlus className="w-4 h-4" /> Platform Users
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <button onClick={() => router.push("/")} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-2 border-t border-[var(--border)] pt-4 px-2">
            <ChevronLeft className="w-4 h-4" /> Back to App
          </button>
          <button onClick={handleLogout} className="text-sm text-red-500 hover:text-white hover:bg-red-500 flex items-center gap-2 px-2 py-2 rounded transition-colors mt-2">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-[var(--background)] p-8">
        
        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="max-w-4xl mx-auto anim-slide-up">
            <h2 className="text-2xl font-semibold mb-6">Profile Overview</h2>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-8 flex items-center gap-6">
              <div 
                className="relative w-24 h-24 bg-[var(--background)] rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--color-brand-500)] group cursor-pointer overflow-hidden transition-all hover:border-[var(--color-brand-500)]"
                onClick={() => avatarInputRef.current?.click()}
                title="Change Avatar"
              >
                {user.avatarMimeType ? (
                  <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/users/${user.id}/avatar?t=${avatarKey}`} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 group-hover:scale-110 transition-transform" />
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <Upload className="w-6 h-6 text-white" />
                </div>
              </div>
              <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarUpload} />
              <div>
                <h3 className="text-xl font-bold">{user.name || user.email.split('@')[0]}</h3>
                <p className="text-sm font-medium text-[var(--muted)] mb-1">{user.email}</p>
                <p className="text-[var(--muted)] text-sm mb-2">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--sidebar)] border border-[var(--border)] capitalize ${userRole === 'OWNER' ? 'text-purple-500' : userRole === 'ADMIN' ? 'text-blue-500' : 'text-[var(--foreground)]'}`}>
                    {userRole === 'OWNER' ? <ShieldAlert className="w-3 h-3"/> : userRole === 'ADMIN' ? <Shield className="w-3 h-3"/> : <User className="w-3 h-3"/>}
                    {userRole.toLowerCase()}
                  </span>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-4">Your Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 text-[var(--muted)] mb-2"><Server className="w-4 h-4"/> Workspaces</div>
                <div className="text-3xl font-bold">{stats.workspaces}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 text-[var(--muted)] mb-2"><Folder className="w-4 h-4"/> My Collections</div>
                <div className="text-3xl font-bold">{ownedCollections.length}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 text-[var(--muted)] mb-2"><Users className="w-4 h-4"/> Shared Collections</div>
                <div className="text-3xl font-bold">{sharedWithMe.length}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center gap-2 text-[var(--muted)] mb-2"><Activity className="w-4 h-4"/> Requests</div>
                <div className="text-3xl font-bold">{stats.requests}</div>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-8 mb-8">
              <h3 className="text-lg font-semibold mb-4">Security & Access</h3>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                 <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-[var(--color-brand-500)]" /> Change Password
                 </h4>
                 <form onSubmit={handleChangePassword} className="flex flex-col gap-4 max-w-sm">
                    <div>
                      <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">Current Password</label>
                      <input 
                        type="password" 
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)} 
                        className="w-full bg-[var(--background)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">New Password</label>
                      <input 
                        type="password" 
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)} 
                        className="w-full bg-[var(--background)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">Confirm New Password</label>
                      <input 
                        type="password" 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        className="w-full bg-[var(--background)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                        required 
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="bg-[var(--color-brand-500)] text-white font-bold py-2 mt-2 rounded hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50 text-sm"
                    >
                      {isChangingPassword ? "Updating..." : "Update Password"}
                    </button>
                 </form>
              </div>
            </div>

          </div>
        )}

        {/* TAB: COLLECTIONS */}
        {activeTab === 'collections' && (
          <div className="max-w-5xl mx-auto anim-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">My Collections</h2>
              <div className="flex gap-2">
                <button onClick={() => setIsImportModalOpen(true)} className="bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--sidebar)] px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors">
                  <Import className="w-4 h-4" /> Import JSON
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {ownedCollections.map(col => (
                <div key={col.id} className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-xl flex flex-col group hover:border-[var(--color-brand-500)]/50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <Folder className="text-[var(--color-brand-500)] w-4 h-4" /> {col.name}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-4 flex-1 flex items-center gap-3">
                    <span>{col.requestsCount || col.requests?.length || 0} APIs</span>
                    <span className="flex items-center gap-1 bg-[var(--sidebar)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[10px] font-semibold">
                      <Users className="w-3 h-3" /> {(col.sharedUsers?.length || 0) + 1} {(col.sharedUsers?.length || 0) + 1 === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                    <button onClick={() => handleExport(col.id, col.name)} className="px-3 py-1.5 flex items-center gap-1.5 bg-[var(--background)] hover:bg-[var(--sidebar)] border border-[var(--border)] rounded text-xs font-medium transition-colors">
                      <Download className="w-4 h-4" /> Export
                    </button>
                    <button
                      onClick={() => handleDeleteCollection(col.id, col.name)}
                      className="px-3 py-1.5 flex items-center gap-1.5 bg-[var(--background)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border border-[var(--border)] rounded text-xs font-medium text-[var(--muted)] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>
              ))}
              {ownedCollections.length === 0 && <div className="col-span-2 p-8 text-center text-[var(--muted)] border border-dashed border-[var(--border)] rounded-xl">No collections created yet.</div>}
            </div>

            <h3 className="text-lg font-semibold mb-4 text-[var(--muted)]">Shared With Me</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sharedWithMe.map(col => (
                <div key={col.id} className="bg-[var(--sidebar)] border border-[var(--border)] p-4 rounded-xl flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-500" />
                  <div>
                    <h4 className="font-medium text-sm">{col.name}</h4>
                    <p className="text-xs text-[var(--muted)]">Owner ID: {col.ownerId?.substring(0,8)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => handleExport(col.id, col.name)} className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)] rounded transition-colors" title="Export">
                      <Download className="w-4 h-4"/>
                    </button>

                  </div>
                </div>
              ))}
              {sharedWithMe.length === 0 && <div className="col-span-2 text-xs text-[var(--muted)]">No collections have been shared with you.</div>}
            </div>
          </div>
        )}

        {/* TAB: ACCESS CONTROL */}
        {activeTab === 'access' && (
          <div className="max-w-5xl mx-auto anim-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">Access Control</h2>
              <a href="/users" className="btn-spring flex items-center gap-1.5 text-xs font-medium bg-[var(--color-brand-500)] text-white px-3 py-1.5 rounded-lg hover:brightness-110">
                <Users className="w-3.5 h-3.5" /> View All Users
              </a>
            </div>

            <p className="text-[var(--muted)] text-sm mb-6">Manage who has access to each collection.</p>
            
            <div className="space-y-4">
              {manageableCollections.map(col => (
                <div key={col.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl">
                  <div className="bg-[var(--sidebar)] px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
                    <div className="font-semibold text-sm flex items-center gap-2"><Folder className="w-4 h-4 text-[var(--color-brand-500)]" /> {col.name}</div>
                    <div className="flex gap-2 relative">
                      <form 
                        onSubmit={e => {
                          e.preventDefault();
                          handleShare(col.id);
                        }}
                        className="flex gap-2 relative"
                      >
                        <div className="relative group/input">
                          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                             <Search className="w-3.5 h-3.5 text-[var(--muted)] group-focus-within/input:text-[var(--color-brand-500)] transition-colors" />
                          </div>
                          <input 
                            type="email" 
                            list={`sys-users-${col.id}`}
                            placeholder="Search user email..." 
                            className="text-xs bg-[var(--background)]/80 border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-500)]/10 w-64 shadow-inner transition-all font-medium placeholder-[var(--muted)]"
                            value={shareEmails[col.id] || ''}
                            onChange={(e) => setShareEmails({...shareEmails, [col.id]: e.target.value})}
                            onFocus={refreshSystemUsers}
                            required
                          />
                          <datalist id={`sys-users-${col.id}`}>
                            {systemUsers
                               .filter(u => u.id !== col.ownerId && !col.sharedUsers?.some((su:any) => su.id === u.id))
                               .map(u => (
                                 <option key={u.id} value={u.email} />
                               ))
                            }
                          </datalist>
                        </div>
                        <button type="submit" disabled={!shareEmails[col.id] || sharingColId === col.id} className="bg-[var(--color-brand-500)] text-white hover:brightness-110 px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 transition-all z-10 shadow-sm relative disabled:opacity-50 disabled:cursor-not-allowed min-w-[70px] justify-center">
                          {sharingColId === col.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><UserPlus className="w-3.5 h-3.5" /> Share</>}
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--background)]">
                    {col.sharedUsers?.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {col.sharedUsers.map((u: any) => (
                          <div key={u.id} className="flex items-center justify-between bg-[var(--sidebar)] px-3 py-2 border border-[var(--border)] rounded-md text-sm transition-colors hover:border-[var(--color-brand-500)]/30">
                            <div className="flex items-center gap-2 text-[var(--muted)]">
                              {u.avatarMimeType ? (
                                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/users/${u.id}/avatar`} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-[var(--border)] shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-[var(--background)] flex items-center justify-center border border-[var(--border)] shrink-0">
                                  <User className="w-3 h-3" />
                                </div>
                              )}
                              <span>{u.email}</span>
                                 <div className="inline-flex items-center gap-1.5 bg-[var(--sidebar)] px-2 py-0.5 rounded-full text-[10px] font-bold border border-[var(--border)] capitalize">
                                  {(() => {
                                    const actualRole = allUsers.find(au => au.id === u.id)?.role || 'MEMBER';
                                    const isOwner = actualRole === 'OWNER';
                                    const isAdmin = actualRole === 'ADMIN';
                                    return (
                                      <>
                                        {isOwner ? <ShieldAlert className="w-3 h-3 text-purple-500" /> : isAdmin ? <Shield className="w-3 h-3 text-blue-500" /> : <User className="w-3 h-3 text-[var(--muted)]" />}
                                        <span className={isOwner ? "text-purple-500" : isAdmin ? "text-blue-500" : "text-[var(--foreground)]"}>
                                          {actualRole.toLowerCase()}
                                        </span>
                                      </>
                                    );
                                  })()}
                                 </div>
                            </div>
                            <button onClick={() => handleUnshare(col.id, u.id)} disabled={revokingUserId === u.id} className="text-red-500 hover:text-white hover:bg-red-500 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Revoke Access">
                              {revokingUserId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted)] italic">Not shared with anyone.</p>
                    )}
                  </div>
                </div>
              ))}
              {manageableCollections.length === 0 && <div className="text-[var(--muted)] italic">No collections available to manage.</div>}
            </div>
          </div>
        )}

        <ImportCollectionModal 
          isOpen={isImportModalOpen} 
          onClose={() => setIsImportModalOpen(false)} 
          onSuccess={() => { fetchData(); window.dispatchEvent(new Event('postclone-refresh-sidebar')); }} 
        />

      </div>
    </div>
  );
}
