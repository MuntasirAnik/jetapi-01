"use client";
import { apiFetch, copyToClipboard } from '@/lib/api';
import { useState, useEffect, useRef } from "react";
import { Folder, Play, Plus, Server, ChevronRight, ChevronDown, Upload, Import, Trash2, Search, Share2, Globe, Clock, Users, MoreHorizontal, FilePlus, FolderPlus, Edit2, Copy, Link, Sparkles, FileText, Files, Loader2, BookOpen } from "lucide-react";
import { toast } from "react-toastify";
import EnvironmentManager from "./EnvironmentManager";
import ShareCollectionModal from "./ShareCollectionModal";
import { useDialog } from "./DialogProvider";
import { useAppContext } from "@/lib/AppContext";
import ImportCollectionModal from "./ImportCollectionModal";

export default function Sidebar({ workspaces = [], activeWorkspace, sharedCollections = [], onSelectRequest, activeRequestId }: any) {
  const { confirmDialog, promptDialog } = useDialog();
  const { envVariables, globalVariables } = useAppContext();
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const loadedStateRef = useRef(false);

  useEffect(() => {
    try {
      const savedCol = localStorage.getItem("sidebar_expanded_collections");
      const savedFol = localStorage.getItem("sidebar_expanded_folders");
      const savedTab = localStorage.getItem("sidebar_active_tab");
      if (savedCol) setExpandedCollections(JSON.parse(savedCol));
      if (savedFol) setExpandedFolders(JSON.parse(savedFol));
      if (savedTab) setActiveTab(savedTab as any);
    } catch(e) {}
    // Need timeout to allow NextJS hydration cycle to complete fully before committing overwrites
    setTimeout(() => { loadedStateRef.current = true; }, 100);
  }, []);

  useEffect(() => {
    if (loadedStateRef.current) localStorage.setItem("sidebar_expanded_collections", JSON.stringify(expandedCollections));
  }, [expandedCollections]);

  useEffect(() => {
    if (loadedStateRef.current) localStorage.setItem("sidebar_expanded_folders", JSON.stringify(expandedFolders));
  }, [expandedFolders]);

  const [searchQuery, setSearchQuery] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'collections' | 'apis' | 'environments' | 'history'>('collections');

  useEffect(() => {
    if (loadedStateRef.current) localStorage.setItem("sidebar_active_tab", activeTab);
  }, [activeTab]);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [isEnvManagerOpen, setIsEnvManagerOpen] = useState(false);
  const [envManagerInitialTab, setEnvManagerInitialTab] = useState<'environments' | 'globals'>('environments');
  const [envManagerInitialEnvId, setEnvManagerInitialEnvId] = useState<string | null>(null);
  const [shareModalData, setShareModalData] = useState<{ id: string, name: string } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    id: string;
    name: string;
    type: 'collection' | 'folder' | 'request';
    x: number;
    y: number;
    folderPath?: string;
  } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenuClick = (e: React.MouseEvent, type: 'collection' | 'folder' | 'request', id: string, name: string, folderPath?: string) => {
    e.stopPropagation();
    
    // Dynamically prevent the native menu from bleeding off the bottom of the viewport
    const estimatedHeight = type === 'request' ? 350 : type === 'collection' ? 280 : 150;
    let yPos = e.clientY + 10;
    
    if (typeof window !== 'undefined' && yPos + estimatedHeight > window.innerHeight) {
      yPos = Math.max(10, e.clientY - estimatedHeight);
    }
    
    // Defer state update to next tick so native document click listeners don't instantly close it
    setTimeout(() => {
      setContextMenu({ type, id, name, x: e.clientX, y: yPos, folderPath });
    }, 0);
  };

  const handleAddRequestFromContext = () => {
    if (!contextMenu) return;
    const breadcrumb = [contextMenu.name];
    let fb = undefined;
    if (contextMenu.type === 'collection') {
      const col = workspaces.flatMap((w:any)=>w.collections||[]).find((c:any) => c.id === contextMenu.id);
      breadcrumb[0] = col?.name || "Unknown";
    } else if (contextMenu.type === 'folder' && contextMenu.folderPath) {
      const col = workspaces.flatMap((w:any)=>w.collections||[]).find((c:any) => c.id === contextMenu.id);
      breadcrumb[0] = col?.name || "Unknown";
      breadcrumb.push(...contextMenu.folderPath.split('/'));
      fb = contextMenu.folderPath;
    }
    
    onSelectRequest({ 
      id: 'new', 
      collectionId: contextMenu.id,
      folder: fb,
      method: 'GET', 
      url: '', 
      name: 'New Request',
      _breadcrumb: breadcrumb
    });
  };

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id);
      } catch(e) {
        console.error("Failed to parse user data:", e);
      }
    }
  }, []);

  // Environments are now loaded globally by AppContext — no local fetch needed.
  const fetchEnvs = () => {}; // kept as no-op for EnvironmentManager onClose callback

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev: Record<string, boolean>) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleExport = async (e: React.MouseEvent, collectionId: string, collectionName: string) => {
    e.stopPropagation(); // prevent expanding the folder
    try {
      const res = await apiFetch(`/collections/${collectionId}/export`);
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collectionName.replace(/\s+/g, '_').toLowerCase()}.postclone.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export collection.");
    }
  };

  const handleExportDocs = async (e: React.MouseEvent, collectionId: string, collectionName: string) => {
    e.stopPropagation();
    try {
      toast.info('Generating documentation...');
      const res = await apiFetch(`/collections/${collectionId}/export`);
      const data = await res.json();
      const items = data?.item || [];
      const allVars = [...(globalVariables || []), ...(envVariables || [])];

      const interpolate = (str: string) => {
        if (typeof str !== 'string') return str;
        let result = str;
        allVars.filter(v => v.enabled !== false && v.key).forEach(v => {
          result = result.replace(new RegExp(`\\{\\{\\s*${v.key}\\s*\\}\\}`, 'g'), v.value || '');
        });
        return result;
      };
      const walkInterp = (obj: any) => {
        for (const key in obj) {
          if (typeof obj[key] === 'string') obj[key] = interpolate(obj[key]);
          else if (typeof obj[key] === 'object' && obj[key] !== null) walkInterp(obj[key]);
        }
      };

      const methodColors: Record<string, string> = {
        GET: '#10b981', POST: '#f59e0b', PUT: '#3b82f6',
        PATCH: '#a855f7', DELETE: '#ef4444', OPTIONS: '#6b7280', HEAD: '#06b6d4',
      };

      // Flatten items (handle folders)
      type FlatItem = { name: string; request: any; folder?: string };
      const flatItems: FlatItem[] = [];
      const flatten = (list: any[], folderPath = '') => {
        for (const item of list) {
          if (item.item && Array.isArray(item.item)) {
            flatten(item.item, folderPath ? `${folderPath}/${item.name}` : item.name);
          } else if (item.request) {
            flatItems.push({ name: item.name, request: item.request, folder: folderPath });
          }
        }
      };
      flatten(items);

      let html = `<!DOCTYPE html><html><head><title>${collectionName} - API Documentation</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1a1a1a; padding:30px; margin:0 auto; }
        h1 { font-size:24px; margin-bottom:4px; }
        .subtitle { font-size:12px; color:#888; margin-bottom:24px; }
        h2 { font-size:14px; text-transform:uppercase; letter-spacing:1px; color:#555; margin:32px 0 10px; padding-bottom:6px; border-bottom:2px solid #eee; }
        .method-badge { display:inline-block; padding:2px 8px; border-radius:3px; font-size:9px; font-weight:800; color:white; text-align:center; min-width:48px; }
        table { width:100%; border-collapse:collapse; margin:0 0 20px; font-size:11px; }
        th { padding:8px 10px; background:#f8f9fa; border:1px solid #e5e7eb; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#666; white-space:nowrap; }
        td { padding:7px 10px; border:1px solid #e5e7eb; vertical-align:top; }
        td.mono { font-family:monospace; font-size:10px; word-break:break-all; }
        td.center { text-align:center; }
        tr:hover { background:#f9fafb; }
        .sl { width:30px; text-align:center; color:#999; }
        .detail-title { font-size:13px; font-weight:700; margin:24px 0 6px; color:#333; }
        .detail-meta { font-size:11px; color:#888; margin-bottom:10px; }
        .detail-section { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#888; margin:12px 0 4px; }
        pre { background:#1e1e1e; color:#d4d4d4; padding:10px; border-radius:4px; font-size:10px; line-height:1.4; overflow-x:auto; white-space:pre-wrap; word-break:break-all; margin:4px 0 12px; }
        .folder-label { font-size:10px; color:#888; background:#f0f0f0; padding:1px 6px; border-radius:3px; }
        .footer { margin-top:40px; padding-top:12px; border-top:1px solid #eee; font-size:10px; color:#aaa; text-align:center; }
        @media print { body { padding:15px; } }
      </style></head><body>`;

      // Header
      html += `<h1>${collectionName}</h1>`;
      html += `<p class="subtitle">API Documentation · ${flatItems.length} endpoint${flatItems.length !== 1 ? 's' : ''} · Generated ${new Date().toLocaleDateString()}</p>`;

      // ── SUMMARY TABLE ──
      html += `<h2>API Endpoints Summary</h2>`;
      html += `<table>`;
      html += `<tr><th class="sl">SL</th><th>Method</th><th>Name</th><th>URL</th><th>Folder</th></tr>`;
      flatItems.forEach((item, i) => {
        const req = JSON.parse(JSON.stringify(item.request));
        walkInterp(req);
        const m = (req.method || 'GET').toUpperCase();
        const mc = methodColors[m] || '#6b7280';
        const rawUrl = req.url?.raw || req.url || '';
        html += `<tr>`;
        html += `<td class="sl">${i + 1}</td>`;
        html += `<td class="center"><span class="method-badge" style="background:${mc}">${m}</span></td>`;
        html += `<td style="font-weight:600;">${item.name}</td>`;
        html += `<td class="mono">${rawUrl}</td>`;
        html += `<td>${item.folder ? `<span class="folder-label">${item.folder}</span>` : '—'}</td>`;
        html += `</tr>`;
      });
      html += `</table>`;

      // ── DETAILED ENDPOINT TABLES ──
      html += `<h2>Endpoint Details</h2>`;
      flatItems.forEach((item, i) => {
        const req = JSON.parse(JSON.stringify(item.request));
        walkInterp(req);
        const m = (req.method || 'GET').toUpperCase();
        const mc = methodColors[m] || '#6b7280';
        const rawUrl = req.url?.raw || req.url || '';

        html += `<div class="detail-title">${i + 1}. ${item.name}</div>`;
        html += `<div class="detail-meta"><span class="method-badge" style="background:${mc}">${m}</span> <span style="font-family:monospace;font-size:11px;margin-left:4px;">${rawUrl}</span></div>`;

        // Headers
        const hdrs = (req.header || req.headers || []).filter((h: any) => h.key);
        if (hdrs.length > 0) {
          html += `<div class="detail-section">Headers</div>`;
          html += `<table><tr><th>Key</th><th>Value</th></tr>`;
          hdrs.forEach((h: any) => { html += `<tr><td style="font-weight:600;" class="mono">${h.key}</td><td class="mono" style="color:#666;">${h.value || ''}</td></tr>`; });
          html += `</table>`;
        }

        // Query params
        const urlObj = req.url;
        const queryParams = (urlObj?.query || req.params || []).filter((q: any) => q.key);
        if (queryParams.length > 0) {
          html += `<div class="detail-section">Query Parameters</div>`;
          html += `<table><tr><th>Name</th><th>Value</th></tr>`;
          queryParams.forEach((q: any) => { html += `<tr><td style="font-weight:600;" class="mono">${q.key}</td><td class="mono" style="color:#666;">${q.value || ''}</td></tr>`; });
          html += `</table>`;
        }

        // Body
        const body = req.body;
        if (body) {
          const mode = body.mode || 'raw';
          html += `<div class="detail-section">Request Body</div>`;
          if (mode === 'raw' && body.raw) {
            let rawBody = body.raw;
            try { rawBody = JSON.stringify(JSON.parse(rawBody), null, 2); } catch {}
            html += `<pre>${rawBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
          } else if (mode === 'urlencoded' && body.urlencoded) {
            html += `<table><tr><th>Field</th><th>Value</th></tr>`;
            body.urlencoded.filter((b: any) => b.key).forEach((b: any) => {
              html += `<tr><td class="mono" style="font-weight:600;">${b.key}</td><td class="mono" style="color:#666;">${b.value || ''}</td></tr>`;
            });
            html += `</table>`;
          } else if (mode === 'formdata' && body.formdata) {
            html += `<table><tr><th>Field</th><th>Value</th><th>Type</th></tr>`;
            body.formdata.filter((b: any) => b.key).forEach((b: any) => {
              html += `<tr><td class="mono" style="font-weight:600;">${b.key}</td><td class="mono" style="color:#666;">${b.value || ''}</td><td style="color:#888;">${b.type || 'text'}</td></tr>`;
            });
            html += `</table>`;
          }
        }
      });

      html += `<div class="footer">Generated by JetAPI · ${collectionName} · ${new Date().toLocaleDateString()}</div>`;
      html += `</body></html>`;

      const printWindow = window.open('', '_blank');
      if (!printWindow) { toast.error('Please allow popups to download PDF'); return; }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => { setTimeout(() => printWindow.print(), 300); };
    } catch (err) {
      console.error("Doc generation failed:", err);
      toast.error("Failed to generate documentation.");
    }
  };

  const handleDeleteCollection = async (e: React.MouseEvent, collectionId: string, collectionName: string) => {
    e.stopPropagation();

    try {
      setIsDeletingId(collectionId);
      const res = await apiFetch(`/collections/${collectionId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(`Collection "${collectionName}" deleted.`);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete collection.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleShare = (e: React.MouseEvent, collectionId: string, collectionName: string) => {
    e.stopPropagation();
    setShareModalData({ id: collectionId, name: collectionName });
  };

  const handleCreateCollection = async () => {
    const name = await promptDialog("Enter new collection name:");
    if (!name || !activeWorkspace) return;
    try {
      const res = await apiFetch("/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, workspaceId: activeWorkspace })
      });
      if (!res.ok) throw new Error("Creation failed");
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      toast.success("Collection created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create collection");
    }
  };

  const handleRenameCollection = async (e: React.MouseEvent, collectionId: string, oldName: string) => {
    e.stopPropagation();
    const newName = await promptDialog("Rename collection:", oldName);
    if (!newName || newName === oldName) return;
    try {
      const res = await apiFetch(`/collections/${collectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
      });
      if (!res.ok) throw new Error("Rename failed");
      toast.success(`Collection renamed to ${newName}`);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err) {
      toast.error("Failed to rename collection.");
    }
  };

  const handleDuplicateCollection = async (e: React.MouseEvent, collectionId: string, collectionName: string) => {
    e.stopPropagation();
    if (!activeWorkspace) {
      toast.error("No active workspace selected");
      return;
    }
    try {
        const exportRes = await apiFetch(`/collections/${collectionId}/export`);
        if (!exportRes.ok) throw new Error("Export failed");
        const collectionData = await exportRes.json();
        
        collectionData.info.name = `${collectionName} Copy`;
        
        const importRes = await apiFetch('/collections/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: activeWorkspace, data: collectionData })
        });
        if (!importRes.ok) throw new Error("Import failed");
        
        toast.success(`Collection duplicated!`);
        window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch(err) {
        toast.error("Failed to duplicate collection.");
    }
  };

  const handleCopyLink = (e: React.MouseEvent, collectionId: string) => {
    e.stopPropagation();
    copyToClipboard(`${window.location.origin}/?collection=${collectionId}`);
    toast.success("Link copied to clipboard");
  };

  const handleDeleteRequest = async (e: React.MouseEvent, requestId: string, requestName: string) => {
    e.stopPropagation();
    try {
      if (!(await confirmDialog(`Are you sure you want to delete ${requestName}?`))) return;
      setIsDeletingId(requestId);
      const res = await apiFetch(`/requests/${requestId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(`Request deleted`);
      if (activeRequestId === requestId) onSelectRequest(null);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err) {
      toast.error("Failed to delete request.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleRenameRequest = async (e: React.MouseEvent, requestId: string, oldName: string) => {
    e.stopPropagation();
    const newName = await promptDialog("Rename request:", oldName);
    if (!newName || newName === oldName) return;
    try {
      const getRes = await apiFetch(`/requests/${requestId}`);
      if (!getRes.ok) throw new Error("Failed to fetch request");
      const reqData = await getRes.json();
      
      const res = await apiFetch(`/requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reqData, name: newName })
      });
      if (!res.ok) throw new Error("Rename failed");
      toast.success(`Request renamed to ${newName}`);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err) {
      toast.error("Failed to rename request.");
    }
  };

  const handleDuplicateRequest = async (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    try {
      const getRes = await apiFetch(`/requests/${requestId}`);
      if (!getRes.ok) throw new Error("Failed to fetch request metadata");
      const reqData = await getRes.json();
      
      window.dispatchEvent(new CustomEvent('duplicate-request', { detail: { originalRequest: reqData } }));
      toast.info("Request copied! Active in your workspace.");
    } catch (err) {
      toast.error("Failed to duplicate endpoint.");
    }
  };

  const handleCopyRequestLink = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    copyToClipboard(`${window.location.origin}/?request=${requestId}`);
    toast.success("Link copied to clipboard");
  };

  const currentWorkspace = workspaces.find((w: any) => w.id === activeWorkspace);

  const getFilteredRequests = (requests: any[]) => {
    if (!searchQuery) return requests;
    const lowerQuery = searchQuery.toLowerCase();
    return requests.filter(req => 
      (req.name || '').toLowerCase().includes(lowerQuery) || 
      (req.url || '').toLowerCase().includes(lowerQuery) ||
      (req.method || '').toLowerCase().includes(lowerQuery)
    );
  };

  const renderTree = (collectionId: string, collectionName: string, requests: any[]) => {
    if (!requests || requests.length === 0) return <div className="text-xs text-[var(--muted)] p-1.5 italic">Empty</div>;

    const root: any = { name: 'root', requests: [], children: {} };
    requests.forEach(req => {
      if (!req.folder) {
        root.requests.push(req);
        return;
      }
      const parts = req.folder.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!current.children[part]) {
          current.children[part] = { name: part, path: parts.slice(0, i+1).join('/'), requests: [], children: {} };
        }
        current = current.children[part];
      }
      current.requests.push(req);
    });

    const renderNode = (node: any, pathPrefix: string) => {
      return (
        <div key={pathPrefix || 'root'}>
          {Object.values(node.children).map((child: any) => {
            const folderId = `${collectionId}-${child.path}`;
            const isExpanded = searchQuery ? true : expandedFolders[folderId];
            return (
              <div key={folderId} className="mb-0.5">
                <div 
                  className="flex items-center gap-2 p-1 hover:bg-[var(--card)] rounded cursor-pointer group text-[var(--muted)]"
                  onClick={() => toggleFolder(folderId)}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <Folder className="w-3.5 h-3.5" />
                  <span className="truncate flex-1 text-xs">{child.name}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity ml-auto z-10 relative">
                    <button
                      onClick={(e) => {
                         e.stopPropagation();
                         onSelectRequest({ 
                           id: `new-${Date.now()}`, 
                           collectionId: collectionId,
                           folder: child.path,
                           name: 'Untitled Request', 
                           method: 'GET', 
                           url: '',
                           headers: [],
                           params: [],
                           body: '',
                           _isNew: true,
                           _breadcrumb: [collectionName, ...child.path.split('/')]
                         });
                      }}
                      className="hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded mr-0.5 transition-colors cursor-pointer"
                      title="Add Request"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => handleContextMenuClick(e, 'folder', collectionId, child.name, child.path)}
                      className="hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded transition-colors cursor-pointer"
                      title="More Actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="ml-4 border-l border-[var(--border)] pl-2">
                    {renderNode(child, child.path)}
                  </div>
                )}
              </div>
            );
          })}
          {node.requests.map((req: any) => (
            <div 
              key={req.id}
              onClick={() => onSelectRequest({ 
                ...req, 
                _breadcrumb: [collectionName, ...(req.folder ? req.folder.split('/') : [])].filter(Boolean) 
              })}
              className={`flex items-center gap-2 p-1 hover:bg-[var(--card)] rounded cursor-pointer group text-xs
                ${activeRequestId === req.id ? 'bg-[var(--card)] text-[var(--color-brand-500)] font-medium' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
            >
              <span className={`font-mono font-bold ${
                req.method === 'GET' ? 'text-green-500' : 
                req.method === 'POST' ? 'text-orange-500' :
                req.method === 'PUT' ? 'text-blue-500' : 
                req.method === 'DELETE' ? 'text-red-500' : 
                req.method === 'PATCH' ? 'text-yellow-500' : 'text-[var(--foreground)]'
              }`}>{req.method}</span>
              <div className="flex-1 flex items-center min-w-0">
                <span className="truncate">{req.name}</span>
                {isDeletingId === req.id && <Loader2 className="w-3 h-3 ml-1.5 animate-spin text-red-500 shrink-0" />}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity ml-auto z-10 relative shrink-0">
                <button 
                  onClick={(e) => handleContextMenuClick(e, 'request', req.id, req.name, collectionId)}
                  className="hover:bg-[var(--sidebar)] text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded"
                  title="More Actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    return renderNode(root, '');
  };

  return (
    <>
    {/* Global Context Menu Map */}
    {contextMenu && (
      <div 
        className="fixed bg-[var(--card)] border border-[var(--border)] rounded shadow-2xl py-1 z-[100] flex flex-col text-xs font-semibold min-w-40 overflow-hidden dropdown-enter"
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {(contextMenu.type === 'collection' || contextMenu.type === 'folder') && (
          <div className="w-[200px]">
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={() => { handleAddRequestFromContext(); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><FilePlus className="w-3.5 h-3.5 opacity-70" /> Add Request</div>
            </button>

            {contextMenu.type === 'collection' && (
              <>
                <div className="border-t border-[var(--border)] my-1"></div>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleShare(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Share2 className="w-3.5 h-3.5 opacity-70" /> Share</div>
                </button>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleCopyLink(e, contextMenu.id); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 opacity-70" /> Copy Link</div>
                </button>
                <div className="border-t border-[var(--border)] my-1"></div>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleRenameCollection(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Edit2 className="w-3.5 h-3.5 opacity-70" /> Rename</div>
                  <span className="text-[10px] opacity-50 font-mono">⌘E</span>
                </button>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleDuplicateCollection(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Copy className="w-3.5 h-3.5 opacity-70" /> Duplicate</div>
                  <span className="text-[10px] opacity-50 font-mono">⌘D</span>
                </button>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleExport(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Upload className="w-3.5 h-3.5 opacity-70" /> Export</div>
                </button>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleExportDocs(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 opacity-70" /> Generate Docs</div>
                </button>
                <div className="border-t border-[var(--border)] my-1"></div>
                <button className="flex items-center justify-between px-3 py-1.5 hover:bg-red-500/10 text-red-500 transition-colors w-full text-left" onClick={(e) => { handleDeleteCollection(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
                  <div className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</div>
                  <span className="text-[10px] opacity-50 font-mono">⌫</span>
                </button>
              </>
            )}
          </div>
        )}

        {contextMenu.type === 'request' && (
          <div className="w-[200px]">
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={() => { toast.info("Add example is not yet implemented"); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 opacity-70" /> Add example</div>
            </button>
            <div className="border-t border-[var(--border)] my-1"></div>
            
            {contextMenu.folderPath && (
              <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleShare(e, contextMenu.folderPath!, "Collection"); setContextMenu(null); }}>
                <div className="flex items-center gap-2"><Share2 className="w-3.5 h-3.5 opacity-70" /> Share</div>
              </button>
            )}
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleCopyRequestLink(e, contextMenu.id); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Link className="w-3.5 h-3.5 opacity-70" /> Copy link</div>
            </button>
            <div className="border-t border-[var(--border)] my-1"></div>
            
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={() => { toast.info("Ask AI is not yet implemented"); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 opacity-70" /> Ask AI</div>
            </button>
            <div className="border-t border-[var(--border)] my-1"></div>
            
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleRenameRequest(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Edit2 className="w-3.5 h-3.5 opacity-70" /> Rename</div>
              <span className="text-[10px] opacity-50 font-mono">⌘E</span>
            </button>
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={() => { toast.success("Request copied to clipboard"); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Files className="w-3.5 h-3.5 opacity-70" /> Copy</div>
              <span className="text-[10px] opacity-50 font-mono">⌘C</span>
            </button>
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { handleDuplicateRequest(e, contextMenu.id); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Copy className="w-3.5 h-3.5 opacity-70" /> Duplicate</div>
              <span className="text-[10px] opacity-50 font-mono">⌘D</span>
            </button>
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--sidebar)] transition-colors w-full text-left text-[var(--foreground)] opacity-90" onClick={(e) => { e.stopPropagation(); toast.info("View more actions fly-out is coming soon"); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><MoreHorizontal className="w-3.5 h-3.5 opacity-70" /> View more actions</div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
            <div className="border-t border-[var(--border)] my-1"></div>
            <button className="flex items-center justify-between px-3 py-1.5 hover:bg-red-500/10 text-red-500 transition-colors w-full text-left" onClick={(e) => { handleDeleteRequest(e, contextMenu.id, contextMenu.name); setContextMenu(null); }}>
              <div className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</div>
              <span className="text-[10px] opacity-50 font-mono">⌫</span>
            </button>
          </div>
        )}
      </div>
    )}

    <div className="flex h-full w-full bg-[var(--sidebar)] border-r border-[var(--border)] group/rail">
      {/* ACTIVITY RAIL (Left-most) */}
      <div className="w-[54px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--background)] flex flex-col items-center py-4 gap-2 text-[var(--muted)] z-10 selection:bg-transparent justify-start">
         <button 
           onClick={() => setActiveTab('collections')} 
           className={`flex flex-col items-center justify-center w-full py-3 group cursor-pointer relative ${activeTab==='collections'?'text-[var(--foreground)]':'hover:text-[var(--foreground)]'}`}
         >
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r transition-colors ${activeTab==='collections'?'bg-[var(--color-brand-500)]':'bg-transparent'}`}></div>
            <Folder className="w-5 h-5" />
            <span className="absolute left-[60px] bg-[var(--foreground)] text-[var(--background)] px-2.5 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity whitespace-nowrap shadow-xl">Collections</span>
         </button>
         
         <button 
           onClick={() => setActiveTab('apis')} 
           className={`flex flex-col items-center justify-center w-full py-3 group cursor-pointer relative ${activeTab==='apis'?'text-[var(--foreground)]':'hover:text-[var(--foreground)]'}`}
         >
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r transition-colors ${activeTab==='apis'?'bg-[var(--color-brand-500)]':'bg-transparent'}`}></div>
            <Globe className="w-5 h-5" />
            <span className="absolute left-[60px] bg-[var(--foreground)] text-[var(--background)] px-2.5 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity whitespace-nowrap shadow-xl">APIs</span>
         </button>
         
         <button 
           onClick={() => setActiveTab('environments')} 
           className={`flex flex-col items-center justify-center w-full py-3 group cursor-pointer relative ${activeTab==='environments'?'text-[var(--foreground)]':'hover:text-[var(--foreground)]'}`}
         >
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r transition-colors ${activeTab==='environments'?'bg-[var(--color-brand-500)]':'bg-transparent'}`}></div>
            <Server className="w-5 h-5" />
            <span className="absolute left-[60px] bg-[var(--foreground)] text-[var(--background)] px-2.5 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity whitespace-nowrap shadow-xl">Environments</span>
         </button>

         <button 
           onClick={() => setActiveTab('history')} 
           className={`flex flex-col items-center justify-center w-full py-3 group cursor-pointer relative ${activeTab==='history'?'text-[var(--foreground)]':'hover:text-[var(--foreground)]'}`}
         >
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r transition-colors ${activeTab==='history'?'bg-[var(--color-brand-500)]':'bg-transparent'}`}></div>
            <Clock className="w-5 h-5" />
            <span className="absolute left-[60px] bg-[var(--foreground)] text-[var(--background)] px-2.5 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity whitespace-nowrap shadow-xl">History</span>
         </button>
      </div>

      {/* MAIN SIDEBAR DRAWER */}
      <div className="flex-1 flex flex-col h-full bg-[var(--sidebar)] overflow-hidden text-xs">
      {activeTab === 'collections' ? (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Collections Header (Postman UX) */}
        <div className="p-3 pb-2 flex items-center justify-between">
          <span className="font-semibold text-xs tracking-wide">Collections</span>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="hover:text-[var(--foreground)] text-[var(--muted)] hover:bg-[var(--card)] px-2 py-1 flex items-center gap-1.5 rounded transition-colors font-medium text-[11px]" 
              title="Import Collection JSON"
            >
              <Import className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Import</span>
            </button>
            <div className="w-px h-3 bg-[var(--border)] mx-1"></div>
            <button 
              className="hover:text-[var(--foreground)] text-[var(--muted)] hover:bg-[var(--card)] p-1 rounded transition-colors cursor-pointer" 
              title="New Request"
              onClick={() => onSelectRequest({ 
                id: `new-${Date.now()}`, 
                name: 'Untitled Request', 
                method: 'GET', 
                url: '',
                headers: [],
                params: [],
                body: '',
                _isNew: true
              })}
            >
              <FilePlus className="w-4 h-4" />
            </button>
            <button 
              className="hover:text-[var(--foreground)] text-[var(--muted)] hover:bg-[var(--card)] p-1 rounded transition-colors cursor-pointer" 
              title="New Collection"
              onClick={handleCreateCollection}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Localized Collections Filter */}
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="w-3 h-3 text-[var(--muted)] absolute left-2 top-1.5" />
            <input 
              type="text" 
              placeholder="Filter" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded text-xs py-1 pl-6 pr-2 focus:outline-none focus:border-[var(--color-brand-500)] placeholder-[var(--muted)]"
            />
          </div>
        </div>

      <div className="flex-1 overflow-y-auto px-1">

        {(() => {
          // Show collections only for the active workspace
          const activeWs = workspaces.find((ws: any) => ws.id === activeWorkspace);
          const wsCollections = activeWs?.collections || [];

          // Merge with shared collections that belong to this workspace
          const sharedForWs = sharedCollections.filter((c: any) => c.workspaceId === activeWorkspace);
          const mergedCollections = [...wsCollections, ...sharedForWs];

          // Deduplicate collections, prioritizing the object that has requests populated
          const uniqueCollectionsMap = new Map();
          for (const c of mergedCollections) {
            if (!uniqueCollectionsMap.has(c.id)) {
              uniqueCollectionsMap.set(c.id, c);
            } else {
              if (c.requests && c.requests.length > 0) {
                 uniqueCollectionsMap.set(c.id, c);
              }
            }
          }
          const uniqueCollections = Array.from(uniqueCollectionsMap.values());

          if (uniqueCollections.length === 0) {
            return (
              <div className="px-4 py-3 text-[10px] text-[var(--muted)] italic">
                No collections yet
              </div>
            );
          }

          return uniqueCollections.map((col: any) => {
            const filteredRequests = getFilteredRequests(col.requests || []);
            if (searchQuery && filteredRequests.length === 0) return null; // Hide collection if no search matches
            
            const isExpanded = searchQuery ? true : expandedCollections[col.id];

            return (
            <div key={col.id} className="mb-0.5">
            <div 
              className="flex items-center gap-1.5 p-1 hover:bg-[var(--card)] rounded cursor-pointer group"
              onClick={() => toggleCollection(col.id)}
            >
              {isExpanded ? 
                <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)]" /> : 
                <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)]" />
              }
              <Folder className="w-3.5 h-3.5 text-[var(--color-brand-500)]" />
              <span className="truncate flex-1 text-xs">{col.name}</span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity ml-auto z-10 relative">
                <button
                  onClick={(e) => {
                     e.stopPropagation();
                     onSelectRequest({ 
                       id: `new-${Date.now()}`, 
                       collectionId: col.id,
                       name: 'Untitled Request', 
                       method: 'GET', 
                       url: '',
                       headers: [],
                       params: [],
                       body: '',
                       _isNew: true,
                       _breadcrumb: [col.name]
                     });
                  }}
                  className="hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded mr-0.5 transition-colors cursor-pointer"
                  title="Add Request"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => handleDeleteCollection(e, col.id, col.name)}
                  className="hover:bg-red-500/10 text-[var(--muted)] hover:text-red-500 p-1 mr-1 rounded transition-colors cursor-pointer"
                  title="Delete Collection"
                  disabled={isDeletingId === col.id}
                >
                  {isDeletingId === col.id ? <Loader2 className="w-4 h-4 opacity-70 animate-spin" /> : <Trash2 className="w-4 h-4 opacity-70" />}
                </button>
                <button 
                  onClick={(e) => handleContextMenuClick(e, 'collection', col.id, col.name)}
                  className="hover:bg-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] p-0.5 rounded transition-colors cursor-pointer"
                  title="More Actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {isExpanded && (
              <div className="ml-6 mt-1 border-l border-[var(--border)] pl-2">
                {renderTree(col.id, col.name, filteredRequests)}
              </div>
            )}
          </div>
          );
        });
      })()}

      </div>
      </div>
      ) : activeTab === 'environments' ? (
        <>
          <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-base hover:text-[var(--color-brand-500)] cursor-pointer transition-colors">
              <Server className="w-4 h-4 text-[var(--color-brand-500)]" />
              <span>Environments</span>
            </div>
            <button 
              className="p-1 hover:bg-[var(--card)] hover:text-[var(--foreground)] text-[var(--muted)] rounded cursor-pointer transition-colors"
              title="New Environment"
              onClick={() => {
                 setEnvManagerInitialTab('environments');
                 setEnvManagerInitialEnvId(null);
                 setIsEnvManagerOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-2">
            <div className="flex items-center gap-2 p-2 hover:bg-[var(--card)] rounded cursor-pointer group text-[var(--muted)]" 
                 onClick={() => {
                    setEnvManagerInitialTab('globals');
                    setIsEnvManagerOpen(true);
                 }}>
               <Globe className="w-3.5 h-3.5 text-[var(--color-brand-500)]" />
               <span className="truncate flex-1 text-xs">Globals</span>
            </div>
            
            <div className="my-2 border-t border-[var(--border)]"></div>
            
            {environments.map(env => (
               <div key={env.id} className="flex items-center gap-2 p-2 hover:bg-[var(--card)] rounded cursor-pointer group text-[var(--muted)]" 
                    onClick={() => {
                       setEnvManagerInitialTab('environments');
                       setEnvManagerInitialEnvId(env.id);
                       setIsEnvManagerOpen(true);
                    }}>
                  <Server className="w-3.5 h-3.5" />
                  <span className="truncate flex-1 text-xs">{env.name}</span>
               </div>
            ))}
            {environments.length === 0 && (
               <div className="px-2 py-3 text-[10px] text-[var(--muted)] italic text-center">
                 No environments
               </div>
            )}
          </div>
        </>
      ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] p-4 text-center">
            <div className="mb-2 opacity-30">
              {activeTab === 'apis' && <Globe className="w-16 h-16" />}
              {activeTab === 'history' && <Clock className="w-16 h-16" />}
            </div>
            <p className="text-sm font-medium">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</p>
            <p className="text-[10px] mt-1 opacity-70">This view is currently under development in JetAPI.</p>
          </div>
      )}
      </div>

      {isEnvManagerOpen && activeWorkspace && (
        <EnvironmentManager 
          workspaceId={
             (activeWorkspace && environments.length === 0 && sharedCollections?.length > 0) ? sharedCollections[0].workspaceId : activeWorkspace
          } 
          initialTab={envManagerInitialTab}
          initialEnvId={envManagerInitialEnvId}
          workspaces={workspaces}
          sharedCollections={sharedCollections}
          onClose={() => {
             setIsEnvManagerOpen(false);
             fetchEnvs(); // update the list
          }} 
        />
      )}

      {shareModalData && (
        <ShareCollectionModal
          collectionId={shareModalData.id}
          collectionName={shareModalData.name}
          onClose={() => setShareModalData(null)}
          onUpdate={() => window.dispatchEvent(new Event('postclone-refresh-sidebar'))}
        />
      )}

      <ImportCollectionModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onSuccess={() => window.dispatchEvent(new Event('postclone-refresh-sidebar'))} 
      />
    </div>
    </>
  );
}
