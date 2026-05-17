"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  User, LogOut, Folder, Activity,
  ShieldCheck, Users, X, Server, Upload, Loader2, Download, Import, Trash2, UserPlus, Search,
  Eye, EyeOff, Megaphone, Calendar, Mail, Clock, Edit3, Check,
  Zap, Rocket, Crown, Globe, Wifi,
} from "lucide-react";
import { toast } from "react-toastify";
import { useAppContext } from "@/lib/AppContext";
import { useDialog } from "@/components/DialogProvider";
import ImportCollectionModal from "@/components/ImportCollectionModal";
import UserSidebar from "@/components/UserSidebar";

export default function UserDashboard() {
  const router = useRouter();
  const { activeOrganizationId } = useAppContext();
  const { confirmDialog } = useDialog();

  const [activeTab, setActiveTab] = useState<'overview' | 'collections' | 'access'>('overview');
  const [userRole, setUserRole] = useState("Member");
  const [profile, setProfile] = useState<any>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarKey, setAvatarKey] = useState(Date.now());
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [shareEmails, setShareEmails] = useState<Record<string, string>>({});
  const [sharingColId, setSharingColId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSectionOpen, setPasswordSectionOpen] = useState(false);

  // Preferences
  const [announcementsOff, setAnnouncementsOff] = useState(false);

  useEffect(() => {
    setAnnouncementsOff(localStorage.getItem('jetapi_announcements_off') === 'true');
  }, []);

  useEffect(() => {
    if (activeOrganizationId && profile?.user?.id) {
      apiFetch(`/organizations/${activeOrganizationId}/users`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const me = data.find((u: any) => u.id === profile.user.id);
            if (me && me.role) setUserRole(me.role);
          }
        }).catch(console.error);
    }
  }, [activeOrganizationId, profile?.user?.id]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileRes, colRes, usageRes, subRes, sysUsersRes] = await Promise.all([
        apiFetch("/api/auth/me"),
        apiFetch("/collections"),
        apiFetch("/subscriptions/usage").catch(() => null),
        apiFetch("/subscriptions/current").catch(() => null),
        apiFetch("/api/auth/users").catch(() => null),
      ]);

      if (!profileRes.ok) throw new Error("Failed to load profile");
      const profileData = await profileRes.json();
      setProfile(profileData);

      if (colRes.ok) setCollections(await colRes.json());
      if (usageRes?.ok) setUsage(await usageRes.json());
      if (subRes?.ok) setSubscription(await subRes.json());
      if (sysUsersRes?.ok) setSystemUsers(await sysUsersRes.json());

    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleExport = async (colId: string, colName: string) => {
    try {
      const res = await apiFetch(`/collections/${colId}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${colName.replace(/\s+/g, '_').toLowerCase()}.postclone.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed."); }
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete "${name}"? All requests will be permanently removed.`))) return;
    try {
      const res = await apiFetch(`/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Collection deleted");
      fetchData();
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch { toast.error("Delete failed."); }
  };

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
    } catch (err: any) { toast.error(err.message); }
    finally { setSharingColId(null); }
  };

  const handleUnshare = async (colId: string, userId: string) => {
    setRevokingUserId(userId);
    try {
      await apiFetch(`/collections/${colId}/share/${userId}`, { method: "DELETE" });
      toast.success("Access revoked");
      fetchData();
    } catch { toast.error("Revoke failed."); }
    finally { setRevokingUserId(null); }
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
      setPasswordSectionOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsChangingPassword(false);
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
  const joinedDate = new Date(user.createdAt);
  const daysSinceJoined = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));

  const statCards = [
    {
      label: "Collections",
      value: ownedCollections.length,
      icon: Folder,
      gradient: "from-violet-500/20 to-purple-500/10",
      iconColor: "text-violet-400",
      borderColor: "border-violet-500/20",
    },
    {
      label: "Shared With Me",
      value: sharedWithMe.length,
      icon: Users,
      gradient: "from-blue-500/20 to-cyan-500/10",
      iconColor: "text-blue-400",
      borderColor: "border-blue-500/20",
    },
    {
      label: "API Requests",
      value: stats.requests,
      icon: Activity,
      gradient: "from-emerald-500/20 to-green-500/10",
      iconColor: "text-emerald-400",
      borderColor: "border-emerald-500/20",
    },
    {
      label: "Workspaces",
      value: stats.workspaces,
      icon: Server,
      gradient: "from-amber-500/20 to-orange-500/10",
      iconColor: "text-amber-400",
      borderColor: "border-amber-500/20",
    },
  ];

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] font-sans relative">

      {/* Background Overlay Spinner for Refreshes */}
      {loading && profile && (
        <div className="absolute inset-0 z-50 bg-[var(--background)]/40 backdrop-blur-[1px] flex items-center justify-center">
          <div className="bg-[var(--card)] border border-[var(--border)] shadow-xl rounded-full p-3 flex items-center justify-center anim-scale-in">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-brand-500)]" />
          </div>
        </div>
      )}

      <UserSidebar activePage="profile" userName={user.name || user.email.split('@')[0]} activeTab={activeTab} onTabChange={(t) => setActiveTab(t as any)} />

      <div className="flex-1 overflow-auto">
        {/* Banner */}
        <div className="relative h-32 bg-gradient-to-r from-[var(--color-brand-500)]/20 via-purple-500/15 to-blue-500/10">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <div className="w-20 h-20 rounded-full bg-[var(--card)] border-4 border-[var(--background)] flex items-center justify-center text-[var(--color-brand-500)] group cursor-pointer overflow-hidden shadow-lg hover:scale-105 transition-transform" onClick={() => avatarInputRef.current?.click()}>
              {user.avatarMimeType ? (<img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/users/${user.id}/avatar?t=${avatarKey}`} alt="" className="w-full h-full object-cover" />) : (<User className="w-8 h-8" />)}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Upload className="w-4 h-4 text-white" /></div>
            </div>
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarUpload} />

        <div className="max-w-4xl mx-auto px-8 pt-14 pb-10">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{user.name || user.email.split('@')[0]}</h1>
              <span className="px-2 py-0.5 rounded-full bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)] text-[10px] font-bold uppercase">{userRole}</span>
              {user.isActive !== false && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Online</span>}
            </div>
            <p className="text-sm text-[var(--muted)] mb-2">{user.email}</p>
            <div className="flex items-center gap-5 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {joinedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{daysSinceJoined} days</span>
            </div>
          </div>

          {/* Stat Pills */}
          <div className="flex gap-2.5 mb-8">
            {statCards.map((s) => { const I = s.icon; return (
              <div key={s.label} className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] flex-1 hover:border-[var(--color-brand-500)]/20 transition-colors">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center flex-shrink-0`}><I className={`w-4 h-4 ${s.iconColor}`} /></div>
                <div><div className="text-lg font-bold leading-tight">{s.value}</div><div className="text-[10px] text-[var(--muted)] font-medium">{s.label}</div></div>
              </div>); })}
          </div>

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (<div className="space-y-5">
          {/* Usage + Account */}
          <div className="grid grid-cols-3 gap-4">
          {usage && (<div className="col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-[var(--color-brand-500)]" />Plan Usage</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--sidebar)] border border-[var(--border)]">{usage.plan}</span>
                {usage.plan === 'FREE' && <button onClick={() => router.push('/pricing')} className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-[var(--color-brand-500)] text-white hover:brightness-110">Upgrade</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {[
                { label: 'Collections', val: usage.usage?.collections || 0, max: usage.limits?.maxCollections, c: '#6366f1' },
                { label: 'Environments', val: usage.usage?.environments || 0, max: usage.limits?.maxEnvironments, c: '#8b5cf6' },
                { label: 'Members', val: usage.usage?.members || 0, max: usage.limits?.maxMembers, c: '#3b82f6' },
                { label: 'Collaborators', val: usage.usage?.collaborators || 0, max: usage.limits?.maxCollaborators, c: '#10b981' },
              ].map((m) => { const u = m.max === -1; const p = u ? 8 : Math.min((m.val / (m.max || 1)) * 100, 100); return (
                <div key={m.label}><div className="flex justify-between mb-1"><span className="text-xs text-[var(--muted)]">{m.label}</span><span className="text-xs font-mono font-semibold">{m.val}{u ? '' : `/${m.max}`}</span></div>
                <div className="h-2 bg-[var(--sidebar)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, backgroundColor: p >= 100 ? '#ef4444' : m.c }} /></div></div>); })}
            </div>
          </div>)}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-[var(--color-brand-500)]" />Account</h3>
            <div className="space-y-3.5">
              {[
                { k: 'Status', v: user.isActive !== false ? 'Active' : 'Inactive', dot: user.isActive !== false ? 'bg-emerald-400' : 'bg-red-400' },
                { k: 'Role', v: user.role === 'SUPER_ADMIN' ? 'Admin' : 'User' },
                { k: 'Last Login', v: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' },
                { k: 'IP', v: user.lastLoginIp || '—', mono: true },
                ...(subscription ? [{ k: 'Plan', v: subscription.plan?.name || 'Free' }] : []),
              ].map((r: any) => (<div key={r.k} className="flex justify-between items-center"><span className="text-xs text-[var(--muted)]">{r.k}</span><span className={`text-xs font-medium flex items-center gap-1.5 ${r.mono ? 'font-mono' : ''}`}>{r.dot && <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />}{r.v}</span></div>))}
            </div>
          </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--color-brand-500)]" /> Security
              </h3>
              {!passwordSectionOpen ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-xs text-[var(--muted)] mb-3">Your account is secured with a password</p>
                  <button onClick={() => setPasswordSectionOpen(true)} className="text-xs font-semibold text-[var(--color-brand-500)] hover:underline flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Change Password
                  </button>
                </div>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-2.5">
                  {[
                    { label: 'Current', value: currentPassword, set: setCurrentPassword, show: showCurrentPassword, toggle: () => setShowCurrentPassword(!showCurrentPassword) },
                    { label: 'New', value: newPassword, set: setNewPassword, show: showNewPassword, toggle: () => setShowNewPassword(!showNewPassword) },
                    { label: 'Confirm', value: confirmPassword, set: setConfirmPassword, show: showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword) },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider mb-1 block">{f.label}</label>
                      <div className="relative">
                        <input type={f.show ? "text" : "password"} value={f.value} onChange={e => f.set(e.target.value)} className="w-full bg-[var(--sidebar)] border border-[var(--border)] p-2 pr-9 rounded-lg outline-none focus:border-[var(--color-brand-500)] text-sm" required />
                        <button type="button" onClick={f.toggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]">
                          {f.show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword} className="bg-[var(--color-brand-500)] text-white font-semibold py-2 px-4 rounded-lg hover:bg-[var(--color-brand-600)] transition-all disabled:opacity-50 text-xs flex items-center gap-1.5">
                      {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {isChangingPassword ? 'Updating...' : 'Update'}
                    </button>
                    <button type="button" onClick={() => { setPasswordSectionOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-2 rounded-lg hover:bg-[var(--sidebar)] transition-colors">Cancel</button>
                  </div>
                </form>
              )}
            </div>

          {/* Preferences */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[var(--color-brand-500)]" /> Preferences
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Announcements Bar</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">Show the scrolling strip below the top bar</p>
              </div>
              <button
                onClick={() => {
                  const newVal = !announcementsOff;
                  setAnnouncementsOff(newVal);
                  if (newVal) localStorage.setItem('jetapi_announcements_off', 'true');
                  else localStorage.removeItem('jetapi_announcements_off');
                  window.dispatchEvent(new Event('jetapi-announcements-toggle'));
                }}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${!announcementsOff ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--border)]'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${!announcementsOff ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          </div>

          </div>
          )}

          {/* TAB: COLLECTIONS */}
          {activeTab === 'collections' && (
          <div>

          {/* My Collections */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Folder className="w-4 h-4 text-[var(--color-brand-500)]" /> My Collections
              <button onClick={() => setIsImportModalOpen(true)} className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-md bg-[var(--sidebar)] border border-[var(--border)] hover:border-[var(--color-brand-500)]/30 text-[var(--muted)] hover:text-[var(--foreground)] transition-all flex items-center gap-1">
                <Import className="w-3 h-3" /> Import
              </button>
            </h3>
            {ownedCollections.length === 0 ? (
              <div className="bg-[var(--card)] border border-dashed border-[var(--border)] rounded-xl p-8 text-center text-sm text-[var(--muted)]">
                No collections created yet.
              </div>
            ) : (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                {ownedCollections.map((col, i) => (
                  <div key={col.id} className={`flex items-center justify-between px-5 py-3 hover:bg-[var(--sidebar)]/30 transition-colors ${i < ownedCollections.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-500)]/10 flex items-center justify-center flex-shrink-0">
                        <Folder className="w-4 h-4 text-[var(--color-brand-500)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{col.name}</p>
                        <p className="text-[11px] text-[var(--muted)]">
                          {col.requestsCount || col.requests?.length || 0} APIs · {(col.sharedUsers?.length || 0) + 1} members
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleExport(col.id, col.name)} className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors" title="Export">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteCollection(col.id, col.name)} className="p-1.5 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sharedWithMe.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-[var(--muted)] mb-2">Shared With Me</p>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                  {sharedWithMe.map((col, i) => (
                    <div key={col.id} className={`flex items-center justify-between px-5 py-3 ${i < sharedWithMe.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{col.name}</p>
                          <p className="text-[11px] text-[var(--muted)]">Shared with you</p>
                        </div>
                      </div>
                      <button onClick={() => handleExport(col.id, col.name)} className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors" title="Export">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          </div>
          )}

          {/* TAB: ACCESS CONTROL */}
          {activeTab === 'access' && (
          <div>

          {/* Access Control */}
          {ownedCollections.length > 0 ? (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--color-brand-500)]" /> Access Control
              </h3>
              <div className="space-y-3">
                {ownedCollections.map(col => (
                  <div key={col.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="bg-[var(--sidebar)]/50 px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <Folder className="w-4 h-4 text-[var(--color-brand-500)]" /> {col.name}
                      </div>
                      <form onSubmit={e => { e.preventDefault(); handleShare(col.id); }} className="flex gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                          <input
                            type="email"
                            list={`sys-users-${col.id}`}
                            placeholder="Email to share..."
                            className="text-xs bg-[var(--background)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 outline-none focus:border-[var(--color-brand-500)] w-56 font-medium placeholder-[var(--muted)]"
                            value={shareEmails[col.id] || ''}
                            onChange={(e) => setShareEmails({ ...shareEmails, [col.id]: e.target.value })}
                            required
                          />
                          <datalist id={`sys-users-${col.id}`}>
                            {systemUsers.filter(u => u.id !== col.ownerId && !col.sharedUsers?.some((su: any) => su.id === u.id)).map(u => (
                              <option key={u.id} value={u.email} />
                            ))}
                          </datalist>
                        </div>
                        <button type="submit" disabled={!shareEmails[col.id] || sharingColId === col.id} className="bg-[var(--color-brand-500)] text-white px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 disabled:opacity-50 min-w-[65px] justify-center">
                          {sharingColId === col.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><UserPlus className="w-3.5 h-3.5" /> Share</>}
                        </button>
                      </form>
                    </div>
                    <div className="p-3">
                      {col.sharedUsers?.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {col.sharedUsers.map((u: any) => (
                            <div key={u.id} className="flex items-center justify-between bg-[var(--sidebar)] px-3 py-2 border border-[var(--border)] rounded-md text-sm">
                              <div className="flex items-center gap-2 text-[var(--muted)]">
                                <div className="w-5 h-5 rounded-full bg-[var(--background)] flex items-center justify-center border border-[var(--border)] shrink-0">
                                  <User className="w-3 h-3" />
                                </div>
                                <span>{u.email}</span>
                              </div>
                              <button onClick={() => handleUnshare(col.id, u.id)} disabled={revokingUserId === u.id} className="text-red-500 hover:bg-red-500 hover:text-white p-1 rounded transition-colors disabled:opacity-50">
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
              </div>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-dashed border-[var(--border)] rounded-xl p-8 text-center text-sm text-[var(--muted)]">
              No collections available to manage.
            </div>
          )}

          </div>
          )}



        </div>

        <ImportCollectionModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => { fetchData(); window.dispatchEvent(new Event('postclone-refresh-sidebar')); }}
        />

      </div>
    </div>
  );
}
