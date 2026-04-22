import { useState, useRef, useEffect } from "react";
import { Search, Copy, Check, Globe, MoreHorizontal, AlignLeft, Filter, Link2, Download, History, Code2, PlaySquare, Eye } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";

export default function ResponsePanel({ response, loading, request }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"Body" | "Headers">("Body");
  const [responseType, setResponseType] = useState<"Auto" | "JSON" | "XML" | "HTML" | "JavaScript" | "Text" | "Hex" | "Base64">("Auto");
  const [exportModalContent, setExportModalContent] = useState<string | null>(null);
  const responseHtmlRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to first highlighted search result
  useEffect(() => {
     if (searchQuery.trim() && responseHtmlRef.current) {
        const firstMark = responseHtmlRef.current.querySelector('mark');
        if (firstMark) {
           firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
     }
  }, [searchQuery, response]);



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
    if (code >= 200 && code < 300) return "text-green-500";
    if (code >= 300 && code < 400) return "text-blue-500";
    if (code >= 400 && code < 500) return "text-orange-500";
    return "text-red-500";
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
  
  let effectiveType = responseType;
  if (effectiveType === 'Auto') {
    effectiveType = typeof filteredData === 'object' ? 'JSON' : 'Text';
    if (typeof filteredData === 'string' && filteredData.trim().startsWith('<')) {
      effectiveType = filteredData.toLowerCase().includes('<html') ? 'HTML' : 'XML';
    }
  }

  const getFormattedData = () => {
    if (filteredData === undefined || filteredData === null) return "";
    
    let rawStr = '';
    
    if ((effectiveType === 'XML' || effectiveType === 'HTML') && typeof filteredData === 'object') {
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
       rawStr = `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${jsonToXml(filteredData)}\n</root>`;
    } else {
       rawStr = typeof filteredData === 'object' ? JSON.stringify(filteredData, null, 2) : String(filteredData);
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
      // JSON syntax highlighter
      const htmlRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
      htmlContent = htmlContent.replace(htmlRegex, (match) => {
        let cls = 'text-[#d4d4d4]';
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
    } else if (effectiveType === 'JavaScript') {
      // JavaScript syntax highlighter
      const jsRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|'(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\'])*'|\b(function|return|var|let|const|if|else|for|while|break|switch|case|default|class|extends|new|this|super|import|export|from|try|catch|finally|throw|typeof|instanceof|void|delete|in|async|await|yield)\b|\b(true|false|null|undefined)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\())/g;
      htmlContent = htmlContent.replace(jsRegex, (match, _, __, ___, keyword, boolean, funcName) => {
        let cls = 'text-[#d4d4d4]';
        if (/^['"]/.test(match)) {
           cls = 'text-[#D69D85]'; // String
        } else if (keyword) {
           cls = 'text-[#C586C0]'; // Keyword purple
        } else if (boolean) {
           cls = 'text-[#569CD6] font-semibold'; // Boolean blue
        } else if (funcName) {
           cls = 'text-[#DCDCAA]'; // Function yellow
        } else if (/^[-\d]/.test(match)) {
           cls = 'text-[#B5CEA8]'; // Number green
        }
        return `<span class="${cls}">${match}</span>`;
      });
    } else if (effectiveType === 'XML' || effectiveType === 'HTML') {
      // XML/HTML syntax highlighter
      // Colors: Tags (Dark blue/cyan), Attributes (Light blue), Strings (Orange), Comments (Green)
      htmlContent = htmlContent.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-[#6A9955]">$1</span>'); // Comments
      htmlContent = htmlContent.replace(/(&lt;[\/?!?]+[a-zA-Z0-9:-]+)/gi, '<span class="text-[#569CD6]">$1</span>'); // Start of tag with ? or !
      htmlContent = htmlContent.replace(/(&lt;[a-zA-Z0-9:-]+)/gi, '<span class="text-[#569CD6]">$1</span>'); // Normal start tag
      htmlContent = htmlContent.replace(/([\/?!?]*&gt;)/gi, '<span class="text-[#569CD6]">$1</span>'); // End of tag
      htmlContent = htmlContent.replace(/([a-zA-Z0-9:-]+)=(&quot;.*?&quot;|'.*?')/gi, '<span class="text-[#9CDCFE]">$1</span>=<span class="text-[#D69D85]">$2</span>'); // Attributes
    }

    if (highlight.trim()) {
      // Escape for regex, but we must protect HTML tags from being matched if the user searches for e.g., "span"
      const escapedQuery = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Negative lookahead to avoid matching inside <...> tags
      const regex = new RegExp(`(${escapedQuery})(?![^<]*>)`, "gi");
      htmlContent = htmlContent.replace(regex, `<mark class="bg-[#ffb000] text-black rounded px-0.5 font-bold shadow-sm shadow-[#ffb000]/50">$&</mark>`);
    }

    const numberedHtml = htmlContent.split('\n').map((line, i) => {
      return `<div class="flex hover:bg-[#2a2a2a]"><span class="w-10 shrink-0 text-right pr-3 text-[#6e7681] select-none border-r border-[#333] mr-4">${i + 1}</span><span class="flex-1 whitespace-pre-wrap break-words">${line || ' '}</span></div>`;
    }).join('');

    return <div dangerouslySetInnerHTML={{ __html: numberedHtml }} />;
  };

  const headerKeys = Object.keys(headers || {});
  
  return (
    <div className="flex flex-col h-full w-full relative">
      {loading && (
         <div className="absolute top-2 right-4 z-[100] flex items-center bg-[var(--color-brand-500)] text-white px-3 py-1.5 rounded shadow-lg shadow-[var(--color-brand-500)]/20 animate-in fade-in slide-in-from-top-2">
           <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
           <span className="text-[10px] font-bold uppercase tracking-wider">Sending</span>
         </div>
      )}
      <div className={`flex flex-col h-full bg-[var(--background)] border-[var(--border)] transition-opacity duration-300 ${loading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
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
            className="pb-2 border-b-2 border-transparent hover:text-[var(--foreground)] transition-colors opacity-70"
          >
            Test Results
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
               <MoreHorizontal className="w-4 h-4 cursor-pointer hover:text-[var(--foreground)]" />
            </div>
          </div>
        )}
      </div>

      {/* 2. Secondary Toolbar for Body Tab */}
      {activeTab === 'Body' && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] text-xs text-[var(--muted)] bg-[var(--background)] select-none">
          {/* Format / View Toggles */}
          <div className="flex items-center gap-4">
             <div className="relative flex items-center bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] hover:border-[var(--color-brand-500)] transition-colors">
               <dl className="absolute left-2 pointer-events-none text-xs font-mono font-bold text-[var(--color-brand-500)] pr-1">{'{}'}</dl>
               <select 
                  value={responseType}
                  onChange={(e) => setResponseType(e.target.value as any)}
                  className="appearance-none bg-transparent border-none outline-none pl-8 pr-6 py-1 text-xs cursor-pointer focus:ring-0"
               >
                  <option value="Auto">Auto</option>
                  <option value="JSON">JSON</option>
                  <option value="XML">XML</option>
                  <option value="HTML">HTML</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="Text">Raw/Text</option>
                  <option value="Hex">Hex</option>
                  <option value="Base64">Base64</option>
               </select>
               <svg className="w-3 h-3 opacity-70 absolute right-2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
             </div>
             
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
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-24 px-2 py-1 text-xs text-[var(--foreground)]"
              />
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
        <div className="flex-1 overflow-auto bg-[#1a1a1a] py-3 text-xs font-mono text-[var(--foreground)] selection:bg-[var(--color-brand-500)]/30">
          <div className="text-[#d4d4d4]" ref={responseHtmlRef}>
            {renderHighlightedData(formattedData, searchQuery)}
          </div>
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
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4 custom-scrollbar">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm">Export Payload</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => { copyToClipboard(exportModalContent); toast.success("Copied to clipboard!"); }}
                  className="px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-[var(--border)] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
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
            <div className="flex-1 overflow-auto bg-[#1e1e1e] p-4 custom-scrollbar">
              <pre className="font-mono text-xs text-[#d4d4d4] whitespace-pre-wrap word-break">
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
