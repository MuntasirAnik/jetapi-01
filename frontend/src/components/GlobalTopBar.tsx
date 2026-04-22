"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '@/lib/AppContext';
import TopBar from './TopBar';

export default function GlobalTopBar() {
  const pathname = usePathname();
  
  // Do not show on auth pages
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname)) {
    return null;
  }

  const {
    organizations,
    activeOrganizationId,
    setActiveOrganizationId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeEnvId,
    setActiveEnvId,
    triggerEnvRefresh,
    sharedCollections
  } = useAppContext();

  return (
    <TopBar 
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      onOrganizationChange={(id: string) => setActiveOrganizationId(id)}
      workspaceId={activeWorkspaceId}
      workspaces={workspaces}
      onWorkspaceChange={(id: string) => setActiveWorkspaceId(id)}
      activeEnvId={activeEnvId}
      onEnvChange={(id: string | null) => setActiveEnvId(id)}
      onEnvRefresh={triggerEnvRefresh}
      sharedCollections={sharedCollections}
    />
  );
}
