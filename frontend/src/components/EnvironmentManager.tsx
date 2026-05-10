"use client";
import { apiFetch, getApiError } from '@/lib/api';
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Upload, Download, Eye, EyeOff, Search, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";
import StyledSelect from "./StyledSelect";

export default function EnvironmentManager({ 
  workspaceId, 
  onClose,
  initialTab = 'environments',
  initialEnvId = null,
  workspaces = [],
  sharedCollections = []
}: { 
  workspaceId: string, 
  onClose: () => void,
  initialTab?: 'environments' | 'globals',
  initialEnvId?: string | null,
  workspaces?: any[],
  sharedCollections?: any[]
}) {
  const { confirmDialog, promptDialog } = useDialog();
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(workspaceId);
  const [activeTab, setActiveTab] = useState<'environments' | 'globals'>(initialTab);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(initialEnvId);
  const [envName, setEnvName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [variables, setVariables] = useState<any[]>([]);
  const [globalVariables, setGlobalVariables] = useState<any[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [isEditingName, setIsEditingName] = useState(false);

  // Compute multi-workspace awareness
  const workspaceOptions: {id: string, name: string}[] = [];
  workspaces.forEach(ws => workspaceOptions.push({ id: ws.id, name: ws.name || "Untitled Workspace" }));
  sharedCollections.forEach(c => {
    if (c.workspaceId && !workspaceOptions.some(w => w.id === c.workspaceId)) {
      workspaceOptions.push({ id: c.workspaceId, name: c.workspace?.name || `Workspace of '${c.name}'` });
    }
  });
  if (!workspaceOptions.some(w => w.id === currentWorkspaceId)) {
    workspaceOptions.push({ id: currentWorkspaceId, name: "Selected Workspace" });
  }

  useEffect(() => {
    fetchEnvironments();
    fetchGlobals();
  }, [currentWorkspaceId]);

  const fetchGlobals = async () => {
    try {
      const res = await apiFetch(`/workspaces/${currentWorkspaceId}`);
      if (!res.ok) {
         setGlobalVariables([{ key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
         return;
      }
      const data = await res.json();
      let parsedVars = data.globalVariables;
      if (typeof parsedVars === 'string') {
        try { parsedVars = JSON.parse(parsedVars); } catch(e) {}
      }
      if (!Array.isArray(parsedVars)) parsedVars = [];
      setGlobalVariables(parsedVars.length ? parsedVars : [{ key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
    } catch (e) {
      console.error(e);
      setGlobalVariables([{ key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
    }
  };

  const fetchEnvironments = async (selectEnvId?: string | null) => {
    try {
      const res = await apiFetch(`/environments?workspaceId=${currentWorkspaceId}`);
      const data = await res.json();
      setEnvironments(data);
      const targetId = selectEnvId !== undefined ? selectEnvId : activeEnvId;
      if (targetId) {
        const matched = data.find((e: any) => e.id === targetId);
        if (matched) selectEnvironment(matched);
      } else if (data.length > 0) {
        selectEnvironment(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectEnvironment = (env: any) => {
    setActiveEnvId(env.id);
    setEnvName(env.name);
    setIsEditingName(false);
    
    let parsedVars = env.variables;
    if (typeof parsedVars === 'string') {
       try { parsedVars = JSON.parse(parsedVars); } catch(e) {}
    }
    if (!Array.isArray(parsedVars)) parsedVars = [];
    
    setVariables(parsedVars.length ? parsedVars : [{ key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
  };

  const handleCreateNew = async () => {
    const name = await promptDialog("Enter environment name:", "New Environment");
    if (!name) return;
    try {
      const res = await apiFetch("/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, workspaceId: currentWorkspaceId, variables: [] })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create environment");
      }
      const newEnv = await res.json();
      setEnvironments(prev => [...prev, newEnv]);
      selectEnvironment(newEnv);
      toast.success(`Environment "${name}" created`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSave = async () => {
    if (!activeEnvId) return;
    try {
      const cleanedVars = variables.filter(v => v.key.trim() !== "");
      const res = await apiFetch(`/environments/${activeEnvId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: envName, variables: cleanedVars })
      });
      if (!res.ok) { toast.error(await getApiError(res, "Failed to save environment")); return; }
      setVariables([...cleanedVars, { key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
      // Re-fetch to sync sidebar list with the saved name, passing the current env ID
      fetchEnvironments(activeEnvId);
      toast.success("Environment saved!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save environment");
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("Delete this environment?"))) return;
    try {
      await apiFetch(`/environments/${id}`, { method: "DELETE" });
      if (activeEnvId === id) {
        setActiveEnvId(null);
        setVariables([]);
        setEnvName("");
      }
      fetchEnvironments();
      toast.success("Environment deleted");
    } catch (e) {
      console.error(e);
    }
  };

  const updateVar = (index: number, field: string, value: any) => {
    const newVars = [...variables];
    newVars[index] = { ...newVars[index], [field]: value };
    if (index === newVars.length - 1 && newVars[index].key !== "") {
      newVars.push({ key: "", type: "default", initialValue: "", currentValue: "", enabled: true });
    }
    setVariables(newVars);
  };

  const removeVar = (index: number) => {
    const newVars = variables.filter((_, i) => i !== index);
    if (newVars.length === 0) newVars.push({ key: "", type: "default", initialValue: "", currentValue: "", enabled: true });
    setVariables(newVars);
  };

  const handleSaveGlobals = async () => {
    try {
      const cleanedVars = globalVariables.filter(v => v.key.trim() !== "");
      await apiFetch(`/workspaces/${currentWorkspaceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalVariables: cleanedVars })
      });
      setGlobalVariables([...cleanedVars, { key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      toast.success("Globals saved!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save globals");
    }
  };

  const updateGlobalVar = (index: number, field: string, value: any) => {
    const newVars = [...globalVariables];
    newVars[index] = { ...newVars[index], [field]: value };
    if (index === newVars.length - 1 && newVars[index].key !== "") {
      newVars.push({ key: "", type: "default", initialValue: "", currentValue: "", enabled: true });
    }
    setGlobalVariables(newVars);
  };

  const toggleVisibility = (idx: number, tabName: string, field: string) => {
    const key = `${tabName}-${idx}-${field}`;
    setVisibleSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const removeGlobalVar = (index: number) => {
    const newVars = globalVariables.filter((_, i) => i !== index);
    if (newVars.length === 0) newVars.push({ key: "", type: "default", initialValue: "", currentValue: "", enabled: true });
    setGlobalVariables(newVars);
  };

  const handleExportEnvironment = () => {
    if (!activeEnvId) return;
    const exportData = {
      id: activeEnvId,
      name: envName,
      variables: variables,
      _postman_variable_scope: "environment",
      _postman_exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${envName.replace(/\s+/g, '_').toLowerCase()}.postman_environment.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportGlobals = () => {
    const exportData = {
      id: currentWorkspaceId,
      name: "Workspace Globals",
      values: globalVariables,
      _postman_variable_scope: "globals",
      _postman_exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace_globals.postman_globals.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportGlobals = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target?.result as string);
            let importedValues = [];
            if (parsed.values && Array.isArray(parsed.values)) {
              importedValues = parsed.values;
            } else if (Array.isArray(parsed)) {
              importedValues = parsed;
            } else {
              toast.error("Invalid globals format.");
              return;
            }
            setGlobalVariables([...importedValues, { key: "", type: "default", initialValue: "", currentValue: "", enabled: true }]);
            toast.success("Globals imported! Click Save to apply.");
          } catch (err) {
            toast.error("Failed to parse JSON");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // ──── Variable table render function (NOT a component — avoids remount/focus loss) ────
  const renderVariableTable = (
    vars: any[], 
    onUpdate: (i: number, f: string, v: any) => void, 
    onRemove: (i: number) => void, 
    tabName: string 
  ) => (
    <div className="flex-1 overflow-auto min-h-0">
      <table className="w-full text-sm text-left min-w-[600px]">
        <thead className="bg-[var(--sidebar)] text-[var(--muted)] sticky top-0 z-10">
          <tr className="text-[10px] uppercase tracking-wider font-bold">
            <th className="p-2 w-8 text-center"></th>
            <th className="p-2 border-l border-[var(--border)]">Variable</th>
            <th className="p-2 border-l border-[var(--border)] w-20">Type</th>
            <th className="p-2 border-l border-[var(--border)]">Initial Value</th>
            <th className="p-2 border-l border-[var(--border)]">Current Value</th>
            <th className="p-2 w-10 border-l border-[var(--border)]"></th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v, i) => {
            if (searchQuery && v.key && !v.key.toLowerCase().includes(searchQuery.toLowerCase())) return null;
            return (
              <tr key={i} className="border-t border-[var(--border)] hover:bg-[var(--sidebar)]/50 group transition-colors">
                <td className="p-2 text-center">
                  <input 
                    type="checkbox" 
                    checked={v.enabled} 
                    onChange={(e) => onUpdate(i, "enabled", e.target.checked)}
                    className="accent-[var(--color-brand-500)] cursor-pointer"
                  />
                </td>
                <td className="p-0 border-l border-[var(--border)]">
                  <input 
                    type="text" 
                    value={v.key || ""} 
                    onChange={(e) => onUpdate(i, "key", e.target.value)}
                    placeholder="variable_name"
                    className="w-full bg-transparent p-2 focus:outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]/40"
                  />
                </td>
                <td className="p-0 border-l border-[var(--border)]">
                  <StyledSelect
                    options={[
                      { value: 'default', label: 'default' },
                      { value: 'secret', label: 'secret' },
                    ]}
                    value={v.type || 'default'}
                    onChange={(val) => onUpdate(i, 'type', val)}
                    size="xs"
                    showCheckmark={false}
                    className="w-full"
                  />
                </td>
                <td className="p-0 border-l border-[var(--border)] relative">
                  <input 
                    type={v.type === 'secret' && !visibleSecrets[`${tabName}-${i}-initial`] ? 'password' : 'text'} 
                    value={v.initialValue !== undefined ? v.initialValue : (v.value || "")} 
                    onChange={(e) => onUpdate(i, "initialValue", e.target.value)}
                    placeholder="initial value"
                    className="w-full bg-transparent p-2 focus:outline-none pr-8 placeholder:text-[var(--muted)]/40"
                  />
                  {v.type === 'secret' && (
                    <button 
                      onClick={() => toggleVisibility(i, tabName, 'initial')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      {visibleSecrets[`${tabName}-${i}-initial`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </td>
                <td className="p-0 border-l border-[var(--border)] relative">
                  <input 
                    type={v.type === 'secret' && !visibleSecrets[`${tabName}-${i}-current`] ? 'password' : 'text'} 
                    value={v.currentValue !== undefined ? v.currentValue : (v.value || "")} 
                    onChange={(e) => onUpdate(i, "currentValue", e.target.value)}
                    placeholder="current value"
                    className="w-full bg-transparent p-2 focus:outline-none pr-8 placeholder:text-[var(--muted)]/40"
                  />
                  {v.type === 'secret' && (
                    <button 
                      onClick={() => toggleVisibility(i, tabName, 'current')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      {visibleSecrets[`${tabName}-${i}-current`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </td>
                <td className="p-2 border-l border-[var(--border)] text-center">
                  <button 
                    onClick={() => onRemove(i)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition-all"
                    title="Delete Variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] p-4 modal-backdrop">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-[900px] h-[85vh] max-h-[700px] flex flex-col overflow-hidden modal-content">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--card)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Manage Environments</h2>
            {workspaceOptions.length > 1 && (
              <StyledSelect
                options={workspaceOptions.map(opt => ({ value: opt.id, label: opt.name }))}
                value={currentWorkspaceId}
                onChange={(val) => setCurrentWorkspaceId(val)}
                size="xs"
              />
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--sidebar)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-5 border-b border-[var(--border)] bg-[var(--sidebar)] flex-shrink-0">
           <button 
             onClick={() => setActiveTab('environments')}
             className={`py-2.5 px-3 border-b-2 text-xs font-semibold transition-colors ${activeTab === 'environments' ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'}`}
           >
             Environments
           </button>
           <button 
             onClick={() => setActiveTab('globals')}
             className={`py-2.5 px-3 border-b-2 text-xs font-semibold transition-colors ${activeTab === 'globals' ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'}`}
           >
             Globals
           </button>
        </div>
        
        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {activeTab === 'environments' ? (
            <>
              {/* Left sidebar — env list */}
              <div className="w-56 flex-shrink-0 bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col">
                <button 
                  onClick={handleCreateNew}
                  className="flex items-center gap-2 m-2 p-2.5 text-xs font-semibold text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/10 rounded-lg transition-colors border border-dashed border-[var(--color-brand-500)]/30 hover:border-[var(--color-brand-500)]/60 justify-center"
                >
                  <Plus className="w-3.5 h-3.5" /> New Environment
                </button>
                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {environments.length === 0 && (
                    <div className="text-[10px] text-[var(--muted)] italic px-2 py-4 text-center">No environments yet</div>
                  )}
                  {environments.map(env => (
                    <div 
                      key={env.id}
                      onClick={() => selectEnvironment(env)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs mb-0.5 group transition-colors
                        ${activeEnvId === env.id ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] font-semibold' : 'hover:bg-[var(--card)] text-[var(--foreground)]'}`}
                    >
                      <span className="truncate">{env.name}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(env.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition-opacity p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — editor */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--background)]">
                {activeEnvId ? (
                  <>
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] flex-shrink-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isEditingName ? (
                          <input 
                            type="text" 
                            value={envName} 
                            onChange={e => setEnvName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={e => { if (e.key === 'Enter') setIsEditingName(false); }}
                            autoFocus
                            className="bg-[var(--sidebar)] px-2.5 py-1 rounded-md text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] text-[var(--foreground)] border border-[var(--border)] min-w-0 flex-1"
                          />
                        ) : (
                          <div 
                            className="flex items-center gap-1.5 cursor-pointer group min-w-0"
                            onClick={() => setIsEditingName(true)}
                          >
                            <span className="text-sm font-semibold text-[var(--foreground)] truncate">{envName}</span>
                            <Pencil className="w-3 h-3 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                          <input 
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="bg-[var(--sidebar)] pl-7 pr-2 py-1.5 rounded-md text-xs outline-none border border-[var(--border)] focus:border-[var(--color-brand-500)] text-[var(--foreground)] w-32"
                          />
                        </div>
                        <button 
                          onClick={handleExportEnvironment}
                          className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--color-brand-500)] transition-colors"
                          title="Export"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={handleSave}
                          className="bg-[var(--color-brand-500)] text-white px-3.5 py-1.5 rounded-md text-xs font-semibold hover:bg-[var(--color-brand-600)] transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                    
                    {/* Table */}
                    {renderVariableTable(variables, updateVar, removeVar, "environments")}

                    {/* Add row */}
                    <div className="px-4 py-2 border-t border-[var(--border)] flex-shrink-0 bg-[var(--card)]">
                      <button
                        onClick={() => setVariables([...variables, { key: "", type: "default", initialValue: "", currentValue: "", enabled: true }])}
                        className="flex items-center gap-1 text-xs text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] transition-colors font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Variable
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] gap-3">
                    <div className="w-12 h-12 rounded-full bg-[var(--sidebar)] flex items-center justify-center">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium">Select or create an environment</p>
                    <p className="text-xs">Environments let you manage sets of variables for different API contexts</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Globals Tab ── */
            <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)]">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] flex-shrink-0 gap-2">
                <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Workspace Globals</span>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="bg-[var(--sidebar)] pl-7 pr-2 py-1.5 rounded-md text-xs outline-none border border-[var(--border)] focus:border-[var(--color-brand-500)] text-[var(--foreground)] w-32"
                    />
                  </div>
                  <button 
                    onClick={handleImportGlobals}
                    className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--color-brand-500)] transition-colors"
                    title="Import Globals"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={handleExportGlobals}
                    className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--color-brand-500)] transition-colors"
                    title="Export Globals"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={handleSaveGlobals}
                    className="bg-[var(--color-brand-500)] text-white px-3.5 py-1.5 rounded-md text-xs font-semibold hover:bg-[var(--color-brand-600)] transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
              
              {/* Table */}
              {renderVariableTable(globalVariables, updateGlobalVar, removeGlobalVar, "globals")}

              {/* Add row */}
              <div className="px-4 py-2 border-t border-[var(--border)] flex-shrink-0 bg-[var(--card)]">
                <button
                  onClick={() => setGlobalVariables([...globalVariables, { key: "", type: "default", initialValue: "", currentValue: "", enabled: true }])}
                  className="flex items-center gap-1 text-xs text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Global Variable
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
