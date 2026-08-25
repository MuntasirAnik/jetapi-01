"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { io, Socket } from "socket.io-client";

type AppContextType = {
  organizations: any[];
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string | null) => void;
  workspaces: any[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  environments: any[];
  setEnvironments: (envs: any[]) => void;
  envVariables: any[];
  setEnvVariables: (vars: any[]) => void;
  activeEnvId: string | null;
  setActiveEnvId: (id: string | null) => void;
  sharedCollections: any[];
  envRefreshTrigger: number;
  triggerEnvRefresh: () => void;
  fetchOrganizations: () => void;
  fetchWorkspaces: () => void;
  fetchSharedCollections: () => void;
  refreshInit: () => void;
  isAppReady: boolean;
  hasUnreadMessages: boolean;
  unreadRooms: string[];
  markRoomAsRead: (room: string) => void;
  clearUnreadMessages: () => void;
  globalVariables: any[];

};

const AppContext = createContext<AppContextType | null>(null);

// ──── Helper: extract and deduplicate global variables from workspaces ────
function extractGlobalVars(workspaces: any[]): any[] {
  const seen = new Map<string, any>();
  for (const ws of workspaces) {
    let vars = ws.globalVariables || [];
    if (typeof vars === 'string') {
      try { vars = JSON.parse(vars); } catch { continue; }
    }
    if (!Array.isArray(vars)) continue;
    for (const v of vars) {
      if (v.key) seen.set(v.key, v); // last-write-wins dedup
    }
  }
  return Array.from(seen.values());
}

// Auth routes that don't require a valid session
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [envVariables, setEnvVariables] = useState<any[]>([]);
  const [sharedCollections, setSharedCollections] = useState<any[]>([]);
  const [envRefreshTrigger, setEnvRefreshTrigger] = useState(0);
  const [isAppReady, setIsAppReady] = useState(false);
  const [globalVariables, setGlobalVariables] = useState<any[]>([]);
  const [unreadRooms, setUnreadRooms] = useState<string[]>([]);
  const hasUnreadMessages = unreadRooms.length > 0;

  // Track whether the initial boot has completed to avoid re-running org-switch logic
  const hasBootedRef = useRef(false);

  // ──── Instant cache restore on mount ────
  useEffect(() => {
    try {
      const cachedInit = localStorage.getItem('jetapi_init_cache');
      
      const cachedUnread = localStorage.getItem('jetapi_unread_rooms');
      if (cachedUnread) {
        setUnreadRooms(JSON.parse(cachedUnread));
      }
      if (cachedInit) {
        const data = JSON.parse(cachedInit);
        if (data.organizations) {
          const uniqueOrgs = data.organizations.filter((org: any, index: number, self: any[]) =>
            self.findIndex((o: any) => o.id === org.id) === index
          );
          setOrganizations(uniqueOrgs);
        }
        if (data.activeOrganizationId) setActiveOrganizationId(data.activeOrganizationId);
        if (data.workspaces) {
          const uniqueWs = data.workspaces.filter((ws: any, index: number, self: any[]) =>
            self.findIndex((w: any) => w.id === ws.id) === index
          );

          const localUserStr = localStorage.getItem("user");
          const localUser = localUserStr ? JSON.parse(localUserStr) : null;
          const activeOrg = (data.organizations || []).find((o: any) => o.id === data.activeOrganizationId);
          const isPersonalOrg = activeOrg && localUser && activeOrg.ownerId === localUser.id;

          const filteredWs = uniqueWs.filter((w: any) => {
            if (w.organizationId === data.activeOrganizationId) return true;
            if (isPersonalOrg && w.organizationId !== data.activeOrganizationId) return true;
            return false;
          });

          setWorkspaces(filteredWs);
          setGlobalVariables(extractGlobalVars(filteredWs));
        }
        if (data.activeWorkspaceId) setActiveWorkspaceId(data.activeWorkspaceId);
        if (data.sharedCollections) setSharedCollections(data.sharedCollections);
        if (data.environments) setEnvironments(data.environments);
        // Show UI immediately with cached data
        setIsAppReady(true);
      }
    } catch {}
  }, []);

  // ──── Single init call ────
  const initApp = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route));

    // No token and on a protected route → redirect to login
    if (!token) {
      if (!isPublicRoute && typeof window !== 'undefined') {
        router.replace('/login');
      }
      setIsAppReady(true);
      return;
    }

    try {
      const res = await apiFetch("/api/init");

      // Token expired or invalid → clear session and redirect
      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          if (!isPublicRoute) {
            router.replace('/login');
          }
        }
        setIsAppReady(true);
        return;
      }

      if (!res.ok) return;
      const data = await res.json();

      // ── Organizations ──
      const orgs = (data.organizations || []).filter((org: any, index: number, self: any[]) =>
        self.findIndex((o: any) => o.id === org.id) === index
      );
      setOrganizations(orgs);

      const savedOrg = localStorage.getItem("postclone_orgId");
      let defaultOrgId: string | null = null;
      if (orgs.length > 0) {
        defaultOrgId = savedOrg && orgs.some((o: any) => o.id === savedOrg) ? savedOrg : orgs[0].id;
        setActiveOrganizationId(defaultOrgId);
      }

      // ── Workspaces ──
      const allWs = (data.workspaces || []).filter((ws: any, index: number, self: any[]) =>
        self.findIndex((w: any) => w.id === ws.id) === index
      );
      const orgWs = defaultOrgId ? allWs.filter((w: any) => w.organizationId === defaultOrgId) : [];
      // Shared workspaces = workspaces from other orgs (contain shared collections)
      const sharedWs = allWs.filter((w: any) => w.organizationId !== defaultOrgId);

      const localUserStr = localStorage.getItem("user");
      const localUser = localUserStr ? JSON.parse(localUserStr) : null;
      const activeOrg = orgs.find((o: any) => o.id === defaultOrgId);
      const isPersonalOrg = activeOrg && localUser && activeOrg.ownerId === localUser.id;

      // Combined: own org workspaces first. If it's a personal org, also append shared workspaces.
      const combinedWs = isPersonalOrg ? [...orgWs, ...sharedWs] : orgWs;

      if (orgWs.length === 0 && defaultOrgId) {
        const createRes = await apiFetch("/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Workspace", organizationId: defaultOrgId })
        });
        const newWs = await createRes.json();
        const rawCombined = isPersonalOrg ? [newWs, ...sharedWs] : [newWs];
        const uniqueCombinedWs = rawCombined.filter((ws: any, index: number, self: any[]) =>
          self.findIndex((w: any) => w.id === ws.id) === index
        );
        setWorkspaces(uniqueCombinedWs);
        setActiveWorkspaceId(newWs.id);
      } else {
        setWorkspaces(combinedWs);
        const savedWs = localStorage.getItem("postclone_workspaceId");
        if (!savedWs || !combinedWs.some((w: any) => w.id === savedWs)) {
          const populated = combinedWs.find((w: any) => w.collections?.length > 0);
          setActiveWorkspaceId(populated?.id || combinedWs[0]?.id || null);
        } else {
          setActiveWorkspaceId(savedWs);
        }
      }

      // ── Shared collections, environments, global variables ──
      setSharedCollections(data.sharedCollections || []);
      setEnvironments(data.environments || []);
      setGlobalVariables(extractGlobalVars(combinedWs));

      // ── Restore saved environment ──
      const savedEnv = localStorage.getItem("postclone_envId");
      if (savedEnv) {
        const activeEnv = (data.environments || []).find((e: any) => e.id === savedEnv);
        if (activeEnv) {
          setActiveEnvId(savedEnv);
          setEnvVariables(activeEnv.variables || []);
        } else {
          setActiveEnvId(null);
          setEnvVariables([]);
          localStorage.removeItem("postclone_envId");
        }
      }

      // ── Cache init data for instant next load ──
      try {
        localStorage.setItem('jetapi_init_cache', JSON.stringify({
          organizations,
          activeOrganizationId: defaultOrgId,
          workspaces: combinedWs,
          activeWorkspaceId: localStorage.getItem("postclone_workspaceId") || combinedWs.find((w: any) => w.collections?.length > 0)?.id || combinedWs[0]?.id,
          sharedCollections: data.sharedCollections || [],
          environments: data.environments || [],
        }));
      } catch {}

      hasBootedRef.current = true;
    } catch (err) {
      console.error("Init failed:", err);
    } finally {
      setIsAppReady(true);
    }
  }, []);

  // ──── Legacy fetchers (only used for targeted refreshes, NOT boot) ────
  const fetchOrganizations = useCallback(() => {
    apiFetch("/organizations")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const uniqueOrgs = data.filter((org: any, index: number, self: any[]) =>
            self.findIndex((o: any) => o.id === org.id) === index
          );
          setOrganizations(uniqueOrgs);
        }
      })
      .catch(console.error);
  }, []);

  const fetchWorkspaces = useCallback(() => {
    if (!activeOrganizationId) return;
    apiFetch(`/workspaces?organizationId=${activeOrganizationId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const uniqueWs = data.filter((ws: any, index: number, self: any[]) =>
            self.findIndex((w: any) => w.id === ws.id) === index
          );
          setWorkspaces(uniqueWs);
        }
      })
      .catch(console.error);
  }, [activeOrganizationId]);

  const fetchSharedCollections = useCallback(() => {
    apiFetch("/collections")
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSharedCollections(data); })
      .catch(console.error);
  }, []);

  // ──── Boot: fires on mount, but only if token exists ────
  useEffect(() => {
    initApp();
  }, [initApp]);

  // ──── Auth event: fires after login/register saves the token ────
  useEffect(() => {
    const handleAuthLogin = () => initApp();
    window.addEventListener('auth-login', handleAuthLogin);
    return () => window.removeEventListener('auth-login', handleAuthLogin);
  }, [initApp]);

  // ──── Org switch (post-boot only) → re-run full init to preserve shared workspaces ────
  useEffect(() => {
    if (!hasBootedRef.current || !activeOrganizationId) return;
    localStorage.setItem("postclone_orgId", activeOrganizationId);
    initApp();
  }, [activeOrganizationId]);

  // ──── Refresh events ────
  useEffect(() => {
    const handleRefresh = () => initApp();
    window.addEventListener('postclone-refresh-sidebar', handleRefresh);
    return () => window.removeEventListener('postclone-refresh-sidebar', handleRefresh);
  }, [initApp]);

  // ──── Persist selections ────
  useEffect(() => {
    if (activeWorkspaceId) localStorage.setItem("postclone_workspaceId", activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (activeEnvId) localStorage.setItem("postclone_envId", activeEnvId);
    else localStorage.removeItem("postclone_envId");
  }, [activeEnvId]);

  // ──── Persist Unread Rooms ────
  useEffect(() => {
    try {
      localStorage.setItem('jetapi_unread_rooms', JSON.stringify(unreadRooms));
    } catch {}
  }, [unreadRooms]);

  // ──── Global Chat Notification Listener ────
  useEffect(() => {
    if (!activeOrganizationId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("subscribe_notifications", {
        organizationId: activeOrganizationId,
        workspaceId: activeWorkspaceId || undefined,
      });
    });

    socket.on("notification", (data: any) => {
      const localUserStr = localStorage.getItem("user");
      const localUser = localUserStr ? JSON.parse(localUserStr) : null;
      if (localUser && data.sender === localUser.id) return;

      if (data.room) {
        setUnreadRooms(prev => {
          if (!prev.includes(data.room)) return [...prev, data.room];
          return prev;
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeOrganizationId, activeWorkspaceId]);

  const value = {
    organizations,
    activeOrganizationId,
    setActiveOrganizationId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    environments,
    setEnvironments,
    activeEnvId,
    setActiveEnvId,
    envVariables,
    setEnvVariables,
    sharedCollections,
    envRefreshTrigger,
    triggerEnvRefresh: () => setEnvRefreshTrigger(prev => prev + 1),
    fetchOrganizations,
    fetchWorkspaces,
    fetchSharedCollections,
    refreshInit: initApp,
    isAppReady,
    globalVariables,
    hasUnreadMessages,
    unreadRooms,
    markRoomAsRead: (room: string) => setUnreadRooms(prev => prev.filter(r => r !== room)),
    clearUnreadMessages: () => setUnreadRooms([]),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
