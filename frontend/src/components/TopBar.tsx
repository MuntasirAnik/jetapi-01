"use client";
import { apiFetch } from '@/lib/api';
import StyledSelect from './StyledSelect';
import { useState, useEffect, useRef } from "react";
import { Settings, ShieldCheck, User as UserIcon, Server, ChevronDown, Check, Plus, Search, Trash2, Users, Folder, Bell, LogOut, CreditCard, BarChart3, Palette, ExternalLink } from "lucide-react";
import dynamic from 'next/dynamic';
const EnvironmentManager = dynamic(() => import('./EnvironmentManager'), { ssr: false });
const TeamSettingsModal = dynamic(() => import('./TeamSettingsModal'), { ssr: false });
const WorkspaceSettingsModal = dynamic(() => import('./WorkspaceSettingsModal'), { ssr: false });
import { useDialog } from "./DialogProvider";
import JetLogo from "./JetLogo";
import ThemeToggle from "./ThemeToggle";
import { useAppContext } from "@/lib/AppContext";

export default function TopBar({ organizations = [], activeOrganizationId, onOrganizationChange, workspaceId, workspaces = [], onWorkspaceChange, activeEnvId, onEnvChange, onEnvRefresh, sharedCollections = [] }: any) {
  const { confirmDialog, promptDialog } = useDialog();
  const { environments, setEnvironments, setEnvVariables, setActiveEnvId } = useAppContext();
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [localUser, setLocalUser] = useState<any>(null);

  useEffect(() => {
    const loadUser = () => {
      const u = localStorage.getItem("user");
      if (u) setLocalUser(JSON.parse(u));
    };
    loadUser();
    window.addEventListener("postclone-refresh-sidebar", loadUser);
    return () => window.removeEventListener("postclone-refresh-sidebar", loadUser);
  }, []);
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await apiFetch("/notifications?page=1&limit=5");
        if (res.ok) {
          const json = await res.json();
          setNotifications(json.data || []);
        }
      } catch {}
    };
    if (localUser) {
      // Defer — notifications aren't critical for initial render
      const initialDelay = setTimeout(fetchNotifications, 3000);
      const interval = setInterval(fetchNotifications, 30000);
      return () => { clearTimeout(initialDelay); clearInterval(interval); };
    }
  }, [localUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsWsDropdownOpen(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target as Node)) {
        setIsOrgDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const [isWsDropdownOpen, setIsWsDropdownOpen] = useState(false);
  const [wsSearch, setWsSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isWsSettingsOpen, setIsWsSettingsOpen] = useState(false);
  
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const [isTeamSettingsOpen, setIsTeamSettingsOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const activeOrg = organizations.find((o:any) => o.id === activeOrganizationId);
  const activeWs = workspaces?.find((w:any) => w.id === workspaceId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsWsDropdownOpen(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
         setIsOrgDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateWorkspace = async () => {
    const name = await promptDialog("Enter new workspace name:");
    if (!name) return;
    try {
      const res = await apiFetch("/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organizationId: activeOrganizationId })
      });
      const newWs = await res.json();
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      onWorkspaceChange(newWs.id);
      setIsWsDropdownOpen(false);
    } catch(err) {
      console.error(err);
    }
  };

  const handleCreateTeam = async () => {
    const name = await promptDialog("Enter new team name:");
    if (!name) return;
    try {
      const res = await apiFetch("/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subscriptionTier: 'FREE' })
      });
      const newOrg = await res.json();
      onOrganizationChange(newOrg.id);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      setIsOrgDropdownOpen(false);
    } catch(err) {
      console.error(err);
    }
  };


  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('impersonating');
    window.location.href = '/login';
  };

  // Environments are now loaded globally by AppContext.initApp().
  // This effect only syncs envVariables when the user selects a different environment.
  useEffect(() => {
    if (activeEnvId && environments.length > 0) {
      const active = environments.find((e: any) => e.id === activeEnvId);
      if (active) {
        setEnvVariables(active.variables || []);
      } else {
        setEnvVariables([]);
        setActiveEnvId(null);
      }
    }
  }, [activeEnvId, environments]);

  return (
    <>
      {/* Impersonation Banner */}
      {typeof window !== 'undefined' && localStorage.getItem('impersonating') === 'true' && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center py-1.5 px-4 text-xs font-bold flex items-center justify-center gap-3 z-50">
          <span>⚠️ You are impersonating <strong>{localUser?.email || 'a user'}</strong></span>
          <button
            onClick={() => {
              const adminToken = localStorage.getItem('admin_token');
              const adminUser = localStorage.getItem('admin_user');
              if (adminToken && adminUser) {
                localStorage.setItem('token', adminToken);
                localStorage.setItem('user', adminUser);
              }
              localStorage.removeItem('admin_token');
              localStorage.removeItem('admin_user');
              localStorage.removeItem('impersonating');
              window.location.href = '/admin';
            }}
            className="bg-white/20 hover:bg-white/30 px-3 py-0.5 rounded text-xs font-bold transition-colors"
          >
            Exit Impersonation
          </button>
        </div>
      )}
      <div className="h-12 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-4 gap-3">
        {/* Left Nav (Branding & Workspace) */}
        <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 font-bold text-lg hover:text-[var(--foreground)] transition-colors cursor-pointer text-[var(--color-brand-400)]">
              <JetLogo className="w-6 h-6" />
              <span>JetAPI</span>
            </a>

           {/* Team & Workspace Dropdowns - hidden for admins */}
           {organizations.length > 0 && localUser?.role !== 'SUPER_ADMIN' && localUser?.role !== 'ADMIN' ? (<>
           <div className="relative" ref={orgDropdownRef}>
              <div 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-colors ${isOrgDropdownOpen ? 'bg-[var(--sidebar)] text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="text-sm font-semibold tracking-wide">{activeOrg ? activeOrg.name : 'Select Team'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOrgDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {isOrgDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--card)] border border-[var(--border)] rounded shadow-2xl z-[9999] overflow-hidden flex flex-col">
                  <div className="max-h-64 overflow-y-auto p-1 flex flex-col gap-0.5">
                     <div className="text-[10px] font-semibold text-[var(--muted)] uppercase px-2 py-1.5 tracking-wider">Your Teams</div>
                     {organizations.map((org: any) => (
                       <div 
                         key={org.id}
                         className={`flex items-center justify-between w-full px-2 py-2 rounded text-xs group transition-colors ${activeOrganizationId === org.id ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                       >
                         <button
                           onClick={() => {
                             onOrganizationChange(org.id);
                             setIsOrgDropdownOpen(false);
                           }}
                           className="flex items-center gap-2 flex-1 text-left"
                         >
                           {activeOrganizationId === org.id ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5" />}
                           <span className={activeOrganizationId === org.id ? "font-semibold" : "font-medium"}>{org.name}</span>
                         </button>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             onOrganizationChange(org.id);
                             setIsOrgDropdownOpen(false);
                             setIsTeamSettingsOpen(true);
                           }}
                           className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-all"
                           title={`Edit ${org.name}`}
                         >
                           <Settings className="w-3 h-3" />
                         </button>
                       </div>
                     ))}
                  </div>
                  <div className="border-t border-[var(--border)] p-1 bg-[var(--background)]">
                    <button 
                      onClick={() => { setIsOrgDropdownOpen(false); setIsTeamSettingsOpen(true); }}
                      className="flex items-center justify-center gap-2 w-full px-2 py-2 hover:bg-[var(--sidebar)] text-xs font-semibold text-[var(--foreground)] rounded transition-colors mb-0.5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Manage Team
                    </button>
                    <button 
                      onClick={handleCreateTeam}
                      className="flex items-center justify-center gap-2 w-full px-2 py-2 hover:bg-[var(--sidebar)] text-xs font-semibold text-[var(--foreground)] rounded transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create New Team
                    </button>
                  </div>
                </div>
              )}
           </div>

           <div className="relative" ref={dropdownRef}>
              <div 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-colors ${isWsDropdownOpen ? 'bg-[var(--sidebar)] text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                onClick={() => setIsWsDropdownOpen(!isWsDropdownOpen)}
              >
                <div className="w-4 h-4 rounded bg-[var(--color-brand-500)]/20 flex items-center justify-center text-[var(--color-brand-500)]">
                  <Folder className="w-3 h-3" />
                </div>
                <span className="text-sm font-semibold tracking-wide max-w-[120px] truncate">{activeWs?.name || "Workspaces"}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWsDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {isWsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--card)] border border-[var(--border)] rounded shadow-2xl z-[9999] overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-[var(--border)] relative bg-[var(--background)]">
                     <Search className="w-3.5 h-3.5 absolute left-4 top-4 text-[var(--muted)]" />
                     <input 
                       className="w-full bg-[var(--sidebar)] border border-[var(--border)] text-xs rounded py-1.5 pl-8 pr-2 focus:outline-none focus:border-[var(--color-brand-500)] text-[var(--foreground)] placeholder-[var(--muted)] transition-colors"
                       placeholder="Search workspaces"
                       value={wsSearch}
                       onChange={e => setWsSearch(e.target.value)}
                       autoFocus
                     />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1 flex flex-col gap-0.5">
                     <div className="text-[10px] font-semibold text-[var(--muted)] uppercase px-2 py-1.5 tracking-wider">Your Workspaces</div>
                     {workspaces.filter((w: any) => (w.name || "").toLowerCase().includes(wsSearch.toLowerCase())).map((ws: any) => (
                       <div 
                         key={ws.id}
                         className={`flex items-center justify-between w-full px-2 py-2 rounded text-xs group transition-colors ${workspaceId === ws.id ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                       >
                         <button
                           onClick={() => {
                             onWorkspaceChange(ws.id);
                             setIsWsDropdownOpen(false);
                           }}
                           className="flex items-center gap-2 flex-1 text-left"
                         >
                           {workspaceId === ws.id ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5" />}
                           <span className={workspaceId === ws.id ? "font-semibold" : "font-medium"}>{ws.name || "Untitled Workspace"}</span>
                         </button>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             onWorkspaceChange(ws.id);
                             setIsWsDropdownOpen(false);
                             setIsWsSettingsOpen(true);
                           }}
                           className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-all"
                           title={`Edit ${ws.name || 'Workspace'}`}
                         >
                           <Settings className="w-3 h-3" />
                         </button>
                       </div>
                     ))}
                  </div>
                  <div className="border-t border-[var(--border)] p-1 bg-[var(--background)]">
                    <button 
                      onClick={() => { setIsWsDropdownOpen(false); setIsWsSettingsOpen(true); }}
                      className="flex items-center justify-center gap-2 w-full px-2 py-2 hover:bg-[var(--sidebar)] text-xs font-semibold text-[var(--foreground)] rounded transition-colors mb-0.5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Manage Workspace
                    </button>
                    <button 
                      onClick={handleCreateWorkspace}
                      className="flex items-center justify-center gap-2 w-full px-2 py-2 hover:bg-[var(--sidebar)] text-xs font-semibold text-[var(--foreground)] rounded transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Workspace
                    </button>
                  </div>
                </div>
              )}
           </div>
           </>) : null}
        </div>

        {/* Right Nav (Environments & Profile) */}
        <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded text-sm px-2 py-1">
          {/* Environment dropdown removed as per request */}
          <div className="flex items-center gap-1.5 border-l border-[var(--border)] pl-2 ml-1">
            <div className="relative flex items-center" ref={notificationsRef}>
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--sidebar)] transition-colors relative" 
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-[var(--card)]"></span>
                )}
              </button>
              {isNotificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-[99998] flex flex-col overflow-hidden dropdown-enter">
                  <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--sidebar)]/50">
                    <span className="font-semibold text-xs text-[var(--foreground)] uppercase tracking-wider">Notifications</span>
                    {notifications.some(n => !n.isRead) && (
                       <button 
                         onClick={async () => {
                           await apiFetch("/notifications/read-all", { method: "PUT" });
                           setNotifications(notifications.map(n => ({ ...n, isRead: true })));
                         }}
                         className="text-[10px] text-[var(--color-brand-500)] hover:underline"
                       >
                         Mark all read
                       </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-[var(--muted)]">
                        No notifications
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div 
                           key={n.id} 
                           className={`px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--sidebar)]/50 transition-colors cursor-pointer flex flex-col gap-1 ${!n.isRead ? 'bg-[var(--color-brand-500)]/5' : ''}`}
                           onClick={async () => {
                             if (!n.isRead) {
                               await apiFetch(`/notifications/${n.id}/read`, { method: "PUT" });
                               setNotifications(notifications.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                             }
                           }}
                        >
                          <span className={`text-xs ${!n.isRead ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted)]'}`}>
                            {n.message}
                          </span>
                          <span className="text-[10px] text-[var(--muted)] opacity-70">
                            {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <a
                    href="/notifications"
                    className="block text-center text-[10px] font-semibold text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] py-2 border-t border-[var(--border)] bg-[var(--sidebar)]/30 hover:bg-[var(--sidebar)]/60 transition-colors"
                  >
                    View all notifications →
                  </a>
                </div>
              )}
            </div>
            
            
            <div className="relative flex items-center" ref={userDropdownRef}>
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] w-7 h-7 flex items-center justify-center rounded-full hover:ring-2 hover:ring-[var(--color-brand-500)]/40 transition-all cursor-pointer"
                title="Account"
              >
                {localUser?.avatarMimeType ? (
                  <img src={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/users/${localUser.id}/avatar`} alt="Avatar" className="w-6 h-6 rounded-full object-cover border border-[var(--border)]" width={24} height={24} />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase" style={{ background: 'var(--color-brand-500)' }}>
                    {(localUser?.name || localUser?.email || 'U').charAt(0)}
                  </div>
                )}
              </button>
              {isUserDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.25)] z-[99999] overflow-hidden dropdown-enter">
                  {/* User info header with avatar */}
                  <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-[var(--color-brand-500)]/[0.06] to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        {localUser?.avatarMimeType ? (
                          <img src={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/users/${localUser.id}/avatar`} alt="Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-[var(--color-brand-500)]/20" width={40} height={40} />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white uppercase" style={{ background: 'var(--color-brand-500)' }}>
                            {(localUser?.name || localUser?.email || 'U').charAt(0)}
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[var(--card)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--foreground)] truncate">{localUser?.name || 'User'}</p>
                        <p className="text-[11px] text-[var(--muted)] truncate">{localUser?.email}</p>
                      </div>
                      {(localUser?.role === 'SUPER_ADMIN' || localUser?.role === 'ADMIN') && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 flex-shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick links */}
                  <div className="p-1.5 border-t border-[var(--border)]">
                    {localUser?.role === 'SUPER_ADMIN' || localUser?.role === 'ADMIN' ? (
                      <a
                        href="/admin"
                        className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar)] transition-colors group"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <span>Admin Panel</span>
                        <ExternalLink className="w-3 h-3 text-[var(--muted)] ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ) : (
                      <a
                        href="/profile"
                        className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar)] transition-colors group"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-brand-500)]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--color-brand-500)]/20 transition-colors">
                          <UserIcon className="w-3.5 h-3.5 text-[var(--color-brand-500)]" />
                        </div>
                        <span>My Profile</span>
                      </a>
                    )}
                    <a
                      href="/notifications"
                      className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar)] transition-colors group"
                      onClick={() => setIsUserDropdownOpen(false)}
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                        <Bell className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span>Notifications</span>
                      {notifications.filter(n => !n.isRead).length > 0 && (
                        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                          {notifications.filter(n => !n.isRead).length}
                        </span>
                      )}
                    </a>
                    {localUser?.role !== 'SUPER_ADMIN' && localUser?.role !== 'ADMIN' && (
                      <a
                        href="/billing"
                        className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--sidebar)] transition-colors group"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span>Billing</span>
                      </a>
                    )}
                  </div>

                  {/* Logout */}
                  <div className="border-t border-[var(--border)] p-1.5">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/20 transition-colors">
                        <LogOut className="w-3.5 h-3.5" />
                      </div>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
            <ThemeToggle />

            {/* Manage Environments button removed as per request */}
          </div>
        </div>
      </div>

      {isManagerOpen && workspaceId && (
        <EnvironmentManager 
          workspaceId={
             environments.find(e => e.id === activeEnvId)?.workspaceId || 
             (sharedCollections?.length > 0 && environments.length === 0 ? sharedCollections[0].workspaceId : workspaceId) || 
             workspaceId
          } 
          onClose={() => setIsManagerOpen(false)} 
          workspaces={workspaces}
          sharedCollections={sharedCollections}
        />
      )}
      {isTeamSettingsOpen && activeOrganizationId && (
        <TeamSettingsModal 
          organizationId={activeOrganizationId}
          onClose={() => setIsTeamSettingsOpen(false)}
        />
      )}
      {isWsSettingsOpen && workspaceId && activeOrganizationId && (
        <WorkspaceSettingsModal 
          workspaceId={workspaceId}
          organizationId={activeOrganizationId}
          onClose={() => setIsWsSettingsOpen(false)}
        />
      )}
    </>
  );
}
