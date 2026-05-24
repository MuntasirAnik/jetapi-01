"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Loader2, RefreshCw, ChevronRight, ChevronDown, Search, Wand2, Copy, Check, Play, BookOpen, Code2, Variable, Braces, X } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";

// Standard GraphQL introspection query
const INTROSPECTION_QUERY = `{
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name kind description
      fields {
        name description
        type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
        args { name description type { name kind ofType { name kind ofType { name kind } } } }
      }
      inputFields { name description type { name kind ofType { name kind ofType { name kind } } } }
      enumValues { name description }
    }
  }
}`;

interface GQLType { name: string; kind: string; description?: string; fields?: any[]; inputFields?: any[]; enumValues?: any[]; }

function resolveTypeName(t: any): string {
  if (!t) return "Unknown";
  if (t.name) return t.name;
  if (t.kind === "NON_NULL") return resolveTypeName(t.ofType) + "!";
  if (t.kind === "LIST") return "[" + resolveTypeName(t.ofType) + "]";
  return "Unknown";
}

function getTypeColor(kind: string) {
  switch (kind) {
    case "OBJECT": return "text-blue-400";
    case "INPUT_OBJECT": return "text-purple-400";
    case "ENUM": return "text-yellow-400";
    case "SCALAR": return "text-green-400";
    case "INTERFACE": return "text-cyan-400";
    case "UNION": return "text-orange-400";
    default: return "text-[var(--muted)]";
  }
}

// Syntax highlight GraphQL query
function highlightGQL(code: string): string {
  let html = code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  // Keywords
  html = html.replace(/\b(query|mutation|subscription|fragment|on|type|input|enum|interface|union|scalar|extend|schema|directive)\b/g, '<span class="text-[#C586C0]">$1</span>');
  // Booleans/null
  html = html.replace(/\b(true|false|null)\b/g, '<span class="text-[#569CD6]">$1</span>');
  // Numbers
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-[#B5CEA8]">$1</span>');
  // Strings
  html = html.replace(/"([^"\\]|\\.)*"/g, '<span class="text-[#D69D85]">$&</span>');
  // Variables
  html = html.replace(/(\$\w+)/g, '<span class="text-[#9CDCFE]">$1</span>');
  // Directives
  html = html.replace(/(@\w+)/g, '<span class="text-[#DCDCAA]">$1</span>');
  // Comments
  html = html.replace(/(#.*)/gm, '<span class="text-[#6A9955]">$1</span>');
  return html;
}

function prettifyGQL(query: string): string {
  let indent = 0;
  const lines: string[] = [];
  const tokens = query.replace(/\s+/g, " ").replace(/\{/g, " {\n").replace(/\}/g, "\n}\n").replace(/,/g, "\n").split("\n");
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    if (t === "}") indent = Math.max(0, indent - 1);
    lines.push("  ".repeat(indent) + t);
    if (t.endsWith("{")) indent++;
  }
  return lines.join("\n");
}

// Schema Explorer sidebar
function SchemaExplorer({ schema, search, onInsertField }: { schema: GQLType[]; search: string; onInsertField: (f: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const userTypes = useMemo(() => {
    const q = search.toLowerCase();
    return schema.filter(t => !t.name.startsWith("__") && (t.kind === "OBJECT" || t.kind === "INPUT_OBJECT" || t.kind === "ENUM"))
      .filter(t => !q || t.name.toLowerCase().includes(q) || t.fields?.some(f => f.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schema, search]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar text-xs">
      {userTypes.length === 0 && <div className="p-4 text-center text-[var(--muted)] opacity-60">No types found</div>}
      {userTypes.map(t => (
        <div key={t.name}>
          <button
            onClick={() => setExpanded(p => ({ ...p, [t.name]: !p[t.name] }))}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 hover:bg-[var(--card)] transition-colors text-left"
          >
            {expanded[t.name] ? <ChevronDown className="w-3 h-3 shrink-0 opacity-50" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
            <span className={`font-semibold ${getTypeColor(t.kind)}`}>{t.name}</span>
            <span className="ml-auto text-[9px] text-[var(--muted)] opacity-50 uppercase">{t.kind}</span>
          </button>
          {expanded[t.name] && (
            <div className="ml-5 border-l border-[var(--border)] pl-2 mb-1">
              {t.kind === "ENUM" && t.enumValues?.map((ev: any) => (
                <div key={ev.name} className="px-2 py-0.5 text-yellow-300 font-mono text-[11px]">{ev.name}</div>
              ))}
              {(t.fields || t.inputFields || []).map((f: any) => (
                <button
                  key={f.name}
                  onClick={() => onInsertField(f.name)}
                  className="flex items-center gap-2 w-full px-2 py-1 hover:bg-[var(--color-brand-500)]/10 rounded transition-colors text-left group"
                  title={f.description || f.name}
                >
                  <span className="text-[var(--foreground)] font-mono">{f.name}</span>
                  <span className="ml-auto text-[10px] text-[var(--muted)] truncate max-w-[100px]">{resolveTypeName(f.type)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function GraphQLEditor({
  query, variables, onQueryChange, onVariablesChange, requestUrl, envVariables = []
}: {
  query: string; variables: string;
  onQueryChange: (q: string) => void; onVariablesChange: (v: string) => void;
  requestUrl: string; envVariables?: any[];
}) {
  const [schema, setSchema] = useState<GQLType[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [showSchema, setShowSchema] = useState(false);
  const [activePane, setActivePane] = useState<"query" | "variables">("query");
  const [suggestions, setSuggestions] = useState<{ name: string; type: string; desc?: string }[]>([]);
  const [suggestPos, setSuggestPos] = useState<{ top: number; left: number } | null>(null);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [varsError, setVarsError] = useState<string | null>(null);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Validate variables JSON
  useEffect(() => {
    if (!variables.trim()) { setVarsError(null); return; }
    try { JSON.parse(variables); setVarsError(null); } catch (e: any) { setVarsError(e.message); }
  }, [variables]);

  // Resolve env variables in URL
  const resolvedUrl = useMemo(() => {
    let url = requestUrl || "";
    const matches = url.match(/\{\{([^}]+)\}\}/g);
    if (matches) {
      matches.forEach((m: string) => {
        const key = m.slice(2, -2);
        const ev = envVariables.find((v: any) => v.key === key);
        if (ev) url = url.replace(m, ev.currentValue || ev.value || ev.initialValue || "");
      });
    }
    return url;
  }, [requestUrl, envVariables]);

  // Introspect schema
  const introspect = useCallback(async () => {
    if (!resolvedUrl) { toast.error("Set a GraphQL endpoint URL first"); return; }
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(resolvedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || "Introspection failed");
      const types = json.data?.__schema?.types || [];
      setSchema(types);
      setShowSchema(true);
      toast.success(`Schema loaded — ${types.filter((t: any) => !t.name.startsWith("__")).length} types`);
    } catch (e: any) {
      setSchemaError(e.message);
      toast.error("Introspection failed: " + e.message);
    } finally {
      setSchemaLoading(false);
    }
  }, [resolvedUrl]);

  // Build field suggestions from schema for current context
  const getSuggestions = useCallback((text: string, cursorPos: number) => {
    if (schema.length === 0) return [];
    // Find the innermost type context by counting braces before cursor
    const before = text.slice(0, cursorPos);
    const typeStack: string[] = [];
    const queryType = schema.find(t => t.kind === "OBJECT" && (t.name === "Query" || t.name === "RootQuery"));
    const mutationType = schema.find(t => t.kind === "OBJECT" && (t.name === "Mutation" || t.name === "RootMutation"));

    // Simple brace-based context tracking
    let depth = 0;
    const fieldStack: string[] = [];
    const tokens = before.split(/([{}])/);
    for (const tok of tokens) {
      if (tok === "{") {
        depth++;
        // Find the last word before this brace
        const lastField = fieldStack[fieldStack.length - 1];
        if (lastField) fieldStack.push(lastField);
      } else if (tok === "}") {
        depth = Math.max(0, depth - 1);
        fieldStack.pop();
      } else {
        const words = tok.trim().split(/\s+/).filter(Boolean);
        const lastWord = words[words.length - 1]?.replace(/\(.*\)/, "");
        if (lastWord && !["query", "mutation", "subscription", "fragment", "on", "{", "}"].includes(lastWord)) {
          if (fieldStack.length <= depth) fieldStack.push(lastWord);
          else fieldStack[fieldStack.length - 1] = lastWord;
        }
      }
    }

    // Determine current type
    let currentType: GQLType | undefined = queryType;
    if (before.match(/^\s*mutation\b/)) currentType = mutationType;

    for (let i = 1; i < fieldStack.length && currentType; i++) {
      const fieldName = fieldStack[i];
      const field = currentType.fields?.find(f => f.name === fieldName);
      if (field) {
        const typeName = resolveTypeName(field.type).replace(/[!\[\]]/g, "");
        currentType = schema.find(t => t.name === typeName);
      }
    }

    if (!currentType?.fields) return [];
    return currentType.fields.map((f: any) => ({
      name: f.name,
      type: resolveTypeName(f.type),
      desc: f.description,
    }));
  }, [schema]);

  // Handle Ctrl+Space for autocomplete
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === " " && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const ta = queryRef.current;
      if (!ta) return;
      const items = getSuggestions(query, ta.selectionStart);
      if (items.length > 0) {
        setSuggestions(items);
        setSuggestIdx(0);
        // Position near cursor
        const rect = ta.getBoundingClientRect();
        setSuggestPos({ top: rect.top + 80, left: rect.left + 40 });
      }
      return;
    }
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx(i => Math.min(i + 1, suggestions.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSuggestion(suggestions[suggestIdx].name);
      }
      else if (e.key === "Escape") { setSuggestions([]); }
    }
  };

  const insertSuggestion = (name: string) => {
    const ta = queryRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    // Find start of current word
    let wordStart = pos;
    while (wordStart > 0 && /\w/.test(query[wordStart - 1])) wordStart--;
    const newQuery = query.slice(0, wordStart) + name + query.slice(pos);
    onQueryChange(newQuery);
    setSuggestions([]);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = wordStart + name.length; ta.focus(); }, 0);
  };

  const handleCopy = () => { copyToClipboard(query); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handlePrettify = () => {
    try { onQueryChange(prettifyGQL(query)); toast.success("Query formatted"); } catch { toast.error("Could not format query"); }
  };

  const insertField = (name: string) => {
    const ta = queryRef.current;
    if (!ta) { onQueryChange(query + "\n  " + name); return; }
    const pos = ta.selectionStart;
    const newQ = query.slice(0, pos) + name + " " + query.slice(pos);
    onQueryChange(newQ);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + name.length + 1; ta.focus(); }, 0);
  };

  // Sync scroll between textarea and overlay
  const syncScroll = () => {
    if (queryRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = queryRef.current.scrollTop;
      overlayRef.current.scrollLeft = queryRef.current.scrollLeft;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--background)]">
      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--sidebar)]/50 shrink-0">
          <div className="flex items-center bg-[var(--background)] border border-[var(--border)] rounded overflow-hidden text-[11px] font-medium">
            <button onClick={() => setActivePane("query")}
              className={`px-3 py-1 flex items-center gap-1.5 transition-colors ${activePane === "query" ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
              <Code2 className="w-3 h-3" /> Query
            </button>
            <button onClick={() => setActivePane("variables")}
              className={`px-3 py-1 flex items-center gap-1.5 transition-colors border-l border-[var(--border)] ${activePane === "variables" ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
              <Braces className="w-3 h-3" /> Variables
              {varsError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={handlePrettify} className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--color-brand-500)] px-2 py-1 rounded hover:bg-[var(--card)] transition-colors" title="Prettify">
              <Wand2 className="w-3 h-3" /> Prettify
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 rounded hover:bg-[var(--card)] transition-colors" title="Copy">
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
            <div className="w-px h-4 bg-[var(--border)] mx-1" />
            <button
              onClick={introspect}
              disabled={schemaLoading}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/10 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              title="Fetch schema from endpoint"
            >
              {schemaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Introspect
            </button>
            <button
              onClick={() => setShowSchema(p => !p)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${showSchema ? "text-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10" : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"}`}
              title="Toggle Schema Explorer"
            >
              <BookOpen className="w-3 h-3" /> Schema
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 relative overflow-hidden">
          {activePane === "query" ? (
            <div className="h-full flex">
              {/* Line numbers + editor */}
              <div className="flex-1 relative overflow-hidden">
                {/* Syntax highlight overlay */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 p-3 pl-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words overflow-hidden pointer-events-none z-0"
                  dangerouslySetInnerHTML={{ __html: highlightGQL(query || "") + (query?.endsWith("\n") ? " " : "") }}
                />
                <textarea
                  ref={queryRef}
                  value={query}
                  onChange={e => { onQueryChange(e.target.value); setSuggestions([]); }}
                  onScroll={syncScroll}
                  onKeyDown={handleKeyDown}
                  className="absolute inset-0 w-full h-full p-3 pl-12 font-mono text-xs leading-relaxed outline-none resize-none z-10 bg-transparent text-transparent caret-[var(--foreground)] selection:bg-[var(--color-brand-500)]/30"
                  spellCheck={false}
                  placeholder="# Write your GraphQL query here&#10;# Press Ctrl+Space for autocomplete (after introspection)&#10;&#10;query {&#10;  &#10;}"
                />
                {/* Line numbers */}
                <div className="absolute top-0 left-0 w-10 h-full p-3 pr-2 text-right font-mono text-xs leading-relaxed text-[#6e7681] select-none border-r border-[var(--border)] bg-[var(--sidebar)]/30 overflow-hidden pointer-events-none z-20">
                  {(query || " ").split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
              </div>

              {/* Autocomplete dropdown */}
              {suggestions.length > 0 && suggestPos && (
                <div className="fixed bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl z-[500] max-h-[200px] overflow-y-auto min-w-[220px] py-1 dropdown-enter"
                  style={{ top: suggestPos.top, left: suggestPos.left }}>
                  {suggestions.map((s, i) => (
                    <button key={s.name}
                      onClick={() => insertSuggestion(s.name)}
                      onMouseEnter={() => setSuggestIdx(i)}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors ${i === suggestIdx ? "bg-[var(--color-brand-500)]/10 text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--sidebar)]"}`}>
                      <span className="font-mono font-medium text-[var(--foreground)]">{s.name}</span>
                      <span className="ml-auto text-[10px] opacity-60 truncate max-w-[80px]">{s.type}</span>
                    </button>
                  ))}
                  <div className="px-3 py-1 border-t border-[var(--border)] text-[9px] text-[var(--muted)]">↑↓ navigate · ↵ select · esc dismiss</div>
                </div>
              )}
            </div>
          ) : (
            /* Variables Editor */
            <div className="h-full flex flex-col">
              {varsError && (
                <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-400 flex items-center gap-2">
                  <X className="w-3 h-3" /> JSON Error: {varsError}
                </div>
              )}
              <div className="flex-1 relative">
                <textarea
                  value={variables}
                  onChange={e => onVariablesChange(e.target.value)}
                  className="w-full h-full p-3 pl-12 font-mono text-xs leading-relaxed outline-none resize-none bg-transparent text-[var(--foreground)]"
                  spellCheck={false}
                  placeholder='{ "key": "value" }'
                />
                <div className="absolute top-0 left-0 w-10 h-full p-3 pr-2 text-right font-mono text-xs leading-relaxed text-[#6e7681] select-none border-r border-[var(--border)] bg-[var(--sidebar)]/30 overflow-hidden pointer-events-none">
                  {(variables || " ").split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 px-3 py-1 border-t border-[var(--border)] bg-[var(--sidebar)]/30 text-[10px] text-[var(--muted)] shrink-0">
          <span>Ln {(query || "").split("\n").length}, Col {(query || "").split("\n").pop()?.length || 0}</span>
          <span className="opacity-30">•</span>
          <span>{schema.length > 0 ? `${schema.filter(t => !t.name.startsWith("__")).length} types loaded` : "No schema"}</span>
          <span className="ml-auto opacity-50">Ctrl+Space for suggestions</span>
        </div>
      </div>

      {/* Schema Explorer Sidebar */}
      {showSchema && (
        <div className="w-64 border-l border-[var(--border)] bg-[var(--sidebar)]/30 flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Schema Explorer</span>
            <button onClick={() => setShowSchema(false)} className="p-0.5 hover:bg-[var(--border)] rounded transition-colors">
              <X className="w-3 h-3 text-[var(--muted)]" />
            </button>
          </div>
          {/* Search */}
          <div className="px-2 py-1.5 border-b border-[var(--border)]">
            <div className="flex items-center bg-[var(--background)] border border-[var(--border)] rounded px-2 focus-within:border-[var(--color-brand-500)] transition-colors">
              <Search className="w-3 h-3 text-[var(--muted)]" />
              <input type="text" value={schemaSearch} onChange={e => setSchemaSearch(e.target.value)}
                className="bg-transparent border-none outline-none px-2 py-1 text-[11px] text-[var(--foreground)] w-full"
                placeholder="Search types..." />
            </div>
          </div>
          {schema.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-3">
              <BookOpen className="w-8 h-8 text-[var(--muted)] opacity-20" />
              <p className="text-[11px] text-[var(--muted)]">
                {schemaError ? <span className="text-red-400">{schemaError}</span> : "Click Introspect to load the schema from your endpoint"}
              </p>
              <button onClick={introspect} disabled={schemaLoading}
                className="text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline disabled:opacity-50 flex items-center gap-1">
                {schemaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Introspect
              </button>
            </div>
          ) : (
            <SchemaExplorer schema={schema} search={schemaSearch} onInsertField={insertField} />
          )}
        </div>
      )}
    </div>
  );
}
