"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

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

  // Track whether the initial boot has completed to avoid re-running org-switch logic
  const hasBootedRef = useRef(false);

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
      const orgs = data.organizations || [];
      setOrganizations(orgs);

      const savedOrg = localStorage.getItem("postclone_orgId");
      let defaultOrgId: string | null = null;
      if (orgs.length > 0) {
        defaultOrgId = savedOrg && orgs.some((o: any) => o.id === savedOrg) ? savedOrg : orgs[0].id;
        setActiveOrganizationId(defaultOrgId);
      }

      // ── Workspaces ──
      const allWs = data.workspaces || [];
      const orgWs = defaultOrgId ? allWs.filter((w: any) => w.organizationId === defaultOrgId) : [];
      // Shared workspaces = workspaces from other orgs (contain shared collections)
      const sharedWs = allWs.filter((w: any) => w.organizationId !== defaultOrgId);
      // Combined: own org workspaces first, then shared ones
      const combinedWs = [...orgWs, ...sharedWs];

      if (orgWs.length === 0 && defaultOrgId) {
        const createRes = await apiFetch("/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Workspace", organizationId: defaultOrgId })
        });
        const newWs = await createRes.json();
        setWorkspaces([newWs, ...sharedWs]);
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
      .then(data => { if (Array.isArray(data)) setOrganizations(data); })
      .catch(console.error);
  }, []);

  const fetchWorkspaces = useCallback(() => {
    if (!activeOrganizationId) return;
    apiFetch(`/workspaces?organizationId=${activeOrganizationId}`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setWorkspaces(data); })
      .catch(console.error);
  }, [activeOrganizationId]);

  const fetchSharedCollections = useCallback(() => {
    apiFetch("/collections?includeRequests=true")
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
