"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, getApiError } from "@/lib/api";
import { X, Save, Search, Folder, ChevronRight, ChevronDown, Plus, FolderPlus, Loader2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import RequestPanel from "@/components/RequestPanel";
import ResponsePanel from "@/components/ResponsePanel";
import TopBar from "@/components/TopBar";
import RightSidebar from "@/components/RightSidebar";
import CodeSnippetPanel from "@/components/CodeSnippetPanel";
import VariablesPanel from "@/components/VariablesPanel";
import DocumentationPanel from "@/components/DocumentationPanel";
import CommentsPanel from "@/components/CommentsPanel";
import ResponseDiffPanel from "@/components/ResponseDiffPanel";
import CommandPalette from "@/components/CommandPalette";
import StyledSelect from "@/components/StyledSelect";
import { toast } from "react-toastify";
import { useDialog } from "@/components/DialogProvider";
import { useAppContext } from "@/lib/AppContext";
import { runTestScript, TestResult } from "@/lib/testRunner";

export default function Home() {
  const { promptDialog, confirmDialog } = useDialog();
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedTabs = localStorage.getItem('jetapi_openTabs');
    const savedActiveId = localStorage.getItem('jetapi_activeTabId');
    if (savedTabs) {
      try {
        setOpenRequests(JSON.parse(savedTabs));
      } catch (e) {}
    }
    if (savedActiveId) {
      setActiveRequestId(savedActiveId);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('jetapi_openTabs', JSON.stringify(openRequests));
      if (activeRequestId) {
        localStorage.setItem('jetapi_activeTabId', activeRequestId);
      } else {
        localStorage.removeItem('jetapi_activeTabId');
      }
    }
  }, [openRequests, activeRequestId, isInitialized]);

  const activeRequest = openRequests.find(r => r.id === activeRequestId) || null;
  const [responseData, setResponseData] = useState<any>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false); // Global States
  const abortControllerRef = useRef<AbortController | null>(null);

  // Right Context Menu State
  const [rightPanelOpen, setRightPanelOpen] = useState<string | null>(null);

  // Command Palette
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidebarTabRef = useRef<((tab: string) => void) | null>(null);

  // Save Modal States
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [requestToSave, setRequestToSave] = useState<any>(null);
  const [saveWorkspaces, setSaveWorkspaces] = useState<any[]>([]);
  const [saveTargetWorkspaceId, setSaveTargetWorkspaceId] = useState<string>('');
  const [saveTargetCollectionId, setSaveTargetCollectionId] = useState<string>('');
  const [saveTargetFolder, setSaveTargetFolder] = useState<string>('');
  const [saveRequestName, setSaveRequestName] = useState<string>('');
  const [saveSearchQuery, setSaveSearchQuery] = useState<string>('');
  const [saveExpandedNodes, setSaveExpandedNodes] = useState<Record<string, boolean>>({});

  // Loading States
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const openSaveModal = async (req: any) => {
    setRequestToSave(req);
    setSaveRequestName(req.name || 'New Request');

    const mergeShared = (baseWs: any[]) => {
      const combined = [...baseWs];
      if (sharedCollections && sharedCollections.length > 0) {
        sharedCollections.forEach((c: any) => {
          if (!c.workspaceId) return;
          const existingWs = combined.find(w => w.id === c.workspaceId);
          if (existingWs) {
             if (!existingWs.collections?.some((ec: any) => ec.id === c.id)) {
                existingWs.collections = [...(existingWs.collections || []), c];
             }
          } else {
             combined.push({
               id: c.workspaceId,
               name: c.workspace?.name || `Workspace of '${c.name}'`,
               collections: [c]
             });
          }
        });
      }
      return combined;
    };
    
    // Instantly preload the UI synchronously with existing frontend workspaces to eliminate perceived networking delay
    if (workspaces && workspaces.length > 0) {
      const initialMerged = mergeShared(workspaces);
      setSaveWorkspaces(initialMerged);
      
      let targetWsId = activeWorkspaceId || initialMerged[0].id;
      let targetColId = null;
      if (req.collectionId) {
        const foundWs = initialMerged.find((w: any) => w.collections?.some((c: any) => c.id === req.collectionId));
        if (foundWs) { targetWsId = foundWs.id; targetColId = req.collectionId; }
      }
      if (!initialMerged.some((w: any) => w.id === targetWsId)) targetWsId = initialMerged[0].id;
      
      setSaveTargetWorkspaceId(targetWsId);
      if (targetColId) {
        setSaveTargetCollectionId(targetColId);
        setSaveTargetFolder(req.folder || '');
        setSaveExpandedNodes(prev => ({ ...prev, [`col-${targetColId}`]: true }));
      } else {
        const activeWs = initialMerged.find((w: any) => w.id === targetWsId);
        if (activeWs && activeWs.collections?.length > 0) setSaveTargetCollectionId(activeWs.collections[0].id);
      }
    }
    
    setIsSaveModalOpen(true);
    
    try {
      const res = await apiFetch(`/workspaces?organizationId=${activeOrganizationId}`);
      if (res.ok) {
        const ws = await res.json();
        const freshMerged = mergeShared(ws);
        setSaveWorkspaces(freshMerged);
        if (freshMerged.length > 0) {
          let targetWsId = activeWorkspaceId || freshMerged[0].id;
          let targetColId = null;
          
          if (req.collectionId) {
            const foundWs = freshMerged.find((w: any) => w.collections?.some((c: any) => c.id === req.collectionId));
            if (foundWs) {
              targetWsId = foundWs.id;
              targetColId = req.collectionId;
            }
          }
          
          if (!freshMerged.some((w: any) => w.id === targetWsId)) {
            targetWsId = freshMerged[0].id;
          }
          
          setSaveTargetWorkspaceId(targetWsId);
          
          if (targetColId) {
            setSaveTargetCollectionId(targetColId);
            setSaveTargetFolder(req.folder || '');
            setSaveExpandedNodes(prev => ({ ...prev, [`col-${targetColId}`]: true }));
          } else {
            const activeWs = freshMerged.find((w: any) => w.id === targetWsId);
            if (activeWs && activeWs.collections?.length > 0) {
              setSaveTargetCollectionId(activeWs.collections[0].id);
              setSaveTargetFolder('');
            } else {
              setSaveTargetCollectionId('');
              setSaveTargetFolder('');
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecuteSave = async () => {
    if (!saveTargetCollectionId) {
      toast.warning("Please select a collection to save to.");
      return;
    }
    
    setIsSavingModal(true);
    try {
      const payload = {
        ...requestToSave,
        name: saveRequestName,
        folder: saveTargetFolder || null,
        collectionId: saveTargetCollectionId
      };
      
      // Remove 'id' if creating from scratch or creating a duplicate copy
      let isUpdate = false;
      if (String(payload.id).startsWith('new') || requestToSave._isNew || payload.id !== requestToSave.id) {
         delete payload.id; 
      } else if (payload.id) {
         isUpdate = true;
      }
      
      const method = isUpdate ? "PUT" : "POST";
      const url = isUpdate ? `/requests/${payload.id}` : "/requests";
      
      const res = await apiFetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Backend Save Error:", errData);
        throw new Error(errData.message || "Failed to save request");
      }
      
      const saved = await res.json();
      
      // Update tabs: if we saved a brand new request, replace it. If 'Save As', push new tab.
      if (String(requestToSave.id).startsWith('new') || requestToSave._isNew) {
        setOpenRequests(prev => prev.map(r => r.id === requestToSave.id ? saved : r));
      } else {
        setOpenRequests(prev => [...prev, saved]);
      }
      setActiveRequestId(saved.id);
      setIsSaveModalOpen(false);
      
      // Trigger a refresh event for the Sidebar so the collection updates visually!
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      
    } catch (e: any) {
      toast.error("Error saving request: " + e.message);
    } finally {
      setIsSavingModal(false);
    }
  };

  const {
    activeOrganizationId,
    workspaces,
    activeWorkspaceId,
    environments,
    activeEnvId,
    setActiveEnvId,
    envVariables,
    sharedCollections,
    envRefreshTrigger,
    isAppReady,
    globalVariables,
  } = useAppContext();

  // ⌘+K Command Palette shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Horizontal Resizable Sidebar Logic
  const [sidebarWidth, setSidebarWidth] = useState(320); // Default 320px
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Vertical Resizable Panel Logic
  const [panelHeight, setPanelHeight] = useState(50); // Default 50% split
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global variables are now loaded by AppContext.initApp() — no separate fetch needed.

  const interpolate = (str: string) => {
    if (!str || typeof str !== 'string') return str;
    let interpolated = str;
    
    // Merge globals and environments (Environment variables take strict precedence)
    const activeVars = [...envVariables];
    globalVariables.forEach(gv => {
      if (!activeVars.some(ev => ev.key === gv.key)) {
        activeVars.push(gv);
      }
    });

    activeVars.filter(v => v.enabled !== false && v.key).forEach(v => {
      // Use regex that tolerates spaces e.g. {{ my_var }}
      const activeValue = v.currentValue !== undefined ? v.currentValue : v.value;
      interpolated = interpolated.replace(new RegExp(`{{\\s*${v.key}\\s*}}`, 'g'), () => activeValue);
      interpolated = interpolated.replace(new RegExp(`%7B%7B\\s*${v.key}\\s*%7D%7D`, 'i'), () => activeValue);
    });

    // Request chaining: resolve {{$response.path.to.field}} from last response
    interpolated = interpolated.replace(/\{\{\s*\$response\.(.+?)\s*\}\}/g, (match, path) => {
      try {
        const lastResp = JSON.parse(localStorage.getItem('jetapi_last_response') || '{}');
        const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], lastResp);
        return value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : match;
      } catch { return match; }
    });

    // Chaining by request name: {{$req["Request Name"].path}} 
    interpolated = interpolated.replace(/\{\{\s*\$req\["(.+?)"\]\.(.+?)\s*\}\}/g, (match, reqName, path) => {
      try {
        const store = JSON.parse(localStorage.getItem('jetapi_response_store') || '{}');
        const respData = store[reqName];
        if (!respData) return match;
        const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], respData);
        return value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : match;
      } catch { return match; }
    });

    return interpolated;
  };

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    // Calculate new percentage based on mouse Y position within the main content div
    const containerRect = containerRef.current.getBoundingClientRect();
    const offsetY = e.clientY - containerRect.top;
    const newHeightPercentage = (offsetY / containerRect.height) * 100;
    
    // Clamp between 20% and 80% to ensure both panels stay visible
    const clampedHeight = Math.min(Math.max(newHeightPercentage, 20), 80);
    setPanelHeight(clampedHeight);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSidebarMouseDown = useCallback(() => {
    setIsSidebarDragging(true);
  }, []);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isSidebarDragging || !mainContainerRef.current) return;
    
    const containerRect = mainContainerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - containerRect.left;
    
    // Clamp between 150px and window bounds (leaving at least 300px for main content)
    const maxSidebarWidth = typeof window !== 'undefined' ? window.innerWidth - 300 : 800;
    const clampedWidth = Math.min(Math.max(offsetX, 150), maxSidebarWidth);
    setSidebarWidth(clampedWidth);
  }, [isSidebarDragging]);

  const handleSidebarMouseUp = useCallback(() => {
    setIsSidebarDragging(false);
  }, []);

  useEffect(() => {
    const handleDuplicate = (e: any) => {
      const { originalRequest } = e.detail;
      if (!originalRequest) return;
      const newReq = {
        ...originalRequest,
        id: 'new',
        name: originalRequest.name + ' Copy',
        // Clear metadata that shouldn't be copied identically
        createdAt: undefined,
        updatedAt: undefined,
        _breadcrumb: undefined
      };
      setOpenRequests(prev => {
        // Replace any existing 'new' tab with the cloned block structurally
        return [...prev.filter(p => p.id !== 'new'), newReq];
      });
      setActiveRequestId(newReq.id);
      setRightPanelOpen(null);
    };
    
    window.addEventListener('duplicate-request', handleDuplicate);
    return () => window.removeEventListener('duplicate-request', handleDuplicate);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else if (isSidebarDragging) {
      window.addEventListener('mousemove', handleSidebarMouseMove);
      window.addEventListener('mouseup', handleSidebarMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleSidebarMouseMove);
      window.removeEventListener('mouseup', handleSidebarMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleSidebarMouseMove);
      window.removeEventListener('mouseup', handleSidebarMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, isSidebarDragging, handleSidebarMouseMove, handleSidebarMouseUp]);

  if (!isAppReady || !isInitialized) {
    return (
      <div className="flex w-full h-full bg-[var(--background)] overflow-hidden animate-pulse">
        {/* Sidebar Skeleton */}
        <div className="w-72 flex-shrink-0 h-full border-r border-[var(--border)] flex flex-col bg-[var(--sidebar)]">
           <div className="h-14 border-b border-[var(--border)] flex items-center px-4">
             <div className="w-32 h-5 bg-[var(--border)]/60 rounded"></div>
             <div className="w-8 h-8 bg-[var(--border)]/40 rounded-full ml-auto"></div>
           </div>
           <div className="flex-1 p-4 flex flex-col gap-4">
             <div className="w-full h-7 bg-[var(--border)]/40 rounded"></div>
             <div className="w-5/6 h-6 bg-[var(--border)]/30 rounded ml-2"></div>
             <div className="w-4/5 h-6 bg-[var(--border)]/30 rounded ml-2"></div>
             <div className="w-full h-7 bg-[var(--border)]/40 rounded mt-4"></div>
             <div className="w-3/4 h-6 bg-[var(--border)]/30 rounded ml-2"></div>
           </div>
        </div>
        
        {/* Main IDE Area Skeleton */}
        <div className="flex-1 flex flex-col h-full bg-[var(--background)]">
           {/* Tab Bar Skeleton */}
           <div className="h-10 border-b border-[var(--border)] flex items-center px-2 bg-[var(--sidebar)] gap-1">
             <div className="w-40 h-full border-r border-[var(--border)] bg-[var(--card)] px-3 flex items-center">
               <div className="w-24 h-3 bg-[var(--border)]/50 rounded"></div>
             </div>
             <div className="w-8 h-8 bg-[var(--border)]/30 rounded ml-1"></div>
           </div>
           
           <div className="flex-1 flex flex-col">
             {/* Request Pane Skeleton */}
             <div className="flex-1 border-b border-[var(--border)] flex flex-col">
                <div className="flex items-center gap-2 p-3 pb-1">
                   <div className="w-24 h-10 bg-[var(--border)]/40 rounded-md"></div>
                   <div className="flex-1 h-10 bg-[var(--border)]/30 rounded-md relative flex items-center px-3">
                      <div className="w-1/2 h-3 bg-[var(--border)]/40 rounded"></div>
                      <div className="w-20 h-7 bg-[var(--color-brand-500)]/40 rounded ml-auto"></div>
                   </div>
                </div>
                <div className="flex items-center gap-4 px-4 py-2 border-b border-[var(--border)]">
                   <div className="w-16 h-4 bg-[var(--color-brand-500)]/50 rounded"></div>
                   <div className="w-16 h-4 bg-[var(--border)]/50 rounded"></div>
                   <div className="w-16 h-4 bg-[var(--border)]/50 rounded"></div>
                </div>
                <div className="flex-1 p-4">
                   <div className="w-3/4 h-32 bg-[var(--card)] border border-[var(--border)] rounded-md"></div>
                </div>
             </div>
             
             {/* Response Pane Skeleton */}
             <div className="flex-1 bg-[var(--background)] flex flex-col border-t border-[var(--border)]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
                   <div className="flex gap-4">
                     <div className="w-12 h-4 bg-[var(--border)]/60 rounded"></div>
                     <div className="w-16 h-4 bg-[var(--border)]/60 rounded"></div>
                   </div>
                   <div className="flex gap-4">
                     <div className="w-24 h-3 bg-[var(--border)]/50 rounded"></div>
                     <div className="w-16 h-3 bg-[var(--border)]/50 rounded"></div>
                   </div>
                </div>
                <div className="flex items-center gap-4 px-3 py-2 border-b border-[var(--border)]">
                   <div className="w-32 h-6 bg-[var(--border)]/30 rounded"></div>
                </div>
                <div className="flex-1 p-4 flex flex-col gap-3">
                   <div className="w-full h-3 bg-[var(--border)]/30 rounded"></div>
                   <div className="w-5/6 h-3 bg-[var(--border)]/30 rounded"></div>
                   <div className="w-4/5 h-3 bg-[var(--border)]/30 rounded"></div>
                   <div className="w-2/3 h-3 bg-[var(--border)]/30 rounded"></div>
                </div>
             </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden relative" ref={mainContainerRef}>
      {/* Invisible overlay for capturing mouse moves without iframe/text selection interference */}
      {(isDragging || isSidebarDragging) && (
        <div 
          className="absolute inset-0 z-50 pointer-events-auto" 
          style={{ cursor: isDragging ? 'row-resize' : 'col-resize' }} 
          onMouseUp={() => { setIsDragging(false); setIsSidebarDragging(false); }}
          onMouseLeave={() => { setIsDragging(false); setIsSidebarDragging(false); }}
        />
      )}
      
      {/* Sidebar for Collections and Workspaces */}
      <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0 flex flex-col h-full overflow-hidden shrink-0">
        <Sidebar 
          workspaces={workspaces}
          activeWorkspace={activeWorkspaceId}
          sharedCollections={sharedCollections}
          onSelectRequest={(req: any) => {
            if (!req) {
              setActiveRequestId(null);
              return;
            }
            setOpenRequests(prev => {
              if (!prev.find(p => p.id === req.id)) {
                return [...prev, req];
              }
              return prev;
            });
            setActiveRequestId(req.id);
            setRightPanelOpen(null);
          }} 
          activeRequestId={activeRequestId}
        />
      </div>

      {/* Vertical Draggable Divider for Sidebar */}
      <div 
        className="w-1 bg-[var(--border)] hover:bg-[var(--color-brand-500)] cursor-col-resize flex-shrink-0 relative group z-10 transition-colors"
        onMouseDown={handleSidebarMouseDown}
      >
        {/* Invisible wider grab area */}
        <div className="absolute inset-y-0 -left-1 -right-1"></div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        <div className="flex flex-1 flex-col overflow-hidden" ref={containerRef}>
          {/* Tab Bar */}
          <div className="flex items-center overflow-x-auto bg-[var(--sidebar)] border-b border-[var(--border)] custom-scrollbar shrink-0 h-10 w-full">
            {openRequests.map(req => (
              <div 
                key={req.id} 
                className={`group flex flex-shrink-0 items-center h-full border-r border-[var(--border)] pl-3 pr-2 min-w-[120px] max-w-[220px] cursor-pointer transition-colors relative select-none ${
                  activeRequestId === req.id ? 'bg-[var(--card)] tab-active-glow' : 'bg-transparent hover:bg-[var(--card)]/50'
                }`}
                onClick={() => setActiveRequestId(req.id)}
                title={`${req.method || 'GET'} ${req.name || 'Untitled'}\n${req.url || ''}\nLast modified: ${req.updatedAt ? new Date(req.updatedAt).toLocaleString() : 'never'}`}
              >
                {/* Active Indicator Bar */}
                {activeRequestId === req.id && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-brand-500)]" />
                )}
                
                <div className="flex-1 text-xs font-medium flex items-center gap-2 overflow-hidden">
                  <span className={`font-mono text-[10px] font-bold ${
                    req.method === 'GET' ? 'text-green-500' : 
                    req.method === 'POST' ? 'text-orange-500' :
                    req.method === 'PUT' ? 'text-blue-500' : 
                    req.method === 'DELETE' ? 'text-red-500' : 
                    req.method === 'PATCH' ? 'text-yellow-500' : 'text-[var(--foreground)]'
                  }`}>{req.method?.substring(0,3)}</span>
                  <span className={`truncate ${activeRequestId === req.id ? 'text-[var(--foreground)]' : 'text-[var(--muted)] group-hover:text-[var(--foreground)]'}`}>
                    {req.name || 'Untitled'}
                  </span>
                </div>
                
                <button 
                  className={`ml-1.5 p-1 rounded-md hover:bg-[var(--border)] transition-opacity ${activeRequestId === req.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const newOpen = openRequests.filter(r => r.id !== req.id);
                    setOpenRequests(newOpen);
                    if (activeRequestId === req.id) {
                      setActiveRequestId(newOpen.length > 0 ? newOpen[newOpen.length - 1].id : null);
                    }
                  }}
                  title="Close Tab"
                >
                  <X className="w-3.5 h-3.5 text-[var(--muted)] hover:text-[var(--foreground)]" />
                </button>
              </div>
            ))}
            {openRequests.length === 0 && (
              <div className="text-xs text-[var(--muted)] px-4">No open tabs</div>
            )}
            
            <button 
              onClick={() => {
                const newId = `new-${Date.now()}`;
                setOpenRequests(prev => [...prev, {
                  id: newId,
                  name: 'Untitled Request',
                  method: 'GET',
                  url: '',
                  headers: [],
                  params: [],
                  body: '',
                  _isNew: true
                }]);
                setActiveRequestId(newId);
                setRightPanelOpen(null);
              }}
              className="ml-2 p-1 border border-transparent hover:border-[var(--border)] hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-all flex items-center justify-center shrink-0 cursor-pointer"
              title="New Request"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* URL and Request Params panel */}
          <div 
            className="flex flex-col bg-[var(--background)]"
            style={{ height: `${panelHeight}%` }}
          >
            {activeRequest ? (
              <RequestPanel 
                request={activeRequest} 
                isSaving={isSavingEndpoint}
                onChange={(updatedReq: any) => {
                  setOpenRequests(openRequests.map(r => r.id === updatedReq.id ? updatedReq : r));
                }}
                onDelete={async (req: any) => {
                  if (String(req.id).startsWith('new') || req._isNew) {
                    setOpenRequests(prev => prev.filter(r => r.id !== req.id));
                    setActiveRequestId(null);
                    return;
                  }
                  if (!(await confirmDialog("Are you sure you want to delete this Request? This cannot be undone."))) return;
                  try {
                    const res = await apiFetch(`/requests/${req.id}`, { method: 'DELETE' });
                    if (!res.ok) { toast.error(await getApiError(res, "Failed to delete request")); return; }
                    toast.success("Request deleted successfully");
                    setOpenRequests(prev => prev.filter(r => r.id !== req.id));
                    setActiveRequestId(null);
                    window.dispatchEvent(new Event('postclone-refresh-sidebar'));
                  } catch (e) {
                    toast.error("Failed to delete request.");
                  }
                }}
              onSave={async (req: any) => {
                if (!req.id || req.id === 'new') {
                  openSaveModal(req);
                  return;
                }
                setIsSavingEndpoint(true);
                try {
                  const res = await apiFetch(`/requests/${req.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(req)
                  });
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || 'Failed to save');
                  }
                  // update active request with saved data
                  const saved = await res.json();
                  setOpenRequests(prev => prev.map(r => r.id === saved.id ? saved : r));
                } catch (e: any) {
                  toast.error("Error saving request: " + e.message);
                } finally {
                  setIsSavingEndpoint(false);
                }
              }}
              onSaveAs={(req: any) => openSaveModal({ ...req, id: 'new', name: req.name + ' Copy' })}
              onSend={async (reqData: any) => {
                // Create a new AbortController for this request
                const controller = new AbortController();
                abortControllerRef.current = controller;
                setLoading(true);
                try {
                  // Process Authorization Tab Injection
                  let finalHeaders = typeof reqData.headers === 'object' && reqData.headers !== null ? { ...reqData.headers } : {};
                  
                  if (reqData.auth) {
                    if (reqData.auth.type === 'bearer' && reqData.auth.bearerToken) {
                      finalHeaders['Authorization'] = `Bearer ${interpolate(reqData.auth.bearerToken)}`;
                    } else if (reqData.auth.type === 'basic') {
                      const user = interpolate(reqData.auth.basicUsername || '');
                      const pass = interpolate(reqData.auth.basicPassword || '');
                      if (user || pass) {
                        const base64 = typeof btoa !== 'undefined' ? btoa(`${user}:${pass}`) : Buffer.from(`${user}:${pass}`).toString('base64');
                        finalHeaders['Authorization'] = `Basic ${base64}`;
                      }
                    }
                  }

                  // Interpolate Environment Variables & collapse double-slashes (e.g. from trailing slash env vars)
                  let cleanUrl = interpolate(reqData.url) || "";
                  
                  // Collapse accidental double slashes (like https://domain.com//api) but preserve the protocol ://
                  cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, "$1");
                  
                  // Auto-inject http:// if protocol is missing so Axios doesn't crash with "Invalid URL"
                  if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                    cleanUrl = 'http://' + cleanUrl;
                  }

                  // Process Body Type Validation & Serialization
                  let payloadData = undefined;
                  const bd = reqData.body;
                  if (bd && typeof bd === 'object' && bd.mode) {
                    if (bd.mode === 'raw') {
                       payloadData = interpolate(bd.raw?.data || '');
                       if (!finalHeaders['Content-Type']) {
                         if (bd.raw?.language === 'json') finalHeaders['Content-Type'] = 'application/json';
                         else if (bd.raw?.language === 'xml') finalHeaders['Content-Type'] = 'application/xml';
                         else if (bd.raw?.language === 'html') finalHeaders['Content-Type'] = 'text/html';
                         else if (bd.raw?.language === 'javascript') finalHeaders['Content-Type'] = 'application/javascript';
                         else if (bd.raw?.language === 'text') finalHeaders['Content-Type'] = 'text/plain';
                       }
                    } else if (bd.mode === 'urlencoded') {
                       const uParams = new URLSearchParams();
                       (bd.urlencoded || []).filter((v: any) => v.enabled !== false && v.key).forEach((v: any) => {
                         uParams.append(v.key, interpolate(v.value));
                       });
                       payloadData = uParams.toString();
                       finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
                    } else if (bd.mode === 'graphql') {
                       payloadData = JSON.stringify({
                         query: interpolate(bd.graphql?.query || ''),
                         variables: interpolate(bd.graphql?.variables || '{}')
                       });
                       finalHeaders['Content-Type'] = 'application/json';
                    } else if (bd.mode === 'formdata') {
                       // Proxy will intercept this and native-wrap it
                       payloadData = { 
                         _isFormData: true, 
                         items: (bd.formdata || []).map((v:any) => ({ key: v.key, value: interpolate(v.value), enabled: v.enabled })) 
                       };
                    }
                  } else if (typeof bd === 'string') {
                     payloadData = interpolate(bd);
                  }

                  // Merge query params from UI table into the URL
                  const uiParams = reqData.params || {};
                  if (Object.keys(uiParams).length > 0) {
                    try {
                      const urlObj = new URL(cleanUrl);
                      Object.entries(uiParams).forEach(([k, v]: [string, any]) => {
                        if (!urlObj.searchParams.has(k)) {
                          urlObj.searchParams.set(k, v || '');
                        }
                      });
                      cleanUrl = urlObj.toString();
                    } catch {
                      // If URL parsing fails, append manually
                      const paramStr = Object.entries(uiParams)
                        .map(([k, v]: [string, any]) => `${encodeURIComponent(k)}=${encodeURIComponent(v || '')}`)
                        .join('&');
                      if (paramStr) {
                        cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + paramStr;
                      }
                    }
                  }

                  const payload = {
                    ...reqData,
                    url: cleanUrl,
                    body: payloadData,
                    headers: Object.keys(finalHeaders).reduce((acc: any, key: string) => { 
                      acc[key] = typeof finalHeaders[key] === 'string' ? interpolate(finalHeaders[key]) : finalHeaders[key]; 
                      return acc; 
                    }, {}),
                    params: undefined
                  };

                  // API Call to our NestJS proxy
                  const res = await apiFetch("/proxy/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                  });
                  
                  const data = await res.json();
                  setResponseData(data);

                  // Execute test scripts if present
                  if (activeRequest?.testScript?.trim()) {
                    const results = runTestScript(activeRequest.testScript, {
                      status: data.status,
                      statusText: data.statusText || '',
                      headers: data.headers || {},
                      data: data.data,
                      timeMs: data.timeMs || 0,
                      size: data.size || 0,
                    });
                    setTestResults(results);
                  } else {
                    setTestResults([]);
                  }

                  // Request chaining: store response data for {{$response.x}} syntax
                  try {
                    localStorage.setItem('jetapi_last_response', JSON.stringify(data.data || data));
                    if (activeRequest?.name) {
                      const store = JSON.parse(localStorage.getItem('jetapi_response_store') || '{}');
                      store[activeRequest.name] = data.data || data;
                      localStorage.setItem('jetapi_response_store', JSON.stringify(store));
                    }
                  } catch {}

                  // Save to History
                  window.dispatchEvent(new CustomEvent('jetapi-history-push', { detail: {
                    method: reqData.method || 'GET',
                    url: reqData.url || '',
                    name: activeRequest?.name || 'Untitled',
                    status: data.status,
                    timeMs: data.timeMs || 0,
                    timestamp: new Date().toISOString(),
                    request: { ...activeRequest, _isNew: undefined },
                  }}));
                } catch (err: any) {
                  if (err.name === 'AbortError') {
                    setResponseData({ error: 'Request cancelled by user', status: 0 });
                  } else {
                    setResponseData({ error: err.message });
                  }
                } finally {
                  abortControllerRef.current = null;
                  setLoading(false);
                }
              }}
              loading={loading}
              onCancel={() => {
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                  abortControllerRef.current = null;
                }
              }}
              envVariables={[...envVariables, ...globalVariables]}
            />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] bg-[var(--card)]/30">
                <div className="bg-[var(--sidebar)] p-4 rounded-2xl mb-4 border border-[var(--border)] shadow-sm empty-float">
                  <svg className="w-12 h-12 text-[var(--color-brand-500)]/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tight mb-2">No Request Selected</h3>
                <p className="text-sm max-w-sm text-center opacity-80 mb-6">Select a mapped endpoint from the Sidebar or instantly generate a new interactive workspace tab.</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      const newId = `new-${Date.now()}`;
                      setOpenRequests(prev => [...prev, {
                        id: newId,
                        name: 'Untitled Request',
                        method: 'GET',
                        url: '',
                        headers: [],
                        params: [],
                        body: '',
                        _isNew: true
                      }]);
                      setActiveRequestId(newId);
                      setRightPanelOpen(null);
                    }}
                    className="px-5 py-2.5 bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-600)] rounded-lg font-semibold text-xs flex items-center gap-2 transition-all shadow-lg hover:shadow-[var(--color-brand-500)]/20 active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Create New Request
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Draggable Divider */}
          <div 
            className="h-1 bg-[var(--border)] hover:bg-[var(--color-brand-500)] cursor-row-resize transition-colors flex-shrink-0 relative group z-10"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-x-0 -top-1 -bottom-1"></div>
          </div>

          {/* Response Panel */}
          <div className="flex-1 flex flex-col bg-[var(--background)] overflow-hidden" style={{ minHeight: '20%' }}>
            <ResponsePanel 
              response={responseData}
              loading={loading}
              request={activeRequest}
              testResults={testResults}
            />
          </div>
        </div>
      </div>

      {/* Conditionally Render Slide-out Panels */}
      {rightPanelOpen === 'variables' && activeRequest && (
        <VariablesPanel
          request={activeRequest}
          envVariables={envVariables}
          globalVariables={globalVariables}
          activeEnvName={environments.find((e: any) => e.id === activeEnvId)?.name || 'No Environment'}
          onClose={() => setRightPanelOpen(null)}
        />
      )}

      {rightPanelOpen === 'docs' && activeRequest && (
        <DocumentationPanel
          request={activeRequest}
          envVariables={[...globalVariables, ...envVariables]}
          onClose={() => setRightPanelOpen(null)}
        />
      )}

      {rightPanelOpen === 'code' && activeRequest && (
        <CodeSnippetPanel 
           request={activeRequest} 
           onClose={() => setRightPanelOpen(null)} 
           envVariables={[...globalVariables, ...envVariables]}
        />
      )}

      {rightPanelOpen === 'comments' && activeRequest && (
        <CommentsPanel
          request={activeRequest}
          onClose={() => setRightPanelOpen(null)}
        />
      )}

      {rightPanelOpen === 'diff' && (
        <ResponseDiffPanel
          onClose={() => setRightPanelOpen(null)}
        />
      )}

      {/* Right Context Menu */}
      <RightSidebar 
        activePanel={rightPanelOpen} 
        onTogglePanel={(panel: string) => setRightPanelOpen(prev => prev === panel ? null : panel)} 
        activeTab={activeRequestId || undefined} 
      />

      {/* Save Modal (Postman 1:1 Layout) */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center modal-backdrop">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg w-full max-w-3xl h-[750px] shadow-2xl flex flex-col overflow-hidden modal-content">
            
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--sidebar)]">
              <h2 className="text-base font-semibold text-[var(--foreground)]">Save Request</h2>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Main Body Stack */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[var(--background)]">
              
              {/* Top: Details */}
              <div className="p-5 flex flex-col gap-4 shrink-0 bg-[var(--background)]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] mb-1">Request name</label>
                  <input 
                    type="text" 
                    value={saveRequestName}
                    onChange={(e) => setSaveRequestName(e.target.value)}
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    placeholder="Request Name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] mb-1">Request description (Optional)</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)] resize-none transition-colors custom-scrollbar"
                    placeholder="Write a description representing this endpoint..."
                  />
                </div>
              </div>

              {/* Middle: Explorer Tree */}
              <div className="flex-1 flex flex-col px-5 pb-2 overflow-hidden">
                <label className="block text-xs font-semibold text-[var(--muted)] mb-2">Select a collection or folder to save to:</label>
                
                <div className="flex-1 flex flex-col border border-[var(--border)] rounded-md overflow-hidden bg-[var(--sidebar)]/30">
                  {/* Target Selector Header */}
                  <div className="p-2.5 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--card)]">
                    <div className="flex-1 flex items-center gap-2 bg-[var(--background)] border border-[var(--border)] rounded px-3 py-1.5 focus-within:border-[var(--color-brand-500)] transition-colors">
                      <Search className="w-4 h-4 text-[var(--muted)]" />
                      <input 
                        type="text" 
                        placeholder="Search collections or folders..." 
                        value={saveSearchQuery}
                        onChange={(e) => setSaveSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-[var(--foreground)] w-full placeholder-[var(--muted)]"
                      />
                    </div>
                    <StyledSelect
                      options={[
                        { value: '', label: 'Select Workspace' },
                        ...saveWorkspaces.map(w => ({ value: w.id, label: w.name }))
                      ]}
                      value={saveTargetWorkspaceId}
                      onChange={(val) => {
                        setSaveTargetWorkspaceId(val);
                        setSaveTargetCollectionId('');
                        setSaveTargetFolder('');
                      }}
                      size="sm"
                      className="max-w-[200px]"
                    />
                  </div>
              
              {/* Explorer Tree */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {(() => {
                  const targetWs = saveWorkspaces.find(w => w.id === saveTargetWorkspaceId);
                  const targetCollections = targetWs?.collections || [];
                  
                  if (targetCollections.length === 0) {
                    return (
                       <div className="flex flex-col items-center justify-center h-full text-[var(--muted)] opacity-70">
                         <Folder className="w-12 h-12 mb-2" />
                         <p className="text-sm">No collections found in this workspace</p>
                       </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-1">
                      {targetCollections
                        .filter((c: any) => c.name.toLowerCase().includes(saveSearchQuery.toLowerCase()))
                      .map((col: any) => {
                        
                        // Extract unique folders and map existing requests for this collection
                        const foldersObj: any = { name: 'root', path: '', children: {}, requests: [] };
                        (col.requests || [])
                          .filter((req: any) => req.name?.toLowerCase().includes(saveSearchQuery.toLowerCase()) || req.folder?.toLowerCase().includes(saveSearchQuery.toLowerCase()) || !saveSearchQuery)
                          .forEach((req: any) => {
                            if (req.folder) {
                              const parts = req.folder.split('/');
                              let current = foldersObj;
                              for (let i = 0; i < parts.length; i++) {
                                const part = parts[i];
                                if (!current.children[part]) {
                                  current.children[part] = { name: part, path: parts.slice(0, i+1).join('/'), children: {}, requests: [] };
                                }
                                current = current.children[part];
                              }
                              current.requests.push(req);
                            } else {
                              foldersObj.requests.push(req);
                            }
                        });

                        const isColSelected = saveTargetCollectionId === col.id && saveTargetFolder === '';
                        const colNodeId = `col-${col.id}`;
                        const isColExpanded = saveSearchQuery ? true : saveExpandedNodes[colNodeId];

                        return (
                          <div key={col.id} className="mb-2">
                            <div className="flex items-center gap-1 group">
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSaveExpandedNodes(prev => ({ ...prev, [colNodeId]: !prev[colNodeId] }));
                                }}
                                className="p-1 cursor-pointer rounded hover:bg-[var(--border)] text-[var(--muted)]"
                              >
                                {isColExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </div>
                              <div 
                                onClick={() => {
                                  setSaveTargetCollectionId(col.id);
                                  setSaveTargetFolder('');
                                  setSaveExpandedNodes(prev => ({ ...prev, [colNodeId]: true }));
                                }}
                                className={`flex-1 flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm ${isColSelected ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] font-medium' : 'hover:bg-[var(--border)] text-[var(--foreground)]'}`}
                              >
                                <Folder className={`w-4 h-4 ${isColSelected ? 'text-[var(--color-brand-500)]' : 'text-[var(--muted)]'}`} />
                                <span className="flex-1">{col.name}</span>
                              </div>
                              {isColSelected && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const folderName = await promptDialog(`Create new folder in ${col.name}:`);
                                    if (folderName) {
                                       setSaveTargetFolder(folderName);
                                       toast.success(`Target directory set: /${folderName}`);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--sidebar)] rounded transition-opacity text-[var(--muted)] hover:text-[var(--color-brand-500)] flex shrink-0"
                                  title="Create sub-folder"
                                >
                                  <FolderPlus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            
                            {/* Render extracted folders and requests inside the collection */}
                            {isColExpanded && (Object.keys(foldersObj.children).length > 0 || foldersObj.requests.length > 0) && (
                              <div className="ml-6 border-l border-[var(--border)] pl-1 mt-0.5">
                                {Object.values(foldersObj.children).map((childFolder: any) => {
                                  const renderFolderTree = (node: any) => {
                                    const isFolderSelected = saveTargetCollectionId === col.id && saveTargetFolder === node.path;
                                    const hasChildren = Object.keys(node.children).length > 0 || node.requests.length > 0;
                                    const folderNodeId = `folder-${col.id}-${node.path}`;
                                    const isFolderExpanded = saveSearchQuery ? true : saveExpandedNodes[folderNodeId];
                                    
                                    return (
                                      <div key={node.path} className="mt-0.5">
                                        <div className="flex items-center gap-1 group">
                                          <div 
                                            onClick={(e) => {
                                              if (!hasChildren) return;
                                              e.stopPropagation();
                                              setSaveExpandedNodes(prev => ({ ...prev, [folderNodeId]: !prev[folderNodeId] }));
                                            }}
                                            className={`p-1 rounded ${hasChildren ? 'cursor-pointer hover:bg-[var(--border)] text-[var(--muted)]' : 'opacity-0'}`}
                                          >
                                            {isFolderExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          </div>
                                        <div 
                                          onClick={() => {
                                            setSaveTargetCollectionId(col.id);
                                            setSaveTargetFolder(node.path);
                                            setSaveExpandedNodes(prev => ({ ...prev, [folderNodeId]: true }));
                                          }}
                                          className={`flex-1 flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm ${isFolderSelected ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] font-medium' : 'hover:bg-[var(--border)] text-[var(--foreground)]'}`}
                                        >
                                          <Folder className={`w-3.5 h-3.5 ${isFolderSelected ? 'text-[var(--color-brand-500)]' : 'text-[var(--muted)]'}`} />
                                          <span className="flex-1 truncate">{node.name}</span>
                                        </div>
                                        {isFolderSelected && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const folderName = await promptDialog(`Create sub-folder inside ${node.name}:`);
                                              if (folderName) {
                                                const newPath = `${node.path}/${folderName}`;
                                                setSaveTargetFolder(newPath);
                                                toast.success(`Target directory set: /${newPath}`);
                                              }
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--sidebar)] rounded transition-opacity text-[var(--muted)] hover:text-[var(--color-brand-500)] flex shrink-0"
                                            title="Create sub-folder"
                                          >
                                            <FolderPlus className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      
                                      {isFolderExpanded && (
                                        <div className="ml-6 border-l border-[var(--border)] pl-1 mt-0.5">
                                          {Object.values(node.children).map((c: any) => renderFolderTree(c))}
                                          {node.requests.map((r: any) => (
                                            <div key={r.id} className="flex items-center gap-2 p-1.5 ml-2 text-xs text-[var(--muted)] opacity-60">
                                              <span className="px-1 py-0.5 rounded bg-[var(--border)] text-[8px] font-bold">{r.method}</span>
                                              <span className="truncate">{r.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                };

                                return renderFolderTree(childFolder);
                              })}
                              {foldersObj.requests.map((r: any) => (
                                <div key={r.id} className="flex items-center gap-2 p-1.5 ml-8 text-xs text-[var(--muted)] opacity-60">
                                  <span className="px-1 py-0.5 rounded bg-[var(--border)] text-[8px] font-bold">{r.method}</span>
                                  <span className="truncate">{r.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
          
          {/* Bottom Action Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--sidebar)] flex items-center justify-between shrink-0">
             <button
               onClick={async () => {
                 const name = await promptDialog("Enter new collection name:");
                 if (name && saveTargetWorkspaceId) {
                   try {
                     const res = await apiFetch("/collections", {
                       method: "POST",
                       headers: { "Content-Type": "application/json" },
                       body: JSON.stringify({ name, workspaceId: saveTargetWorkspaceId })
                     });
                     if (res.ok) {
                       const wsRes = await apiFetch(`/workspaces?organizationId=${activeOrganizationId}`);
                       if (wsRes.ok) setSaveWorkspaces(await wsRes.json());
                       window.dispatchEvent(new Event('postclone-refresh-sidebar'));
                       toast.success("Collection created successfully!");
                     } else {
                       toast.error(await getApiError(res, "Failed to create collection"));
                     }
                   } catch (e: any) { toast.error("Failed to create collection"); }
                 }
               }}
               disabled={!saveTargetWorkspaceId}
               className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--color-brand-500)] disabled:opacity-50 transition-colors p-2"
               title="New Collection"
             >
               <FolderPlus className="w-4 h-4" />
               New Collection
             </button>
             
             <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-5 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExecuteSave}
                  disabled={!saveTargetCollectionId || !saveRequestName || isSavingModal}
                  className="px-6 py-2 flex items-center justify-center gap-2 text-sm font-bold text-white bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingModal && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saveTargetFolder ? `Save to ${saveTargetFolder.split('/').pop()}` : saveTargetCollectionId ? `Save to Collection` : 'Save'}
                </button>
             </div>
          </div>
        </div>
      </div>
    )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        workspaces={workspaces}
        onSelectRequest={(req: any) => {
          setOpenRequests(prev => {
            if (!prev.find(p => p.id === req.id)) return [...prev, req];
            return prev;
          });
          setActiveRequestId(req.id);
          setRightPanelOpen(null);
        }}
      />

    </div>
  );
}
