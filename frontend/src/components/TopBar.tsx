"use client";
import { apiFetch } from '@/lib/api';
import StyledSelect from './StyledSelect';
import { useState, useEffect, useRef } from "react";
import { Settings, ShieldCheck, User as UserIcon, Server, ChevronDown, Check, Plus, Search, Trash2, Users, Folder, Bell } from "lucide-react";
import EnvironmentManager from "./EnvironmentManager";
import TeamSettingsModal from "./TeamSettingsModal";
import WorkspaceSettingsModal from "./WorkspaceSettingsModal";
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
        const res = await apiFetch("/notifications");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    if (localUser) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 20000);
      return () => clearInterval(interval);
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
      <div className="h-12 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-4 gap-3">
        {/* Left Nav (Branding & Workspace) */}
        <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 font-bold text-lg hover:text-[var(--foreground)] transition-colors cursor-pointer text-[var(--color-brand-400)]">
              <JetLogo className="w-6 h-6" />
              <span>JetAPI</span>
            </a>

           {/* Team Dropdown */}
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
                       <button 
                         key={org.id}
                         onClick={() => {
                           onOrganizationChange(org.id);
                           setIsOrgDropdownOpen(false);
                         }}
                         className={`flex items-center justify-between w-full text-left px-2 py-2 rounded text-xs group transition-colors ${activeOrganizationId === org.id ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                       >
                         <div className="flex items-center gap-2">
                           {activeOrganizationId === org.id ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5" />}
                           <span className={activeOrganizationId === org.id ? "font-semibold" : "font-medium"}>{org.name}</span>
                         </div>
                       </button>
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
                  {/* Search Map */}
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
                  {/* Dynamic Populated List */}
                  <div className="max-h-64 overflow-y-auto p-1 flex flex-col gap-0.5">
                     <div className="text-[10px] font-semibold text-[var(--muted)] uppercase px-2 py-1.5 tracking-wider">Your Workspaces</div>
                     {workspaces.filter((w: any) => (w.name || "").toLowerCase().includes(wsSearch.toLowerCase())).map((ws: any) => (
                       <button 
                         key={ws.id}
                         onClick={() => {
                           onWorkspaceChange(ws.id);
                           setIsWsDropdownOpen(false);
                         }}
                         className={`flex items-center justify-between w-full text-left px-2 py-2 rounded text-xs group transition-colors ${workspaceId === ws.id ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--foreground)] hover:bg-[var(--sidebar)]'}`}
                       >
                         <div className="flex items-center gap-2">
                           {workspaceId === ws.id ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5" />}
                           <span className={workspaceId === ws.id ? "font-semibold" : "font-medium"}>{ws.name || "Untitled Workspace"}</span>
                         </div>
                       </button>
                     ))}
                  </div>
                  {/* Creation Action */}
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
        </div>

        {/* Right Nav (Environments & Profile) */}
        <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded text-sm px-2 py-1">
          {/* Environment dropdown removed as per request */}
          <div className="flex items-center gap-1 border-l border-[var(--border)] pl-2 ml-1">
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] p-1 rounded hover:bg-[var(--sidebar)] transition-colors relative" 
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
                      <div className="px-4 py-6 text-center text-xs text-[var(--muted)] border-red">
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
                </div>
              )}
            </div>
            
            
            <a href="/profile" className="text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded-full hover:ring-2 hover:ring-[var(--color-brand-500)]/40 transition-all" title="User Profile">
              {localUser?.avatarMimeType ? (
                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/users/${localUser.id}/avatar`} alt="Avatar" className="w-6 h-6 rounded-full object-cover border border-[var(--border)]" />
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase" style={{ background: 'var(--color-brand-500)' }}>
                  {(localUser?.name || localUser?.email || 'U').charAt(0)}
                </div>
              )}
            </a>
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
