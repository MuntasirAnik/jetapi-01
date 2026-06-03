import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, Copy, Check, Globe, MoreHorizontal, AlignLeft, Filter, Link2, Download, History, Code2, PlaySquare, Eye, Bookmark, CheckCircle2, XCircle, FlaskConical, ChevronsDownUp, ChevronsUpDown, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";
import StyledSelect from "./StyledSelect";
import type { TestResult } from "@/lib/testRunner";

// Build fold regions from formatted JSON lines
function buildFoldRegions(lines: string[]): Map<number, number> {
  const regions = new Map<number, number>(); // startLine -> endLine
  const stack: number[] = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim().replace(/,\s*$/, '');
    if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
      stack.push(i);
    }
    if (trimmed === '}' || trimmed === ']') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        regions.set(start, i);
      }
    }
  });
  return regions;
}

// Get visible lines considering collapsed regions
function getVisibleLines(lines: string[], foldRegions: Map<number, number>, collapsedLines: Set<number>): { originalIndex: number; content: string; isFoldable: boolean; isCollapsed: boolean; collapsedCount: number }[] {
  const visible: { originalIndex: number; content: string; isFoldable: boolean; isCollapsed: boolean; collapsedCount: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const isFoldable = foldRegions.has(i);
    const isCollapsed = collapsedLines.has(i);
    const endLine = foldRegions.get(i);
    if (isCollapsed && endLine !== undefined) {
      const hiddenCount = endLine - i - 1;
      const closingBracket = lines[endLine]?.trim() || '';
      visible.push({ originalIndex: i, content: lines[i], isFoldable: true, isCollapsed: true, collapsedCount: hiddenCount });
      visible.push({ originalIndex: endLine, content: lines[endLine], isFoldable: false, isCollapsed: false, collapsedCount: 0 });
      i = endLine + 1;
    } else {
      visible.push({ originalIndex: i, content: lines[i], isFoldable, isCollapsed: false, collapsedCount: 0 });
      i++;
    }
  }
  return visible;
}

// Syntax highlight a single JSON line
function highlightJsonLine(line: string): string {
  let html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Syntax highlighting
  const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  html = html.replace(regex, (match) => {
    let cls = 'json-bracket';
    if (/^"/.test(match)) {
      cls = /:$/.test(match) ? 'json-key' : 'json-string';
    } else if (/true|false/.test(match)) {
      cls = 'json-bool';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    } else {
      cls = 'json-number';
    }
    return `<span class="${cls}">${match}</span>`;
  });

  // Handle indentation guides (vertical lines for spacing)
  const spaceMatch = html.match(/^(\s+)/);
  if (spaceMatch) {
    const spaces = spaceMatch[1];
    let indentHtml = '';
    // Use chunks of 4 spaces for the guides
    for (let i = 0; i < spaces.length; i += 4) {
      const chunk = spaces.substring(i, i + 4);
      if (chunk.length === 4) {
        indentHtml += `<span class="indent-guide">${chunk}</span>`;
      } else {
        indentHtml += chunk;
      }
    }
    html = indentHtml + html.substring(spaces.length);
  }

  return html;
}

// Collect all foldable line indices
function collectAllFoldLines(foldRegions: Map<number, number>): Set<number> {
  return new Set(foldRegions.keys());
}

// Search match minimap overlay
function SearchMinimap({ containerRef, contentRef, searchQuery }: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  searchQuery: string;
}) {
  const [markers, setMarkers] = useState<number[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || !searchQuery.trim()) { setMarkers([]); return; }

    // Small delay to let DOM render marks
    const timer = setTimeout(() => {
      const marks = content.querySelectorAll('mark');
      const scrollHeight = container.scrollHeight;
      if (scrollHeight === 0 || marks.length === 0) { setMarkers([]); return; }

      const positions: number[] = [];
      marks.forEach(mark => {
        const top = (mark as HTMLElement).offsetTop;
        const pct = (top / scrollHeight) * 100;
        positions.push(pct);
      });
      setMarkers(positions);
    }, 100);

    return () => clearTimeout(timer);
  }, [containerRef, contentRef, searchQuery]);

  if (markers.length === 0) return null;

  const handleClick = (pct: number) => {
    const container = containerRef.current;
    if (!container) return;
    const scrollTo = (pct / 100) * container.scrollHeight - container.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
  };

  return (
    <div className="absolute top-0 right-0 w-2.5 h-full z-20 pointer-events-auto" style={{ background: 'rgba(30,30,30,0.5)' }}>
      {markers.map((pct, i) => (
        <div
          key={i}
          onClick={() => handleClick(pct)}
          className="absolute right-0 w-full cursor-pointer hover:opacity-100 transition-opacity"
          style={{
            top: `${pct}%`,
            height: '3px',
            background: '#ffb000',
            opacity: 0.85,
            borderRadius: '1px',
          }}
          title={`Match ${i + 1}`}
        />
      ))}
    </div>
  );
}

export default function ResponsePanel({ response, loading, request, testResults = [] }: { response: any; loading: boolean; request: any; testResults?: TestResult[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"Body" | "Headers" | "TestResults">("Body");
  const [responseType, setResponseType] = useState<"Auto" | "JSON" | "XML" | "HTML" | "JavaScript" | "Text" | "Hex" | "Base64">("Auto");
  const [exportModalContent, setExportModalContent] = useState<string | null>(null);
  const responseHtmlRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(new Set());
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘F to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleLine = useCallback((lineIndex: number) => {
    setCollapsedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineIndex)) next.delete(lineIndex); else next.add(lineIndex);
      return next;
    });
  }, []);

  // Count search matches (computed after formattedData below)
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  // Reset match index when search changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  // Scroll to current match
  useEffect(() => {
     if (searchQuery.trim() && responseHtmlRef.current) {
        const marks = responseHtmlRef.current.querySelectorAll('mark');
        if (marks.length > 0) {
          // Remove active styling from all
          marks.forEach(m => m.classList.remove('ring-2', 'ring-white'));
          const idx = Math.min(currentMatchIndex, marks.length - 1);
          const target = marks[idx];
          if (target) {
            target.classList.add('ring-2', 'ring-white');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
     }
  }, [searchQuery, response, currentMatchIndex]);

  // Count search matches (uses formattedData but safe as effect)
  const formattedDataRef = useRef('');

  // Search match counter effect - must be before conditional return
  useEffect(() => {
    const fd = formattedDataRef.current;
    if (!searchQuery.trim() || !fd) { setSearchMatchCount(0); return; }
    try {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = fd.match(new RegExp(escaped, 'gi'));
      setSearchMatchCount(matches ? matches.length : 0);
    } catch { setSearchMatchCount(0); }
  });

  if (loading && !response) {
    return (
      <div className="flex flex-col h-full w-full bg-[var(--background)] animate-pulse border-t border-[var(--border)]">
        {/* Skeleton Top Bar */}
        <div className="flex justify-between items-end px-3 pt-4 border-b border-[var(--border)]">
          <div className="flex gap-4">
            <div className="w-12 h-5 bg-[var(--border)]/70 rounded mb-2"></div>
            <div className="w-16 h-5 bg-[var(--border)]/70 rounded mb-2"></div>
            <div className="w-14 h-5 bg-[var(--border)]/40 rounded mb-2"></div>
          </div>
          <div className="flex gap-3 mb-2 px-2">
            <div className="w-24 h-4 bg-[var(--border)]/70 rounded"></div>
            <div className="w-16 h-4 bg-[var(--border)]/70 rounded"></div>
            <div className="w-10 h-4 bg-[var(--border)]/70 rounded"></div>
          </div>
        </div>
        
        {/* Skeleton Toolbar */}
        <div className="flex items-center gap-4 px-3 py-2 border-b border-[var(--border)]">
          <div className="w-20 h-6 bg-[var(--border)]/50 rounded"></div>
          <div className="w-20 h-6 bg-[var(--border)]/50 rounded"></div>
          <div className="ml-auto w-10 h-4 bg-[var(--border)]/50 rounded"></div>
        </div>
        
        {/* Skeleton Body Area */}
        <div className="flex-1 p-4 flex flex-col gap-4">
          <div className="w-full h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-11/12 h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-5/6 h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-full h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-3/4 h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-4/5 h-4 bg-[var(--border)]/30 rounded"></div>
          <div className="w-1/2 h-4 bg-[var(--border)]/30 rounded"></div>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] flex-col gap-4 text-center px-8 relative">
        <p>Enter a URL and send an HTTP request<br/>to view the response here.</p>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="flex-1 p-4 flex flex-col gap-2 text-red-400">
        <h3 className="font-bold text-sm text-red-500">Error Occurred</h3>
        <pre className="font-mono bg-[var(--card)] p-3 rounded text-xs overflow-x-auto border border-red-900/50">
          {response.error}
        </pre>
      </div>
    );
  }

  const { status, statusText, headers, data, timeMs, size } = response;
  
  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-green-500 status-glow-success";
    if (code >= 300 && code < 400) return "text-blue-500";
    if (code >= 400 && code < 500) return "text-orange-500 status-glow-warn";
    return "text-red-500 status-glow-error";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(2) + " KB";
  };

  const applyJsonFilter = (obj: any, query: string): any => {
    if (!query.trim() || !obj) return obj;
    const q = query.trim();

    // 1. Exact path extraction (e.g. "data.users" or "$.data")
    if (typeof obj === 'object') {
       try {
         const isPath = q.includes('.');
         if (isPath || q.startsWith('$') || obj[q] !== undefined) {
           const parts = q.replace(/^\$\.?/, '').split('.');
           let current = obj;
           let isValidPath = true;
           for (const p of parts) {
             if (!p) continue;
             if (current !== null && typeof current === 'object' && current[p] !== undefined) {
                current = current[p];
             } else {
                isValidPath = false;
                break;
             }
           }
           if (isValidPath) return current;
         }
       } catch(e) {}
    }

    // 2. Recursive fuzzy matching
    const searchStr = q.toLowerCase();
    const recursiveSearch = (target: any): any => {
      if (typeof target === 'string') return target.toLowerCase().includes(searchStr) ? target : undefined;
      if (typeof target === 'number' || typeof target === 'boolean') return String(target).toLowerCase().includes(searchStr) ? target : undefined;
      
      if (Array.isArray(target)) {
        const arr = target.map(item => recursiveSearch(item)).filter(item => item !== undefined);
        return arr.length > 0 ? arr : undefined;
      }
      
      if (typeof target === 'object' && target !== null) {
        const result: any = {};
        let hasMatch = false;
        for (const [key, val] of Object.entries(target)) {
          if (key.toLowerCase().includes(searchStr)) {
            result[key] = val; // keep whole subtree
            hasMatch = true;
          } else {
             const filteredVal = recursiveSearch(val);
             if (filteredVal !== undefined) {
               result[key] = filteredVal;
               hasMatch = true;
             }
          }
        }
        return hasMatch ? result : undefined;
      }
      return undefined;
    };

    const res = recursiveSearch(obj);
    return res !== undefined ? res : { _message: `No results found for filter: "${q}"` };
  };

  const filteredData = activeTab === 'Body' ? applyJsonFilter(data, filterQuery) : data;

  // If data is a string that looks like valid JSON, parse it for beautification
  let parsedData = filteredData;
  if (typeof filteredData === 'string' && filteredData.trim()) {
    const trimmed = filteredData.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsedData = JSON.parse(filteredData);
      } catch {}
    }
  }

  let effectiveType = responseType;
  if (effectiveType === 'Auto') {
    if (typeof parsedData === 'object' && parsedData !== null) {
      effectiveType = 'JSON';
    } else if (typeof filteredData === 'string' && filteredData.trim().startsWith('<')) {
      effectiveType = filteredData.toLowerCase().includes('<html') ? 'HTML' : 'XML';
    } else {
      effectiveType = 'Text';
    }
  }

  const getFormattedData = () => {
    if (parsedData === undefined || parsedData === null) return "";
    
    let rawStr = '';
    
    if ((effectiveType === 'XML' || effectiveType === 'HTML') && typeof parsedData === 'object') {
       // Convert JSON object to basic XML structure for display purposes
       const jsonToXml = (obj: any): string => {
         if (obj === null) return 'null';
         let xml = '';
         if (Array.isArray(obj)) {
           obj.forEach(item => { xml += '<item>\n' + jsonToXml(item) + '\n</item>\n'; });
         } else if (typeof obj === 'object') {
           for (const [key, val] of Object.entries(obj)) {
             const validKey = key.replace(/[^a-zA-Z0-9_-]/g, '') || 'element';
             xml += `<${validKey}>\n` + jsonToXml(val) + `\n</${validKey}>\n`;
           }
         } else {
           xml += String(obj);
         }
         return xml;
       };
       rawStr = `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${jsonToXml(parsedData)}\n</root>`;
    } else {
       rawStr = typeof parsedData === 'object' ? JSON.stringify(parsedData, null, 4) : String(parsedData);
    }
    
    if (effectiveType === 'Hex') {
      return Array.from(new TextEncoder().encode(rawStr)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    } else if (effectiveType === 'Base64') {
      try {
        return btoa(unescape(encodeURIComponent(rawStr)));
      } catch(e) {
        return "Error encoding Base64";
      }
    } else if (effectiveType === 'XML' || effectiveType === 'HTML') {
      // Basic pretty print to ensure minified XML/HTML isn't one giant line
      try {
        let formatted = '';
        let pad = 0;
        const step1 = rawStr.replace(/>\s*</g, '><').replace(/(>)(<)(\/*)/g, '$1\n$2$3');
        step1.split('\n').forEach((node) => {
          let indent = 0;
          if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
          } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) pad -= 1;
          } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
            indent = 1;
          } else {
            indent = 0;
          }
          formatted += '  '.repeat(Math.max(0, pad)) + node + '\n';
          pad += indent;
        });
        return formatted.trim() || rawStr;
      } catch(e) {
        return rawStr;
      }
    }
    return rawStr;
  }
  const formattedData = getFormattedData();
  formattedDataRef.current = formattedData;


  const handleCopy = () => {
    copyToClipboard(formattedData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveResponse = () => {
    if (!filteredData) {
      toast.error("No payload data to save");
      return;
    }
    try {
      const exportText = typeof filteredData === 'string' ? filteredData : JSON.stringify(filteredData, null, 2);
      const fileExtension = effectiveType === 'JSON' ? 'json' : effectiveType === 'HTML' ? 'html' : effectiveType === 'XML' ? 'xml' : 'txt';
      const fileMime = effectiveType === 'JSON' ? 'application/json' : effectiveType === 'HTML' ? 'text/html' : effectiveType === 'XML' ? 'application/xml' : 'text/plain';
      
      const blob = new Blob([exportText], { type: fileMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `response_export_${new Date().getTime()}.${fileExtension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Response saved as .${fileExtension}`);
    } catch(e) {
      toast.error("Failed to save response");
    }
  };

  const handleBookmarkResponse = () => {
    if (!data) { toast.error("No response to save"); return; }
    try {
      const saved = JSON.parse(localStorage.getItem("jetapi_saved_responses") || "[]");
      const entry = {
        id: Date.now().toString(),
        label: `${request?.method || 'GET'} ${request?.name || request?.url || 'Untitled'}`,
        timestamp: new Date().toISOString(),
        status,
        body: typeof data === 'string' ? data : JSON.stringify(data),
        headers,
        timeMs: timeMs || 0,
      };
      saved.unshift(entry);
      if (saved.length > 20) saved.length = 20; // Keep max 20
      localStorage.setItem("jetapi_saved_responses", JSON.stringify(saved));
      toast.success("Response saved for diff comparison");
    } catch { toast.error("Failed to bookmark response"); }
  };

  const handleExportContext = () => {
    if (!filteredData) {
      toast.error("No payload data to export");
      return;
    }
    
    try {
      if (request) {
        // Build contextual string export exactly matching user specification
        let exportStr = `Endpoint: "${request.url}"\n`;
        
        // Ensure Method starts with capital letter (e.g., Get method)
        const methodStr = request.method ? request.method.charAt(0).toUpperCase() + request.method.slice(1).toLowerCase() : 'Get';
        exportStr += `${methodStr} method\n\n`;
        
        // Setup Path Variables (Params)
        if (request.pathVariables && Object.keys(request.pathVariables).length > 0) {
           exportStr += `Params: ${JSON.stringify(request.pathVariables)}\n\n`;
        }

        // Setup Query Params safely mapping key-value arrays to objects
        if (request.params && request.params.length > 0) {
           const queryObj: any = {};
           request.params.filter((p: any) => p.key && p.enabled !== false).forEach((p: any) => {
             queryObj[p.key] = p.value;
           });
           
           if (Object.keys(queryObj).length > 0) {
             exportStr += `Query param: {\n`;
             for (const [k, v] of Object.entries(queryObj)) {
                exportStr += `${k}:${v}\n`;
             }
             exportStr += `}\n\n`;
           }
        }
        
        // Bind Body context payload if executed
        if (request.body && typeof request.body === 'string' && request.body.trim().length > 0 && request.body !== "{}") {
           exportStr += `Body: ${request.body}\n\n`;
        } else if (request.body && typeof request.body === 'object' && Object.keys(request.body).length > 0) {
           exportStr += `Body: ${JSON.stringify(request.body, null, 2)}\n\n`;
        }
        
        // Final Response Payload
        exportStr += `Response: \n`;
        exportStr += (typeof filteredData === 'string' ? filteredData : JSON.stringify(filteredData, null, 4));

        setExportModalContent(exportStr);
      } else {
        // Fallback backward compat JSON parsing for non-contextual renders
        const exportText = typeof filteredData === 'string' ? filteredData : JSON.stringify(filteredData, null, 2);
        setExportModalContent(exportText);
      }
    } catch (e) {
      toast.error("Failed to generate export view");
    }
  };

  const renderHighlightedData = (str: string, highlight: string) => {
    let htmlContent = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    if (effectiveType === 'JSON') {
      const htmlRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
      htmlContent = htmlContent.replace(htmlRegex, (match) => {
        let cls = 'json-bracket';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'json-key' : 'json-string';
        } else if (/true|false/.test(match)) {
          cls = 'json-bool';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        } else {
          cls = 'json-number';
        }
        return `<span class="${cls}">${match}</span>`;
      });
    } else if (effectiveType === 'JavaScript') {
      const jsRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|'(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\'])*'|\b(function|return|var|let|const|if|else|for|while|break|switch|case|default|class|extends|new|this|super|import|export|from|try|catch|finally|throw|typeof|instanceof|void|delete|in|async|await|yield)\b|\b(true|false|null|undefined)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\())/g;
      htmlContent = htmlContent.replace(jsRegex, (match, _, __, ___, keyword, boolean, funcName) => {
        let cls = 'json-bracket';
        if (/^['"]/.test(match)) {
           cls = 'json-string';
        } else if (keyword) {
           cls = 'json-null';
        } else if (boolean) {
           cls = 'json-bool';
        } else if (funcName) {
           cls = 'json-key';
        } else if (/^[-\d]/.test(match)) {
           cls = 'json-number';
        }
        return `<span class="${cls}">${match}</span>`;
      });
    } else if (effectiveType === 'XML' || effectiveType === 'HTML') {
      htmlContent = htmlContent.replace(/(\&lt;!--[\s\S]*?--\&gt;)/g, '<span class="json-string">$1</span>');
      htmlContent = htmlContent.replace(/(\&lt;[\/?!?]+[a-zA-Z0-9:-]+)/gi, '<span class="json-key">$1</span>');
      htmlContent = htmlContent.replace(/(\&lt;[a-zA-Z0-9:-]+)/gi, '<span class="json-key">$1</span>');
      htmlContent = htmlContent.replace(/([\/?!?]*\&gt;)/gi, '<span class="json-key">$1</span>');
      htmlContent = htmlContent.replace(/([a-zA-Z0-9:-]+)=(\&quot;.*?\&quot;|'.*?')/gi, '<span class="json-null">$1</span>=<span class="json-string">$2</span>');
    }

    if (highlight.trim()) {
      const escapedQuery = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedQuery})(?![^<]*>)`, "gi");
      htmlContent = htmlContent.replace(regex, `<mark class="bg-amber-400 text-black rounded px-0.5 font-bold shadow-sm shadow-amber-400/50">$&</mark>`);
    }

    const numberedHtml = htmlContent.split('\n').map((line, i) => {
      return `<div class="flex resp-line-hover"><span class="w-10 shrink-0 text-right pr-3 resp-line-num select-none border-r resp-line-border mr-4">${i + 1}</span><span class="flex-1 whitespace-pre-wrap break-words">${line || ' '}</span></div>`;
    }).join('');

    return <div dangerouslySetInnerHTML={{ __html: numberedHtml }} />;
  };

  const headerKeys = Object.keys(headers || {});
  
  return (
    <div className="flex flex-col h-full w-full relative">
      {loading && (
         <div className="absolute top-2 right-4 z-[100] flex items-center bg-[var(--color-brand-500)] text-white px-3 py-1.5 rounded shadow-lg shadow-[var(--color-brand-500)]/20 anim-slide-down">
           <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
           <span className="text-[10px] font-bold uppercase tracking-wider loading-dots">Sending</span>
         </div>
      )}
      <div className={`flex flex-col h-full bg-[var(--background)] border-[var(--border)] transition-opacity duration-300 ${loading ? 'opacity-30 pointer-events-none' : 'opacity-100 response-flash'}`}>
      {/* 1. Unified Top Bar: Tabs + Metrics */}
      <div className="flex justify-between items-end px-3 pt-2 border-b border-[var(--border)] select-none">
        
        {/* Left Tabs */}
        <div className="flex items-center gap-5 text-xs font-medium text-[var(--muted)]">
          <button 
            onClick={() => setActiveTab("Body")}
            className={`pb-2 border-b-2 transition-colors ${activeTab === 'Body' ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent hover:text-[var(--foreground)]'}`}
          >
            Body
          </button>
          <button 
            className="pb-2 border-b-2 border-transparent hover:text-[var(--foreground)] transition-colors opacity-70"
          >
            Cookies
          </button>
          <button 
            onClick={() => setActiveTab("Headers")}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'Headers' ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent hover:text-[var(--foreground)]'}`}
          >
            Headers <span className="text-[10px] text-green-500 font-bold">({headerKeys.length})</span>
          </button>
          <button 
            onClick={() => setActiveTab("TestResults")}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'TestResults' ? 'border-[var(--color-brand-500)] text-[var(--foreground)]' : 'border-transparent hover:text-[var(--foreground)]'}`}
          >
            Test Results
            {testResults.length > 0 && (
              <span className={`text-[10px] font-bold ${testResults.every(t => t.passed) ? 'text-green-500' : 'text-red-500'}`}>
                ({testResults.filter(t => t.passed).length}/{testResults.length})
              </span>
            )}
          </button>
          <button className="pb-2 border-b-2 border-transparent hover:text-[var(--foreground)] transition-colors text-[var(--muted)] mb-[2px]">
            <History className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Metrics & Actions (Only show if we have a real response) */}
        {status && (
          <div className="flex items-center gap-4 text-xs pb-1.5">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${getStatusColor(status)}`}>{status} {statusText}</span>
              <span className="text-[var(--muted)] opacity-50">•</span>
              <span className="text-[var(--muted)]">{timeMs} ms</span>
              <span className="text-[var(--muted)] opacity-50">•</span>
              <span className="text-[var(--muted)]">{formatSize(size || 0)}</span>
            </div>
            
            <div className="flex items-center gap-3 text-[var(--muted)] pl-2 border-l border-[var(--border)]">
               <Globe className="w-3.5 h-3.5" />
               <button onClick={handleExportContext} className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors">
                 <Copy className="w-3.5 h-3.5" />
                 Context Log
               </button>
               <button onClick={handleSaveResponse} className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors">
                 <Download className="w-3.5 h-3.5" />
                 Save Response
               </button>
               <button onClick={handleBookmarkResponse} className="flex items-center gap-1.5 hover:text-[var(--color-brand-500)] transition-colors" title="Save for diff comparison">
                 <Bookmark className="w-3.5 h-3.5" />
               </button>
               <MoreHorizontal className="w-4 h-4 cursor-pointer hover:text-[var(--foreground)]" />
            </div>
          </div>
        )}
      </div>

      {/* Timing Waterfall */}
      {status && timeMs > 0 && (
        <div className="px-3 py-1 border-b border-[var(--border)] bg-[var(--sidebar)]/30">
          {(() => {
            const t = response.timing || null;
            const phases = t ? [
              { label: "DNS", ms: t.dnsMs || 0, color: "bg-cyan-500" },
              { label: "TCP", ms: t.tcpMs || 0, color: "bg-blue-500" },
              { label: "TLS", ms: t.tlsMs || 0, color: "bg-purple-500" },
              { label: "TTFB", ms: t.ttfbMs || 0, color: "bg-amber-500" },
              { label: "Download", ms: t.downloadMs || 0, color: "bg-green-500" },
            ] : [
              { label: "DNS", ms: Math.round(timeMs * 0.05), color: "bg-cyan-500" },
              { label: "TCP", ms: Math.round(timeMs * 0.10), color: "bg-blue-500" },
              { label: "TLS", ms: Math.round(timeMs * 0.10), color: "bg-purple-500" },
              { label: "TTFB", ms: Math.round(timeMs * 0.50), color: "bg-amber-500" },
              { label: "Download", ms: Math.round(timeMs * 0.25), color: "bg-green-500" },
            ];
            const totalPhaseMs = phases.reduce((s, p) => s + p.ms, 0) || 1;
            return (
              <div className="flex items-center gap-2.5">
                <div className="flex h-[3px] flex-1 min-w-[80px] max-w-[120px] rounded-full overflow-hidden bg-[var(--border)] waterfall-bar shrink-0">
                  {phases.map(p => (
                    <div
                      key={p.label}
                      className={p.color}
                      style={{ width: `${Math.max((p.ms / totalPhaseMs) * 100, p.ms > 0 ? 2 : 0)}%` }}
                      title={`${p.label}: ${p.ms}ms`}
                    />
                  ))}
                </div>
                {phases.map(p => (
                  <span key={p.label} className="flex items-center gap-1 text-[10px] text-[var(--muted)] shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                    <span className="font-medium text-[var(--foreground)] opacity-60">{p.label}</span>
                    <span>{p.ms}ms</span>
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* 2. Secondary Toolbar for Body Tab */}
      {activeTab === 'Body' && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] text-xs text-[var(--muted)] bg-[var(--background)] select-none">
          {/* Format / View Toggles */}
          <div className="flex items-center gap-4">
             <div className="relative flex items-center">
               <StyledSelect
                 icon={<span className="text-[10px] font-mono font-bold text-[var(--color-brand-500)]">{'{}'}</span>}
                 options={[
                   { value: 'Auto', label: 'Auto' },
                   { value: 'JSON', label: 'JSON' },
                   { value: 'XML', label: 'XML' },
                   { value: 'HTML', label: 'HTML' },
                   { value: 'JavaScript', label: 'JavaScript' },
                   { value: 'Text', label: 'Raw/Text' },
                   { value: 'Hex', label: 'Hex' },
                   { value: 'Base64', label: 'Base64' },
                 ]}
                 value={responseType}
                 onChange={(val) => setResponseType(val as any)}
                 size="xs"
                 showCheckmark={false}
               />
             </div>
             
             {effectiveType === 'JSON' && (
               <>
                 <button 
                   onClick={() => { 
                     const lines = JSON.stringify(parsedData, null, 4).split('\n');
                     const regions = buildFoldRegions(lines);
                     setCollapsedLines(collectAllFoldLines(regions)); 
                   }}
                   className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                   title="Collapse All"
                 >
                   <ChevronsDownUp className="w-3.5 h-3.5" /> Collapse
                 </button>
                 <button 
                   onClick={() => setCollapsedLines(new Set())}
                   className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                   title="Expand All"
                 >
                   <ChevronsUpDown className="w-3.5 h-3.5" /> Expand
                 </button>
               </>
             )}
             <button className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors">
               <Eye className="w-3.5 h-3.5" /> Preview
             </button>
             <button className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors">
               <PlaySquare className="w-3.5 h-3.5" /> Visualize
               <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
             </button>
          </div>

          {/* Right Utilities */}
          <div className="flex items-center gap-3">
            <button className="hover:text-[var(--foreground)]" title="Wrap lines"><AlignLeft className="w-3.5 h-3.5" /></button>
            
            {/* Filter Input */}
            <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded px-2 focus-within:border-[var(--color-brand-500)] transition-colors" title="Filter Response API Data (JSONPath or Keys)">
              <Filter className="w-3 h-3 opacity-70" />
              <input 
                type="text" 
                placeholder="Filter..."
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-20 px-2 py-1 text-xs text-[var(--foreground)]"
              />
            </div>

            {/* Search Input */}
            <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded px-2 focus-within:border-[var(--color-brand-500)] transition-colors" title="Search text in response">
              <Search className="w-3 h-3 opacity-70" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Search... (⌘F)" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-24 px-2 py-1 text-xs text-[var(--foreground)]"
              />
              {searchQuery.trim() && (
                <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1.5 ml-1">
                  <span className="text-[10px] text-[var(--muted)] whitespace-nowrap tabular-nums">
                    {searchMatchCount > 0 ? `${currentMatchIndex + 1}/${searchMatchCount}` : '0/0'}
                  </span>
                  <button 
                    onClick={() => setCurrentMatchIndex(prev => prev > 0 ? prev - 1 : Math.max(searchMatchCount - 1, 0))}
                    className="p-0.5 hover:text-[var(--foreground)] text-[var(--muted)] transition-colors disabled:opacity-30"
                    disabled={searchMatchCount === 0}
                    title="Previous match"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => setCurrentMatchIndex(prev => prev < searchMatchCount - 1 ? prev + 1 : 0)}
                    className="p-0.5 hover:text-[var(--foreground)] text-[var(--muted)] transition-colors disabled:opacity-30"
                    disabled={searchMatchCount === 0}
                    title="Next match"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            
            <button onClick={handleCopy} className="hover:text-[var(--foreground)] transition-colors" title="Copy response">
               {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button className="hover:text-[var(--foreground)]" title="Copy link"><Link2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      {/* 3. Response Panel Display */}
      {activeTab === 'Body' ? (
        <div className="flex-1 relative overflow-hidden">
          <div className="h-full overflow-auto bg-[#1e1e1e] py-3 font-mono text-[#d4d4d4] selection:bg-[var(--color-brand-500)]/30 font-medium" ref={bodyScrollRef} style={{ fontSize: '13.5px', lineHeight: '1.5' }}>
            <div className="text-[#d4d4d4]" ref={responseHtmlRef}>
              {effectiveType === 'JSON' && typeof parsedData === 'object' && parsedData !== null && !searchQuery.trim() ? (() => {
                const jsonStr = JSON.stringify(parsedData, null, 4);
                const lines = jsonStr.split('\n');
                const foldRegions = buildFoldRegions(lines);
                const visibleLines = getVisibleLines(lines, foldRegions, collapsedLines);

                return visibleLines.map((line, displayIdx) => (
                  <div key={`${line.originalIndex}-${displayIdx}`} className="flex resp-line-hover px-2">
                    <span className="w-12 shrink-0 text-right pr-3 resp-line-num select-none border-r resp-line-border mr-3 inline-block" style={{ fontSize: '11px' }}>{displayIdx + 1}</span>
                    {line.isFoldable ? (
                      <span className="flex items-center flex-1 whitespace-pre-wrap break-words">
                        <button 
                          onClick={() => toggleLine(line.originalIndex)} 
                          className="text-[var(--muted)] hover:text-[var(--foreground)] mr-1 shrink-0 transition-colors flex items-center justify-center"
                          style={{ width: '16px', height: '16px' }}
                        >
                          {line.isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <span dangerouslySetInnerHTML={{ __html: highlightJsonLine(line.content) }} />
                        {line.isCollapsed && (
                          <span 
                            className="text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] px-1.5 text-[10px] bg-[var(--border)] rounded mx-1"
                            onClick={() => toggleLine(line.originalIndex)}
                          >
                            {line.collapsedCount} lines
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex-1 whitespace-pre-wrap break-words pl-5" dangerouslySetInnerHTML={{ __html: highlightJsonLine(line.content) }} />
                    )}
                  </div>
                ));
              })() : (
                renderHighlightedData(formattedData, searchQuery)
              )}
            </div>
          </div>
          {/* Search match minimap on scrollbar */}
          {searchQuery.trim() && searchMatchCount > 0 && (
            <SearchMinimap containerRef={bodyScrollRef} contentRef={responseHtmlRef} searchQuery={searchQuery} />
          )}
        </div>
      ) : activeTab === 'TestResults' ? (
        <div className="flex-1 overflow-auto bg-[var(--background)] p-4 selection:bg-[var(--color-brand-500)]/30">
          {testResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--muted)] gap-3">
              <FlaskConical className="w-10 h-10 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium mb-1">No test results</p>
                <p className="text-xs opacity-70">Write tests in the Tests tab of the request panel, then send a request.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* Summary bar */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--sidebar)] border border-[var(--border)] mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-semibold text-green-500">{testResults.filter(t => t.passed).length} Passed</span>
                </div>
                {testResults.some(t => !t.passed) && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="font-semibold text-red-500">{testResults.filter(t => !t.passed).length} Failed</span>
                  </div>
                )}
                <span className="text-[10px] text-[var(--muted)] ml-auto">{testResults.length} total</span>
              </div>

              {/* Individual results */}
              {testResults.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                    t.passed
                      ? 'border-green-500/20 bg-green-500/5 hover:bg-green-500/10'
                      : 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10'
                  }`}
                >
                  {t.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${t.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {t.name}
                    </p>
                    {t.error && (
                      <p className="text-[11px] text-red-400/80 mt-1 font-mono bg-red-500/10 px-2 py-1 rounded">
                        {t.error}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${t.passed ? 'text-green-500' : 'text-red-500'}`}>
                    {t.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[var(--background)] p-3 selection:bg-[var(--color-brand-500)]/30">
          <table className="w-full text-xs text-left border-collapse bg-[var(--card)] rounded overflow-hidden">
            <tbody>
              {Object.entries(headers || {}).map(([key, val]: any, i: number) => (
                <tr key={i} className="border-b border-[var(--border)] text-[var(--muted)] hover:bg-[var(--sidebar)] transition-colors">
                  <td className="py-2 px-3 w-[40%] font-semibold truncate border-r border-[var(--border)]">{key}</td>
                  <td className="py-2 px-3 w-[60%] font-mono break-all">{val}</td>
                </tr>
              ))}
              {Object.keys(headers || {}).length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-[var(--muted)]">No headers provided in this response.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Export Modal Overlay */}
      {exportModalContent !== null && (
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4 custom-scrollbar modal-backdrop">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh] modal-content">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm">Export Payload</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => { copyToClipboard(exportModalContent); toast.success("Copied to clipboard!"); }}
                  className="px-3 py-1.5 bg-[var(--sidebar)] hover:bg-[var(--border)] border border-[var(--border)] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <button 
                  onClick={() => setExportModalContent(null)}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded text-xs font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[var(--sidebar)] p-4 custom-scrollbar">
              <pre className="font-mono text-xs text-[var(--foreground)] whitespace-pre-wrap word-break">
                {exportModalContent}
              </pre>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
