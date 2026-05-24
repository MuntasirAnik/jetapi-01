import { useState, useEffect, useRef } from "react";
import { Play, Save, ChevronDown, Check, Trash2, Plus, GripVertical, Download, Lock, Send, Share2, Link2, Loader2, Eye, EyeOff, Wand2, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";
import StyledSelect from "./StyledSelect";
import GraphQLEditor from "./GraphQLEditor";
import { useFeatureFlags } from "@/lib/FeatureFlagContext";

export default function RequestPanel({ request, onChange, onSend, onSave, onSaveAs, onDelete, loading, onCancel, isSaving, envVariables = [] }: any) {
  const flags = useFeatureFlags();
  const [activeTab, setActiveTab] = useState("Params");
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [isMethodDropdownOpen, setIsMethodDropdownOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showBasicPassword, setShowBasicPassword] = useState(false);
  const methodDropdownRef = useRef<HTMLDivElement>(null);

  const [varSuggest, setVarSuggest] = useState<{ id: string, show: boolean, filtered: any[], replaceIndex: number, replaceLength: number, cursorPos: number, selectedIndex: number }>({ id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 });
  const activeSuggestRef = useRef<{ currentValue: string, onUpdate: (val: string) => void } | null>(null);

  useEffect(() => {
    if (!varSuggest.show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVarSuggest(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex < prev.filtered.length - 1 ? prev.selectedIndex + 1 : 0
        }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVarSuggest(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex > 0 ? prev.selectedIndex - 1 : prev.filtered.length - 1
        }));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (varSuggest.filtered.length > 0) {
          e.preventDefault();
          const v = varSuggest.filtered[varSuggest.selectedIndex];
          const refProps = activeSuggestRef.current;
          if (refProps && v) {
            const baseStr = refProps.currentValue.substring(0, varSuggest.replaceIndex);
            const afterCursorStr = refProps.currentValue.substring(varSuggest.cursorPos);
            const updated = baseStr + `{{${v.key}}}` + afterCursorStr;
            refProps.onUpdate(updated);
            setVarSuggest({ id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 });
          }
        }
      } else if (e.key === 'Escape') {
         setVarSuggest(prev => ({ ...prev, show: false }));
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [varSuggest]);

  const checkVarSuggest = (id: string, value: string, providedCursorPos?: number) => {
    // Only show suggestions when the user is actively typing in an input
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
      if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
        setVarSuggest(prev => prev.id === id ? { id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 } : prev);
        return;
      }
    }

    let cursorPos = providedCursorPos ?? value?.length ?? 0;
    if (typeof providedCursorPos === 'undefined' && typeof document !== 'undefined') {
      const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && typeof activeEl.selectionStart === 'number' && activeEl.selectionStart !== null) {
        cursorPos = activeEl.selectionStart;
      }
    }

    if (!value || typeof value !== 'string') {
       setVarSuggest(prev => prev.id === id ? { id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 } : prev);
       return;
    }
    
    const valueUpToCursor = value.substring(0, cursorPos);

    // Explicit {{ match
    const lastOpen = valueUpToCursor.lastIndexOf('{{');
    const lastClose = valueUpToCursor.lastIndexOf('}}');
    
    if (lastOpen > lastClose || (lastOpen !== -1 && lastClose === -1)) {
      const searchStr = valueUpToCursor.substring(lastOpen + 2);
      if (!searchStr.includes(' ')) {
        const search = searchStr.toLowerCase();
        const filtered = envVariables.filter((v: any) => v?.key && v.key.toLowerCase().includes(search));
        if (filtered.length > 0) {
          setVarSuggest({ id, show: true, filtered, replaceIndex: lastOpen, replaceLength: valueUpToCursor.length - lastOpen, cursorPos, selectedIndex: 0 });
          return;
        }
      }
    }

    // Free-text typing match (allows dropping the {{ requirement)
    const words = valueUpToCursor.match(/\{?[a-zA-Z0-9_-]+$/);
    if (words && words[0].length >= 1) {
      const search = words[0].replace('{', '').toLowerCase();
      if (search.length >= 1) {
        const filtered = envVariables.filter((v: any) => v?.key && (v.key.toLowerCase().includes(search) || v.key.toLowerCase() === search));
        if (filtered.length > 0) {
          setVarSuggest({ id, show: true, filtered, replaceIndex: valueUpToCursor.length - words[0].length, replaceLength: words[0].length, cursorPos, selectedIndex: 0 });
          return;
        }
      }
    }

    setVarSuggest(prev => prev.id === id ? { id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 } : prev);
  };

  const renderVarSuggest = (id: string, currentValue: string, onUpdate: (newVal: string) => void) => {
    if (!varSuggest.show || varSuggest.id !== id) return null;
    activeSuggestRef.current = { currentValue, onUpdate };

    return (
      <div className="absolute top-full left-0 mt-1 w-[300px] bg-[var(--card)] border border-[var(--border)] rounded shadow-2xl z-50 max-h-48 overflow-y-auto">
        {varSuggest.filtered.map((v, idx) => (
          <button
            key={idx}
            onClick={() => {
              const baseStr = currentValue.substring(0, varSuggest.replaceIndex);
              const afterCursorStr = currentValue.substring(varSuggest.cursorPos);
              const updated = baseStr + `{{${v.key}}}` + afterCursorStr;
              onUpdate(updated);
              setVarSuggest({ id: '', show: false, filtered: [], replaceIndex: 0, replaceLength: 0, cursorPos: 0, selectedIndex: 0 });
            }}
            className={`w-full text-left px-3 py-2 hover:bg-[var(--sidebar)] flex flex-col gap-0.5 border-b border-[var(--border)] transition-colors border-last-none ${varSuggest.selectedIndex === idx ? 'bg-[var(--sidebar)]' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-[var(--color-brand-500)]">{v.key}</span>
              <span className="text-[10px] uppercase font-bold text-[var(--muted)] opacity-50 px-1.5 py-0.5 rounded bg-[var(--background)]">{v.type === 'secret' ? 'Secret' : 'Global'}</span>
            </div>
            <span className="text-xs text-[var(--muted)] truncate">{v.type === 'secret' ? '••••••' : (v.currentValue || v.initialValue || 'empty')}</span>
          </button>
        ))}
      </div>
    );
  };
  
  // Close method dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (methodDropdownRef.current && !methodDropdownRef.current.contains(event.target as Node)) {
        setIsMethodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-parse Path Variables on mount or URL prop change
  useEffect(() => {
    if (!request || !request.url) return;
    
    try {
      const isRelativeOrVar = !request.url.includes('://') && !request.url.startsWith('http');
      const parseableUrl = isRelativeOrVar ? `http://dummy.local/${request.url.replace(/^\//, '')}` : request.url;
      const urlObj = new URL(parseableUrl);
      const pathOnly = urlObj.pathname + urlObj.hash;
      const pathVarsExtract = (pathOnly.match(/:([a-zA-Z0-9_]+)/g) || []).map(m => m.substring(1));
      
      const currentPathVars = request.pathVariables || [];
      
      // Check if we already have exactly these variables to prevent infinite loop
      const hasAllVars = pathVarsExtract.length === currentPathVars.length && 
                         pathVarsExtract.every((key, idx) => currentPathVars[idx]?.key === key);
                         
      if (!hasAllVars) {
        const updatedPathVars = pathVarsExtract.map(key => {
          const existing = currentPathVars.find((pv: any) => pv.key === key);
          return { key, value: existing ? existing.value : "" };
        });
        onChange({ ...request, pathVariables: updatedPathVars });
      }
    } catch(e) {
      // ignore parsing errors on mount
    }
  }, [request?.url, request?.id]); // depend on ID changes to catch sidebar navigation

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] flex-col gap-4">
        <Send className="w-16 h-16 opacity-20" />
        <p>Select a request from the sidebar or click "New Request"</p>
      </div>
    );
  }

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Exact Postman Colors
const getMethodColor = (method: string) => {
  switch (method) {
    case 'GET': return '#0cbb52';
    case 'POST': return '#ffb400';
    case 'PUT': return '#097bed';
    case 'PATCH': return '#f2a900';
    case 'DELETE': return '#eb2013';
    case 'HEAD': return '#0cbb52';
    case 'OPTIONS': return '#097bed';
    default: return 'var(--foreground)';
  }
};
  const tabs = ["Params", "Auth", "Headers", "Body", "Pre-request Script", "Tests", "Settings", "Docs"];

  const handleKVPChange = (type: "params" | "headers" | "pathVariables", index: number, field: "key" | "value" | "enabled", val: string | boolean) => {
    const list = [...(request[type] || [])];
    if (!list[index]) list[index] = { key: "", value: "", enabled: true };
    list[index][field] = val;
    
    // If it's params, we need to sync back to the URL
    if (type === 'params') {
      onChange({ ...request, [type]: list, url: syncParamsToUrl(request.url, list) });
    } else {
      onChange({ ...request, [type]: list });
    }
  };

  const addKVP = (type: "params" | "headers" | "pathVariables") => {
    const list = [...(request[type] || []), { key: "", value: "", enabled: true }];
    
    if (type === 'params') {
      onChange({ ...request, [type]: list, url: syncParamsToUrl(request.url, list) });
    } else {
      onChange({ ...request, [type]: list });
    }
  };

  const removeKVP = (type: "params" | "headers" | "pathVariables", index: number) => {
    const list = [...(request[type] || [])];
    list.splice(index, 1);
    
    if (type === 'params') {
      onChange({ ...request, [type]: list, url: syncParamsToUrl(request.url, list) });
    } else {
      onChange({ ...request, [type]: list });
    }
  };

  const handleAuthChange = (field: string, value: string) => {
    const currentAuth = request.auth || { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };
    onChange({ ...request, auth: { ...currentAuth, [field]: value } });
    checkVarSuggest(`auth-${field}`, value);
  };

  const handleToggleAll = (type: "params" | "headers", checked: boolean) => {
    const list = [...(request[type] || [])].map(item => ({ ...item, enabled: checked }));
    
    if (type === 'params') {
      onChange({ ...request, [type]: list, url: syncParamsToUrl(request.url, list) });
    } else {
      onChange({ ...request, [type]: list });
    }
  };

  const syncParamsToUrl = (currentUrl: string, paramsList: any[]) => {
    try {
      const isRelativeOrVar = !currentUrl.includes('://') && !currentUrl.startsWith('http');
      const parseableUrl = isRelativeOrVar ? `http://dummy.local/${currentUrl.replace(/^\//, '')}` : currentUrl;
      const urlObj = new URL(parseableUrl);
      urlObj.search = ''; // clear existing
      paramsList.forEach(p => {
        if (p.key && p.enabled !== false) urlObj.searchParams.append(p.key, p.value || '');
      });
      let urlStr = urlObj.toString().replace(/\/$/, ""); // prevent trailing slash
      
      // If we used a dummy base, strip it back off before returning
      if (isRelativeOrVar) {
         urlStr = urlStr.replace('http://dummy.local/', '');
         // In case the original didn't have a slash but URL added one
         if (currentUrl.startsWith('/') && !urlStr.startsWith('/')) urlStr = '/' + urlStr;
      }
      
      const encodedPath = urlObj.pathname + (urlObj.hash ? urlObj.hash : '');
      const searchString = urlObj.search;
      
      let finalUrl = "";
      if (isRelativeOrVar) {
         // Reconstruct cleanly bypassing dummy.local host
         finalUrl = currentUrl.split('?')[0] + searchString;
      } else {
         finalUrl = urlObj.protocol + "//" + urlObj.host + encodedPath.replace(/%7B/g, '{').replace(/%7D/g, '}') + searchString;
      }
      
      // Restore {{ and }} which new URL() encodes to %7B and %7D
      return finalUrl.replace(/%7B/g, '{').replace(/%7D/g, '}');
    } catch(e) {
      return currentUrl; // invalid url, don't crash
    }
  };

  const handleUrlChange = (newUrl: string) => {
    checkVarSuggest('url-input', newUrl);
    try {
      // 1. Parse Query Params
      const isRelativeOrVar = !newUrl.includes('://') && !newUrl.startsWith('http');
      const parseableUrl = isRelativeOrVar ? `http://dummy.local/${newUrl.replace(/^\//, '')}` : newUrl;
      const urlObj = new URL(parseableUrl);
      const newParams: any[] = [];
      urlObj.searchParams.forEach((val, key) => {
        newParams.push({ key, value: val, enabled: true });
      });
      
      const existingParams = request.params || [];
      // Retain disabled params in memory so they aren't lost when the user types in the URL box
      existingParams.forEach((p: any) => {
        if (p.enabled === false && p.key) {
           newParams.push(p);
        }
      });
      
      // Keep any empty bottom rows from current state
      const emptyParamsRow = existingParams.find((p: any) => !p.key && !p.value);
      if (emptyParamsRow && newParams.length > 0) newParams.push(emptyParamsRow);

      // 2. Extract Path Variables
      // Postman syntax: match segments starting with a colon, e.g. :orgId
      // We also verify it's a path segment (after a slash, or at the start) to avoid matching inside query strings if we can,
      // but simple regex is fine: grab word characters after a colon as long as they aren't part of a query param value
      // Wait, we can just strip the query string out first for path variable scanning:
      const pathOnly = urlObj.pathname + urlObj.hash;
      const pathVarsExtract = (pathOnly.match(/:([a-zA-Z0-9_]+)/g) || []).map(m => m.substring(1));
      let currentPathVars = request.pathVariables || [];
      // sync with found matches
      const updatedPathVars = pathVarsExtract.map(key => {
        const existing = currentPathVars.find((pv: any) => pv.key === key);
        return { key, value: existing ? existing.value : "" };
      });

      onChange({ ...request, url: newUrl, params: newParams, pathVariables: updatedPathVars });
    } catch(e) {
       // fallback if absolutely invalid, though `http://dummy.local` should catch almost any string
       onChange({ ...request, url: newUrl });
    }
  };

  const renderHighlightedUrl = (url: string, inputId?: string, suggestId?: string) => {
    if (!url) return null;
    const parts = url.split(/(\{\{.*?\}\})/g);
    
    // Track character offset for cursor positioning
    let charOffset = 0;
    
    return parts.map((part, i) => {
      const partStart = charOffset;
      charOffset += part.length;
      
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const varName = part.substring(2, part.length - 2).trim();
        const activeVar = envVariables?.find((v: any) => v.key === varName && v.enabled !== false);
        
        const handleVarClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!inputId) return;
          const input = document.getElementById(inputId) as HTMLInputElement;
          if (!input) return;
          
          input.focus();
          // Position cursor inside the {{}} and select the variable name
          const selectStart = partStart + 2;
          const selectEnd = partStart + part.length - 2;
          setTimeout(() => {
            input.setSelectionRange(selectStart, selectEnd);
            // Use the explicit suggestId, or fall back to 'url-input'
            checkVarSuggest(suggestId || 'url-input', url, selectStart);
          }, 0);
        };
        
        if (activeVar) {
          const resolveVal = activeVar.currentValue !== undefined ? activeVar.currentValue : activeVar.value;
          return (
             <span 
               key={i} 
               className="font-bold pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity" 
               style={{ color: 'var(--color-brand-500)' }}
               title={`Click to edit · Current: ${resolveVal}\nInitial: ${activeVar.initialValue || 'empty'}\nScope: ${activeVar.type}`}
               onClick={handleVarClick}
             >
               {part}
             </span>
          );
        } else {
          return (
             <span 
               key={i} 
               className="text-red-500 font-bold line-through opacity-80 pointer-events-auto cursor-pointer hover:opacity-60 transition-opacity" 
               title="Click to replace · Unresolved Variable!"
               onClick={handleVarClick}
             >
               {part}
             </span>
          );
        }
      }
      return <span key={i} className="text-[var(--foreground)]">{part}</span>;
    });
  };

  const renderHighlightedJson = (str: string) => {
    let htmlContent = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
    htmlContent = htmlContent.replace(htmlRegex, (match) => {
      let cls = 'text-[var(--foreground)]';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-[#9CDCFE]'; // Key
        } else {
          cls = 'text-[#D69D85]'; // String
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-[#569CD6] font-semibold';
      } else if (/null/.test(match)) {
        cls = 'text-[#569CD6] italic';
      } else {
        cls = 'text-[#B5CEA8]'; // Number
      }
      return `<span class="${cls}">${match}</span>`;
    });
    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  };

  const renderGenericKVPTable = (list: any[], setList: (newList: any[]) => void, title?: string, hideEnableLabel?: boolean, disableKey?: boolean) => {
    const allEnabled = list.length > 0 && list.every((item: any) => item.enabled !== false);

    const handleToggleAll = (checked: boolean) => setList(list.map(item => ({ ...item, enabled: checked })));
    const handleChange = (index: number, field: string, val: any) => {
      const newList = [...list];
      if (!newList[index]) newList[index] = { key: "", value: "", enabled: true };
      newList[index][field] = val;
      setList(newList);
      checkVarSuggest(`${title || 'kvp'}-${index}-${field}`, val);
    };
    const handleRemove = (index: number) => {
      const newList = [...list];
      newList.splice(index, 1);
      setList(newList);
    };
    const handleAdd = () => setList([...list, { key: "", value: "", enabled: true }]);

    return (
      <div className="flex flex-col gap-2 px-3 pt-3 pb-0">
        {title && <div className="text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider mb-1">{title}</div>}
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              {!hideEnableLabel && (
                <th className="py-1 px-2 font-medium w-8 text-center pt-2">
                  <input 
                    type="checkbox" 
                    checked={allEnabled}
                    onChange={e => handleToggleAll(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--color-brand-500)] cursor-pointer"
                  />
                </th>
              )}
              <th className="py-1 px-2 font-medium w-[45%]">Key</th>
              <th className="py-1 px-2 font-medium w-[45%]">Value</th>
              <th className="py-1 px-2 font-medium w-[10%]"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((item: any, i: number) => (
              <tr key={i} className={`border-b border-[var(--border)] hover:bg-[var(--background)] ${item.enabled === false ? 'opacity-50' : ''}`}>
                {!hideEnableLabel && (
                  <td className="p-0 border-r border-[var(--border)] text-center">
                    <input 
                      type="checkbox" 
                      checked={item.enabled !== false} 
                      onChange={e => handleChange(i, 'enabled', e.target.checked)} 
                      className="w-3.5 h-3.5 accent-[var(--color-brand-500)] cursor-pointer mt-1" 
                    />
                  </td>
                )}
                <td className="p-0 border-l border-[var(--border)] relative">
                  <input 
                    type="text" 
                    value={item.key} 
                    onChange={e => handleChange(i, 'key', e.target.value)} 
                    onBlur={() => setTimeout(() => setVarSuggest(prev => prev.id === `${title || 'kvp'}-${i}-key` ? { ...prev, show: false } : prev), 150)}
                    className="w-full bg-transparent px-2 py-1.5 outline-none font-mono" 
                    placeholder="Key" 
                    disabled={disableKey}
                  />
                  {renderVarSuggest(`${title || 'kvp'}-${i}-key`, item.key, (val) => handleChange(i, 'key', val))}
                </td>
                <td className={`p-0 border-l border-[var(--border)] relative ${highlightedFields.has(item.key) ? 'kvp-highlight-missing' : ''}`}>
                  <textarea 
                    data-pathvar-key={disableKey ? item.key : undefined}
                    value={item.value} 
                    onChange={e => { handleChange(i, 'value', e.target.value); if (highlightedFields.has(item.key)) { setHighlightedFields(prev => { const next = new Set(prev); next.delete(item.key); return next; }); } }} 
                    onBlur={() => setTimeout(() => setVarSuggest(prev => prev.id === `${title || 'kvp'}-${i}-value` ? { ...prev, show: false } : prev), 150)}
                    className={`w-full bg-transparent px-2 py-1.5 outline-none font-mono min-h-[30px] resize-y ${highlightedFields.has(item.key) ? 'placeholder:text-red-400' : ''}`}
                    placeholder={highlightedFields.has(item.key) ? `← Enter ${item.key}` : "Value"}
                    rows={1}
                  />
                  {renderVarSuggest(`${title || 'kvp'}-${i}-value`, item.value, (val) => handleChange(i, 'value', val))}
                </td>
                <td className="p-0 border-l border-[var(--border)] text-center">
                  <button onClick={() => handleRemove(i)} disabled={disableKey} className="text-[var(--muted)] hover:text-red-500 p-1.5 disabled:opacity-20 flex w-full justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && hideEnableLabel && (
              <tr>
                <td colSpan={3} className="py-6 px-3 text-center text-[var(--muted)] text-xs border-b border-[var(--border)]">
                  No layout variables isolated.<br/><span className="mt-1 opacity-70">Define them dynamically by typing `:parameter` (e.g. `:orgId`) directly inside your request URL bar.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!hideEnableLabel && (
          <button 
            onClick={handleAdd}
            className="self-start text-xs flex items-center gap-1 mt-2 text-[var(--color-brand-500)] hover:underline p-1"
          >
            <Plus className="w-3 h-3" /> Add item
          </button>
        )}
      </div>
    );
  };

  const renderFormDataKVPTable = (list: any[], setList: (newList: any[]) => void) => {
    const allEnabled = list.length > 0 && list.every((item: any) => item.enabled !== false);
    const handleToggleAll = (checked: boolean) => setList(list.map(item => ({ ...item, enabled: checked })));
    const handleChange = (index: number, field: string, val: any) => {
      const newList = [...list];
      if (!newList[index]) newList[index] = { key: "", value: "", type: "text", description: "", enabled: true };
      newList[index][field] = val;
      setList(newList);
      checkVarSuggest(`formdata-${index}-${field}`, val);
    };
    const handleRemove = (index: number) => {
      const newList = [...list];
      newList.splice(index, 1);
      setList(newList);
    };
    const handleAdd = () => setList([...list, { key: "", value: "", type: "text", description: "", enabled: true }]);

    return (
      <div className="flex flex-col gap-2 px-3 pt-3 pb-0">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-1 px-2 font-medium w-8 text-center pt-2">
                <input 
                  type="checkbox" 
                  checked={allEnabled}
                  onChange={e => handleToggleAll(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--color-brand-500)] cursor-pointer"
                />
              </th>
              <th className="py-1 px-2 font-medium w-[25%]">Key</th>
              <th className="py-1 px-2 font-medium w-[30%]">Value</th>
              <th className="py-1 px-2 font-medium w-[30%]">Description</th>
              <th className="py-1 px-2 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((item: any, i: number) => (
              <tr key={i} className={`border-b border-[var(--border)] hover:bg-[var(--background)] group ${item.enabled === false ? 'opacity-50' : ''}`}>
                <td className="p-0 border-r border-[var(--border)] text-center">
                  <input 
                    type="checkbox" 
                    checked={item.enabled !== false} 
                    onChange={e => handleChange(i, 'enabled', e.target.checked)} 
                    className="w-3.5 h-3.5 accent-[var(--color-brand-500)] cursor-pointer mt-1" 
                  />
                </td>
                <td className="p-0 border-l border-[var(--border)] relative">
                  <div className="flex items-center">
                     <input 
                       type="text" 
                       value={item.key || ""} 
                       onChange={e => handleChange(i, 'key', e.target.value)} 
                       onBlur={() => setTimeout(() => setVarSuggest(prev => prev.id === `formdata-${i}-key` ? { ...prev, show: false } : prev), 150)}
                       className="w-full bg-transparent px-2 py-1.5 outline-none font-mono" 
                       placeholder="Key" 
                     />
                     {renderVarSuggest(`formdata-${i}-key`, item.key || "", (val) => handleChange(i, 'key', val))}
                     {/* Hidden dropdown that appears on hover/focus to select Text vs File */}
                     <StyledSelect
                       options={[
                         { value: 'text', label: 'Text' },
                         { value: 'file', label: 'File' },
                       ]}
                       value={item.type || 'text'}
                       onChange={(val) => {
                         handleChange(i, 'type', val);
                         handleChange(i, 'value', '');
                       }}
                       size="xs"
                       showCheckmark={false}
                       className="opacity-0 group-hover:opacity-100 absolute right-1 z-10 transition-opacity"
                     />
                  </div>
                </td>
                <td className="p-0 border-l border-[var(--border)] relative">
                  {item.type === 'file' ? (
                     <div className="flex items-center w-full px-2 py-1">
                        <label className="bg-[var(--sidebar)] border border-[var(--border)] cursor-pointer hover:bg-[var(--card)] px-2 py-0.5 rounded text-[10px] uppercase font-semibold text-[var(--muted)]">
                           Select Files
                           <input 
                             type="file" 
                             multiple
                             className="hidden"
                             onChange={(e) => {
                                // Since storing raw File objects deeply in React state and then proxying them locally is extremely complex due to DOM serialization rules across NestJS proxy networks,
                                // we will just store the file names visually here to mimic postman. Actual direct multipart stream forwarding would require a massive app architecture change.
                                const filesStr = Array.from(e.target.files || []).map(f => f.name).join(", ");
                                handleChange(i, 'value', filesStr || '');
                             }}
                           />
                        </label>
                        <span className="ml-2 text-[10px] truncate w-32 opacity-70" title={item.value}>{item.value || 'No files selected'}</span>
                     </div>
                  ) : (
                     <>
                       <textarea 
                         value={item.value || ""} 
                         onChange={e => handleChange(i, 'value', e.target.value)} 
                         onBlur={() => setTimeout(() => setVarSuggest(prev => prev.id === `formdata-${i}-value` ? { ...prev, show: false } : prev), 150)}
                         className="w-full bg-transparent px-2 py-1.5 outline-none font-mono min-h-[30px] resize-y" 
                         placeholder="Value" 
                         rows={1}
                       />
                       {renderVarSuggest(`formdata-${i}-value`, item.value || "", (val) => handleChange(i, 'value', val))}
                     </>
                  )}
                </td>
                <td className="p-0 border-l border-[var(--border)] relative">
                  <input 
                    type="text" 
                    value={item.description || ""} 
                    onChange={e => handleChange(i, 'description', e.target.value)} 
                    className="w-full bg-transparent px-2 py-1.5 outline-none font-sans" 
                    placeholder="Description" 
                  />
                </td>
                <td className="p-0 border-l border-[var(--border)] text-center">
                  <button onClick={() => handleRemove(i)} className="text-[var(--muted)] hover:text-red-500 p-1.5 flex w-full justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button 
          onClick={handleAdd}
          className="self-start text-xs flex items-center gap-1 mt-2 text-[var(--color-brand-500)] hover:underline p-1"
        >
          <Plus className="w-3 h-3" /> Add item
        </button>
      </div>
    );
  };

  const renderKVPTable = (type: "params" | "headers" | "pathVariables", title?: string) => {
    const list = request[type] || [];
    return renderGenericKVPTable(list, (newList) => {
      if (type === 'params') {
        onChange({ ...request, [type]: newList, url: syncParamsToUrl(request.url, newList) });
      } else {
        onChange({ ...request, [type]: newList });
      }
    }, title, type === 'pathVariables', type === 'pathVariables');
  };

  const renderAuthTab = () => {
    const auth = request.auth || { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };
    return (
      <div className="flex h-full border-[var(--border)] relative bg-[var(--background)]">
        <div className="w-48 border-r border-[var(--border)] p-3 flex flex-col gap-2">
          <label className="text-[10px] text-[var(--muted)] font-semibold uppercase">Type</label>
          <StyledSelect
            options={[
              { value: 'none', label: 'No Auth' },
              { value: 'bearer', label: 'Bearer Token' },
              { value: 'basic', label: 'Basic Auth' },
            ]}
            value={auth.type || 'none'}
            onChange={(val) => handleAuthChange('type', val)}
            size="sm"
          />
        </div>
        <div className="flex-1 p-6 relative bg-[var(--background)]">
          {auth.type === 'none' && (
            <div className="text-[var(--muted)] text-sm flex flex-col justify-center h-full max-w-md mx-auto text-center">
              This request does not use any authorization.
            </div>
          )}
          
          {auth.type === 'bearer' && (
              <div className="max-w-xl">
              <div className="text-sm font-semibold mb-4 text-[var(--muted)]">Bearer Token</div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-[var(--muted)]">Token</label>
                <div className="relative bg-[var(--card)] border border-[var(--border)] rounded focus-within:border-[var(--color-brand-500)] transition-colors overflow-visible flex">
                  {/* Native Input */}
                  <input 
                    id={`auth-token-${request.id}`}
                    type={showToken ? "text" : "password"} 
                    value={auth.bearerToken || ''} 
                    onChange={e => handleAuthChange('bearerToken', e.target.value)}
                    onScroll={(e) => {
                      const overlay = document.getElementById(`token-overlay-${request.id}`);
                      if (overlay) overlay.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                    spellCheck={false}
                    className={`w-full bg-transparent p-2 pr-10 outline-none text-sm font-mono caret-[var(--foreground)] z-10 ${showToken ? 'text-transparent selection:bg-[var(--color-brand-500)]/30' : 'text-[var(--foreground)]'}`}
                  />
                  
                  {/* Syntax Highlighter Overlay (Only when visible) */}
                  {showToken && (
                    <div 
                      id={`token-overlay-${request.id}`}
                      className="absolute inset-y-0 left-0 right-10 p-2 pointer-events-none whitespace-pre text-sm font-mono overflow-hidden z-20"
                      aria-hidden="true"
                    >
                      {auth.bearerToken ? renderHighlightedUrl(auth.bearerToken, `auth-token-${request.id}`, 'auth-bearerToken') : <span className="text-[var(--muted)] opacity-50">Token</span>}
                    </div>
                  )}

                  <button 
                    type="button" 
                    onClick={() => setShowToken(!showToken)} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] z-30"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  
                  {/* Autocomplete Dropdown */}
                  {renderVarSuggest(`auth-bearerToken`, auth.bearerToken || '', (val) => handleAuthChange('bearerToken', val))}
                </div>
              </div>
            </div>
          )}

          {auth.type === 'basic' && (
            <div className="max-w-xl">
              <div className="text-sm font-semibold mb-4 text-[var(--muted)]">Basic Auth</div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 relative">
                  <label className="text-xs text-[var(--muted)]">Username</label>
                  <input 
                    type="text" 
                    value={auth.basicUsername || ''} 
                    onChange={e => handleAuthChange('basicUsername', e.target.value)}
                    placeholder="Username"
                    className="bg-[var(--card)] border border-[var(--border)] p-2 rounded w-full outline-none focus:border-[var(--color-brand-500)] text-sm font-mono"
                  />
                  {renderVarSuggest(`auth-basicUsername`, auth.basicUsername || '', (val) => handleAuthChange('basicUsername', val))}
                </div>
                <div className="flex flex-col gap-2 relative">
                  <label className="text-xs text-[var(--muted)]">Password</label>
                  <div className="relative flex">
                    <input 
                      type={showBasicPassword ? "text" : "password"} 
                      value={auth.basicPassword || ''} 
                      onChange={e => handleAuthChange('basicPassword', e.target.value)}
                      placeholder="Password"
                      className="bg-[var(--card)] border border-[var(--border)] p-2 pr-10 rounded w-full outline-none focus:border-[var(--color-brand-500)] text-sm font-mono"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowBasicPassword(!showBasicPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] z-30"
                    >
                      {showBasicPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {renderVarSuggest(`auth-basicPassword`, auth.basicPassword || '', (val) => handleAuthChange('basicPassword', val))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const getBodyObj = () => {
    if (!request.body) return { mode: 'none', raw: { language: 'json', data: '' }, formdata: [], urlencoded: [], graphql: { query: '', variables: '' } };
    if (typeof request.body === 'string') {
      try {
        const parsed = JSON.parse(request.body);
        if (parsed && typeof parsed === 'object' && parsed.mode) {
          return parsed;
        }
      } catch (e) {}
      return { mode: 'raw', raw: { language: 'json', data: request.body }, formdata: [], urlencoded: [], graphql: { query: '', variables: '' } };
    }
    return request.body;
  };

  const updateBodyObj = (updates: any) => {
    const current = getBodyObj();
    onChange({...request, body: {...current, ...updates}});
  };

  const renderBodyTab = () => {
    const bodyState = getBodyObj();
    const modes = [
      { id: 'none', label: 'none' },
      { id: 'formdata', label: 'form-data' },
      { id: 'urlencoded', label: 'x-www-urlencoded' },
      { id: 'raw', label: 'raw' },
      { id: 'binary', label: 'binary' },
      { id: 'graphql', label: 'GraphQL' },
    ];

    return (
      <div className="flex flex-col h-full bg-[var(--background)]">
        <div className="flex items-center gap-4 px-3 py-2 border-b border-[var(--border)] text-xs font-medium">
          {modes.map(mode => (
            <label key={mode.id} className="flex items-center gap-1.5 cursor-pointer text-[var(--foreground)] hover:text-[var(--color-brand-500)]">
              <input 
                type="radio" 
                name="bodyType" 
                checked={bodyState.mode === mode.id}
                onChange={() => updateBodyObj({ mode: mode.id })}
                className="accent-[var(--color-brand-500)] w-3.5 h-3.5"
              />
              {mode.label}
            </label>
          ))}

          {bodyState.mode === 'raw' && (
            <div className="ml-auto flex items-center gap-2">
              {bodyState.raw.language === 'json' && (
                <button 
                  onClick={() => {
                     try {
                        const parsed = JSON.parse(bodyState.raw.data || '');
                        updateBodyObj({ raw: { ...bodyState.raw, data: JSON.stringify(parsed, null, 2) } });
                        toast.success("JSON formatted!");
                     } catch(e) {
                        toast.error("Invalid JSON. Cannot format.");
                     }
                  }}
                  className="text-[var(--muted)] hover:text-[var(--color-brand-500)] flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-[var(--sidebar)] border border-[var(--border)] transition-colors hover:border-[var(--color-brand-500)]"
                  title="Format JSON"
                >
                  <Wand2 className="w-3 h-3" /> Prettier
                </button>
              )}
              <StyledSelect
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'javascript', label: 'JavaScript' },
                  { value: 'json', label: 'JSON' },
                  { value: 'html', label: 'HTML' },
                  { value: 'xml', label: 'XML' },
                ]}
                value={bodyState.raw.language}
                onChange={(val) => updateBodyObj({ raw: { ...bodyState.raw, language: val } })}
                size="xs"
                showCheckmark={false}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {bodyState.mode === 'none' && (
            <div className="text-[var(--muted)] text-sm flex flex-col items-center justify-center h-full opacity-70">
              This request does not have a body
            </div>
          )}

          {bodyState.mode === 'formdata' && renderFormDataKVPTable(bodyState.formdata || [], (newList) => updateBodyObj({ formdata: newList }))}
          
          {bodyState.mode === 'urlencoded' && renderGenericKVPTable(bodyState.urlencoded || [], (newList) => updateBodyObj({ urlencoded: newList }))}

          {bodyState.mode === 'raw' && (
             <div className="p-3 h-full flex flex-col relative">
               <div className="relative flex-1 flex rounded border border-[var(--border)] focus-within:border-[var(--color-brand-500)] bg-[var(--sidebar)] overflow-hidden transition-colors">
                 <textarea 
                   value={bodyState.raw.data || ""}
                   onChange={e => updateBodyObj({ raw: { ...bodyState.raw, data: e.target.value } })}
                   onScroll={(e) => {
                     const overlay = document.getElementById(`raw-overlay-${request.id}`);
                     if (overlay) {
                       overlay.scrollTop = e.currentTarget.scrollTop;
                       overlay.scrollLeft = e.currentTarget.scrollLeft;
                     }
                   }}
                   className={`absolute inset-0 w-full h-full p-3 text-xs font-mono outline-none resize-none z-10 bg-transparent ${bodyState.raw.language === 'json' ? 'text-transparent caret-[var(--foreground)] selection:bg-[var(--color-brand-500)]/30' : 'text-[var(--foreground)]'}`}
                   spellCheck={false}
                   placeholder="Enter raw payload..." />
                 {bodyState.raw.language === 'json' && (
                   <div 
                     id={`raw-overlay-${request.id}`}
                     className="absolute inset-0 w-full h-full p-3 text-xs font-mono pointer-events-none whitespace-pre-wrap break-words overflow-auto z-0 text-[var(--foreground)]"
                   >
                     {renderHighlightedJson((bodyState.raw.data || '') + (bodyState.raw.data?.endsWith('\n') ? ' ' : ''))}
                   </div>
                 )}
               </div>
             </div>
          )}

          {bodyState.mode === 'binary' && (
            <div className="text-[var(--muted)] text-sm flex flex-col items-center justify-center h-full p-6">
               <div className="bg-[var(--sidebar)] border border-dashed border-[var(--border)] rounded-md w-full max-w-md h-32 flex items-center justify-center cursor-pointer hover:border-[var(--color-brand-500)] hover:bg-[var(--card)] transition-colors">
                  <span className="font-semibold text-xs uppercase tracking-widest flex items-center gap-2"><Plus className="w-4 h-4"/> Select File</span>
               </div>
               <div className="text-[10px] mt-2 opacity-50 text-center">File uploads are forwarded via proxy. Very large files may be rejected.</div>
            </div>
          )}

          {bodyState.mode === 'graphql' && (
            <GraphQLEditor
              query={bodyState.graphql?.query || ""}
              variables={bodyState.graphql?.variables || ""}
              onQueryChange={(q) => updateBodyObj({ graphql: { ...bodyState.graphql, query: q } })}
              onVariablesChange={(v) => updateBodyObj({ graphql: { ...bodyState.graphql, variables: v } })}
              requestUrl={request.url || ""}
              envVariables={envVariables}
            />
          )}
        </div>
      </div>
    );
  };

  const isTabActive = (tabName: string) => {
    switch(tabName) {
      case "Params":
        const hasParams = request.params?.some((p: any) => p.key && p.enabled !== false);
        const hasPathVars = request.pathVariables?.some((p: any) => p.key && p.enabled !== false && p.value);
        return hasParams || hasPathVars;
      case "Headers":
        return request.headers?.some((h: any) => h.key && h.enabled !== false);
      case "Auth":
        return request.auth && request.auth.type !== 'none';
      case "Body":
        const bodyObj = getBodyObj();
        return bodyObj.mode !== 'none';
      case "Pre-request Script":
        return !!request.preRequestScript?.trim();
      case "Tests":
        return !!request.testScript?.trim();
      default:
        return false;
    }
  };

  // Convert array back to object for Axios request
  const formatRequestForAxios = () => {
    const params = (request.params || []).reduce((acc: any, curr: any) => { if(curr.key && curr.enabled !== false) acc[curr.key] = curr.value; return acc; }, {});
    
    // Pre-seed system default headers, overridden by user headers if keys perfectly match
    const headers = {
      'Accept': '*/*',
      'User-Agent': 'JetAPI/1.0',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    } as any;
    
    (request.headers || []).forEach((curr: any) => { 
      if(curr.key && curr.enabled !== false) headers[curr.key] = curr.value; 
    });
    
    // Inject Path Variables into URL safely
    let finalUrl = request.url;
    if (request.pathVariables && request.pathVariables.length > 0) {
      request.pathVariables.forEach((pv: any) => {
        if (pv.key) {
           // simple string replace the exact marker, assuming pv.value is URL safe or handle encoding on execution
           finalUrl = finalUrl.replace(`:${pv.key}`, pv.value || `:${pv.key}`);
        }
      });
    }
    
    let bodyData = undefined;
    if(request.method !== 'GET' && request.method !== 'DELETE') {
      try {
        bodyData = request.body ? JSON.parse(request.body) : undefined;
      } catch(e) {
        bodyData = request.body; // send as raw string if JSON fails
      }
    }

    return {
      method: request.method,
      url: finalUrl,
      params,
      headers,
      body: bodyData,
      auth: request.auth
    };
  };

  return (
    <div className="flex flex-col h-full bg-[var(--card)] relative">
      {/* Header Area (Breadcrumb + Name) */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-col gap-2 relative z-[100]">
        {/* Breadcrumb Trail */}
        {request._breadcrumb && request._breadcrumb.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#8b8b8b] font-medium">
            {request._breadcrumb.map((bc: string, i: number) => (
               <span key={i} className="flex items-center gap-1.5">
                 <span 
                   className="hover:text-[var(--foreground)] hover:underline cursor-pointer transition-colors max-w-[200px] truncate" 
                   title={bc}
                   onClick={() => {
                     const pathUpToClick = request._breadcrumb.slice(0, i + 1);
                     window.dispatchEvent(new CustomEvent('expand-sidebar-folder', { detail: { breadcrumb: pathUpToClick } }));
                   }}
                 >
                   {bc}
                 </span>
                 {i < request._breadcrumb.length - 1 && <span className="opacity-50">/</span>}
               </span>
            ))}
          </div>
        )}
        
        {/* Name Input */}
        <div className="flex items-center justify-between">
          <input 
            type="text"
            value={request.name ?? ""}
            onChange={e => onChange({...request, name: e.target.value})}
            className="bg-transparent text-[18px] font-medium outline-none focus:border-b border-[var(--color-brand-500)] w-3/4 py-0.5"
            placeholder="Request Name"
          />
          <div className="flex items-center gap-1">
            <button 
              onClick={() => {
                if (request.url) {
                  let resolvedUrl = request.url;
                  
                  // 1. Resolve {{variables}}
                  const matches = request.url.match(/{{([^}]+)}}/g);
                  if (matches) {
                    matches.forEach((match: string) => {
                      const key = match.slice(2, -2);
                      const envVar = envVariables.find((v: any) => v.key === key);
                      if (envVar) {
                        const val = envVar.currentValue !== undefined ? envVar.currentValue : (envVar.value !== undefined ? envVar.value : envVar.initialValue);
                        resolvedUrl = resolvedUrl.replace(match, val || '');
                      }
                    });
                  }
                  
                  // 2. Resolve :pathVariables
                  if (request.pathVariables && request.pathVariables.length > 0) {
                    request.pathVariables.forEach((pv: any) => {
                      if (pv.key && pv.value) {
                         const regex = new RegExp(`:${pv.key}(?=[/?#]|$)`, 'g');
                         resolvedUrl = resolvedUrl.replace(regex, pv.value);
                      }
                    });
                  }
                  
                  copyToClipboard(resolvedUrl);
                  toast.success("URL copied to clipboard!");
                } else {
                  toast.info("No URL to copy yet.");
                }
              }}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors flex items-center justify-center"
              title="Copy Link"
            >
              <Link2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onDelete?.(request)}
              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors flex items-center justify-center mr-1"
              title="Delete Request"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                toast.info("Share workspace functionality coming soon!");
              }}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors flex items-center justify-center mr-1"
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
            
            <div className="flex bg-[var(--sidebar)] border border-[var(--border)] rounded overflow-hidden shadow-sm">
            <button 
              onClick={() => onSave?.(request)}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-[13px] font-medium hover:bg-[#333] px-3 py-1.5 transition-colors text-[var(--foreground)] disabled:opacity-50"
              title="Save"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>}
              Save
            </button>
            <div className="w-[1px] bg-[var(--border)]" />
            <button 
              onClick={() => onSaveAs?.(request)}
              className="flex items-center text-[13px] font-medium hover:bg-[#333] px-2 py-1.5 transition-colors text-[var(--foreground)]"
              title="Save As..."
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

      <div className="flex flex-col border-b border-[var(--border)] bg-[var(--background)]">
        {/* URL Bar */}
        <div className="px-3 py-3 flex items-center gap-1.5">
          <div className="relative" ref={methodDropdownRef}>
            <button
              onClick={() => setIsMethodDropdownOpen(!isMethodDropdownOpen)}
              className="bg-[var(--sidebar)] border border-[var(--border)] rounded font-semibold px-3 py-1.5 text-xs outline-none focus:border-[var(--color-brand-500)] flex items-center gap-2 min-w-[90px] justify-between"
              style={{ color: getMethodColor(request.method) }}
            >
              <span>{request.method}</span>
              <ChevronDown className="w-3 h-3 text-[var(--muted)]" />
            </button>
            
            {isMethodDropdownOpen && (
              <div className="absolute top-10 left-0 w-32 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg z-50 py-1 overflow-hidden">
                {methods.map(m => (
                  <button
                    key={m}
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-[var(--sidebar)] transition-colors"
                    style={{ color: getMethodColor(m) }}
                    onClick={() => {
                      onChange({...request, method: m});
                      setIsMethodDropdownOpen(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex-1 relative bg-[var(--sidebar)] border border-[var(--border)] rounded focus-within:border-[var(--color-brand-500)] transition-colors overflow-visible flex">
            {/* Invisible Native Input */}
            <input 
              id={`url-input-${request.id}`}
              type="text" 
              value={request.url}
              onChange={e => handleUrlChange(e.target.value)}
              onScroll={(e) => {
                const overlay = document.getElementById(`url-overlay-${request.id}`);
                if (overlay) overlay.scrollLeft = e.currentTarget.scrollLeft;
              }}
              spellCheck={false}
              className="w-full bg-transparent px-3 py-1.5 outline-none text-xs font-mono caret-[var(--foreground)] text-transparent selection:bg-[var(--color-brand-500)]/30 z-10"
            />

            {/* Syntax Highlighter Overlay */}
            <div 
              id={`url-overlay-${request.id}`}
              className="absolute inset-0 px-3 py-1.5 pointer-events-none whitespace-pre text-xs font-mono overflow-hidden z-20"
              aria-hidden="true"
            >
              {request.url ? renderHighlightedUrl(request.url, `url-input-${request.id}`, 'url-input') : <span className="text-[var(--muted)]">Enter request URL</span>}
            </div>
            
            {/* URL Variable Autocomplete Dropdown Wrapper */}
            {renderVarSuggest('url-input', request.url || '', handleUrlChange)}
          </div>
          
          <button 
            onClick={() => {
              if (!flags.allow_api_execution && !loading) {
                toast.error("API execution is currently disabled by the administrator.");
                return;
              }
              if (loading && onCancel) {
                onCancel();
                return;
              }
              const missingVars = (request.pathVariables || []).filter((pv: any) => pv.key && !pv.value && request.url.includes(`:${pv.key}`));
              if (missingVars.length > 0) {
                 toast.error("Please provide values for path variables: " + missingVars.map((v:any) => v.key).join(", "));
                 // Switch to Params tab and highlight the missing fields
                 setActiveTab("Params");
                 const missingKeys = new Set<string>(missingVars.map((v: any) => v.key));
                 setHighlightedFields(missingKeys);
                 // Focus the first missing path variable value input after a short delay for tab switch
                 setTimeout(() => {
                   const firstMissingKey = missingVars[0]?.key;
                   if (firstMissingKey) {
                     const el = document.querySelector(`textarea[data-pathvar-key="${firstMissingKey}"]`) as HTMLTextAreaElement;
                     if (el) {
                       el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                       el.focus();
                     }
                   }
                 }, 100);
                 // Auto-clear highlights after 2 seconds
                 setTimeout(() => setHighlightedFields(new Set()), 2500);
                 return;
              }
              onSend(formatRequestForAxios());
            }}
            disabled={!loading && !request.url}
            className={`btn-spring ${loading ? 'bg-red-500 hover:bg-red-600' : 'bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)]'} text-white px-4 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? (
              <><span>Cancel</span><XCircle className="w-3.5 h-3.5" /></>
            ) : (
              <><span>Send</span><Send className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex items-center gap-4 px-3 pt-2 text-xs border-b border-[var(--border)] font-medium text-[var(--muted)]">
        {tabs.map(tab => {
          const active = isTabActive(tab);
          return (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent hover:text-[var(--foreground)]'
              }`}
            >
              {tab}
              {active && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-[var(--sidebar)]/30 pb-12">
        {activeTab === "Params" && (
          <div className="flex flex-col gap-4">
            {renderKVPTable("params", "Query Params")}
            {renderKVPTable("pathVariables", "Path Variables")}
          </div>
        )}
        {activeTab === "Auth" && renderAuthTab()}
        {activeTab === "Headers" && (
          <div className="flex flex-col gap-4">
            {renderKVPTable("headers", "Headers")}
            
            <div className="px-3 pb-4">
              <div className="text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider mb-2">Auto-generated Headers</div>
              <div className="border border-[var(--border)] rounded overflow-hidden">
                <table className="w-full text-xs text-left border-collapse opacity-70 bg-[var(--background)]">
                  <tbody>
                    <tr className="border-b border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]">
                      <td className="py-2 px-3 w-[45%] font-mono">Accept</td>
                      <td className="py-2 px-3 w-[45%] font-mono">*/*</td>
                    </tr>
                    <tr className="border-b border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]">
                      <td className="py-2 px-3 w-[45%] font-mono">User-Agent</td>
                      <td className="py-2 px-3 w-[45%] font-mono">JetAPI/1.0</td>
                    </tr>
                    <tr className="border-b border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]">
                      <td className="py-2 px-3 w-[45%] font-mono">Accept-Encoding</td>
                      <td className="py-2 px-3 w-[45%] font-mono">gzip, deflate, br</td>
                    </tr>
                    <tr className="text-[var(--muted)] hover:bg-[var(--card)]">
                      <td className="py-2 px-3 w-[45%] font-mono">Connection</td>
                      <td className="py-2 px-3 w-[45%] font-mono">keep-alive</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === "Body" && renderBodyTab()}
        {activeTab === "Pre-request Script" && (
          <div className="p-4 h-full flex flex-col">
            <div className="text-xs text-[var(--muted)] mb-2 uppercase font-semibold">Pre-request Script</div>
            <textarea 
              value={request.preRequestScript || ""}
              onChange={e => onChange({...request, preRequestScript: e.target.value})}
              className="w-full flex-1 bg-[var(--sidebar)] border border-[var(--border)] rounded-md p-4 font-mono text-sm outline-none focus:border-[var(--color-brand-500)] resize-none"
              placeholder="// Write Javascript code to execute before this request runs&#10;console.log('Running pre-request...');" />
          </div>
        )}
        {activeTab === "Tests" && (() => {
          const snippets = [
            { label: "Status is 200", code: `pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});\n` },
            { label: "Status is not 404", code: `pm.test("Status is not 404", function () {\n    pm.response.to.not.have.status(404);\n});\n` },
            { label: "Response is OK (2xx)", code: `pm.test("Response is OK", function () {\n    pm.response.to.be.ok;\n});\n` },
            { label: "Response has JSON body", code: `pm.test("Response has JSON body", function () {\n    pm.response.to.have.jsonBody();\n});\n` },
            { label: "JSON has property", code: `pm.test("Body has property 'data'", function () {\n    const json = pm.response.json();\n    pm.expect(json).to.have.property("data");\n});\n` },
            { label: "Check value equals", code: `pm.test("Check value", function () {\n    const json = pm.response.json();\n    pm.expect(json.success).to.equal(true);\n});\n` },
            { label: "Array is not empty", code: `pm.test("Array is not empty", function () {\n    const json = pm.response.json();\n    pm.expect(json.data.length).to.be.above(0);\n});\n` },
            { label: "Response time < 500ms", code: `pm.test("Response time is acceptable", function () {\n    pm.expect(pm.response.responseTime).to.be.below(500);\n});\n` },
            { label: "Header exists", code: `pm.test("Content-Type header exists", function () {\n    pm.response.to.have.header("content-type");\n});\n` },
            { label: "Body contains string", code: `pm.test("Body contains expected text", function () {\n    pm.response.to.have.body("success");\n});\n` },
            { label: "Deep equality check", code: `pm.test("Object matches expected", function () {\n    const json = pm.response.json();\n    pm.expect(json.status).to.eql("active");\n});\n` },
            { label: "Type check", code: `pm.test("Data is an object", function () {\n    const json = pm.response.json();\n    pm.expect(json.data).to.be.an("object");\n});\n` },
          ];

          const insertSnippet = (code: string) => {
            const current = request.testScript || "";
            const newScript = current ? current.trimEnd() + "\n\n" + code : code;
            onChange({ ...request, testScript: newScript });
          };

          return (
            <div className="flex h-full overflow-hidden">
              {/* Editor */}
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[var(--muted)] uppercase font-semibold">Tests Script</div>
                  {(request.testScript || "").trim() && (
                    <button
                      onClick={() => onChange({ ...request, testScript: "" })}
                      className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea 
                  value={request.testScript || ""}
                  onChange={e => onChange({...request, testScript: e.target.value})}
                  className="w-full flex-1 bg-[var(--sidebar)] border border-[var(--border)] rounded-md p-4 font-mono text-sm outline-none focus:border-[var(--color-brand-500)] resize-none"
                  placeholder={"// Write Javascript tests to execute after response is received\npm.test('Status code is 200', function () {\n    pm.response.to.have.status(200);\n});"} />
              </div>

              {/* Snippets Sidebar */}
              <div className="w-52 shrink-0 border-l border-[var(--border)] bg-[var(--sidebar)]/50 flex flex-col overflow-hidden">
                <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--sidebar)]">
                  <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Snippets</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
                  {snippets.map((s, i) => {
                    const alreadyAdded = (request.testScript || "").includes(s.code.split("\n")[0]);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (alreadyAdded) {
                            // Remove this snippet from the script
                            const current = request.testScript || "";
                            const cleaned = current.replace(s.code, "").replace(/\n{3,}/g, "\n\n").trim();
                            onChange({ ...request, testScript: cleaned });
                          } else {
                            insertSnippet(s.code);
                          }
                        }}
                        className={`text-left px-2.5 py-2 rounded-md text-[11px] transition-colors group flex items-center gap-2 ${
                          alreadyAdded 
                            ? 'text-green-500 hover:text-red-400 bg-green-500/5 hover:bg-red-500/5' 
                            : 'text-[var(--foreground)] hover:bg-[var(--card)] hover:text-[var(--color-brand-500)]'
                        }`}
                        title={alreadyAdded ? "Click to remove" : "Click to add"}
                      >
                        {alreadyAdded 
                          ? <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[10px] group-hover:hidden">✓</span>
                          : <span className="w-1 h-1 rounded-full bg-[var(--muted)] group-hover:bg-[var(--color-brand-500)] shrink-0 transition-colors" />
                        }
                        {alreadyAdded && (
                          <span className="w-3 h-3 shrink-0 items-center justify-center text-[10px] hidden group-hover:flex">✕</span>
                        )}
                        <span className="leading-tight">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
        {activeTab === "Docs" && (
          <div className="p-4 h-full flex flex-col">
            <div className="text-xs text-[var(--muted)] mb-2 uppercase font-semibold">Documentation</div>
            <textarea 
              value={request.description || ""}
              onChange={e => onChange({...request, description: e.target.value})}
              className="w-full flex-1 bg-[var(--sidebar)] border border-[var(--border)] rounded-md p-4 text-sm outline-none focus:border-[var(--color-brand-500)] resize-none"
              placeholder="Add a rich markdown description of this API endpoint here..." />
          </div>
        )}
        {activeTab === "Settings" && (
          <div className="p-6 h-full flex flex-col gap-6 max-w-2xl text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold mb-1">Enable SSL certificate verification</div>
                <div className="text-[var(--muted)] text-xs">Verify SSL certificates when sending requests.</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--color-brand-500)]" />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold mb-1">Automatically follow redirects</div>
                <div className="text-[var(--muted)] text-xs">Follow HTTP 3xx responses as redirects.</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--color-brand-500)]" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold mb-1">Send no-cache header</div>
                <div className="text-[var(--muted)] text-xs">Send Cache-Control: no-cache header to bypass caches.</div>
              </div>
              <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand-500)]" />
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] pt-6">
              <div>
                <div className="font-semibold mb-1">Encode URL automatically</div>
                <div className="text-[var(--muted)] text-xs">Turn on URL encoding for variables and components.</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--color-brand-500)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
