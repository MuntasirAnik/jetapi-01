"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Copy, Check, FileText, ChevronDown, ChevronRight, Download } from "lucide-react";
import { toast } from "react-toastify";
import { copyToClipboard } from "@/lib/api";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PUT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PATCH: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  OPTIONS: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  HEAD: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

// Interpolate {{variables}} in all string values of a request
function interpolateRequest(request: any, vars: any[] = []): any {
  if (!request) return request;
  const clone = JSON.parse(JSON.stringify(request));
  const interpolate = (str: string) => {
    if (typeof str !== 'string') return str;
    let result = str;
    vars.filter(v => v.enabled !== false && v.key).forEach(v => {
      result = result.replace(new RegExp(`\\{\\{\\s*${v.key}\\s*\\}\\}`, 'g'), v.value || '');
    });
    return result;
  };
  const walk = (obj: any) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') obj[key] = interpolate(obj[key]);
      else if (typeof obj[key] === 'object' && obj[key] !== null) walk(obj[key]);
    }
  };
  walk(clone);
  return clone;
}

function generateMarkdownDoc(request: any): string {
  if (!request) return "";
  const method = (request.method || "GET").toUpperCase();
  const url = request.url || "No URL defined";
  const name = request.name || "Untitled Request";

  let md = `# ${name}\n\n`;
  md += `\`${method}\` \`${url}\`\n\n`;

  if (request.description) {
    md += `## Description\n\n${request.description}\n\n`;
  }

  // Path Variables
  const pathVars = (request.pathVariables || []).filter((p: any) => p.key);
  if (pathVars.length > 0) {
    md += `## Path Variables\n\n`;
    md += `| Name | Value | Description |\n|------|-------|-------------|\n`;
    pathVars.forEach((p: any) => {
      md += `| \`${p.key}\` | \`${p.value || ''}\` | ${p.description || '-'} |\n`;
    });
    md += `\n`;
  }

  // Query Parameters
  const params = (request.params || []).filter((p: any) => p.key);
  if (params.length > 0) {
    md += `## Query Parameters\n\n`;
    md += `| Name | Value | Required |\n|------|-------|----------|\n`;
    params.forEach((p: any) => {
      md += `| \`${p.key}\` | \`${p.value || ''}\` | ${p.enabled !== false ? '✓' : '✗'} |\n`;
    });
    md += `\n`;
  }

  // Headers
  const headers = (request.headers || []).filter((h: any) => h.key);
  if (headers.length > 0) {
    md += `## Headers\n\n`;
    md += `| Key | Value |\n|-----|-------|\n`;
    headers.forEach((h: any) => {
      md += `| \`${h.key}\` | \`${h.value || ''}\` |\n`;
    });
    md += `\n`;
  }

  // Request Body
  if (request.body || request.rawBody) {
    md += `## Request Body\n\n`;
    const bodyType = request.bodyType || "json";
    md += `**Content-Type:** \`${bodyType === 'json' ? 'application/json' : bodyType === 'form' ? 'multipart/form-data' : bodyType === 'urlencoded' ? 'application/x-www-form-urlencoded' : bodyType}\`\n\n`;
    
    if (bodyType === 'json' && request.rawBody) {
      md += "```json\n" + request.rawBody + "\n```\n\n";
    } else if ((bodyType === 'form' || bodyType === 'urlencoded') && Array.isArray(request.body)) {
      md += `| Field | Value | Type |\n|-------|-------|------|\n`;
      request.body.filter((b: any) => b.key).forEach((b: any) => {
        md += `| \`${b.key}\` | \`${b.value || ''}\` | ${b.type || 'text'} |\n`;
      });
      md += `\n`;
    } else if (typeof request.rawBody === 'string') {
      md += "```\n" + request.rawBody + "\n```\n\n";
    }
  }

  // Auth
  if (request.auth && request.authType && request.authType !== 'none') {
    md += `## Authentication\n\n`;
    md += `**Type:** \`${request.authType}\`\n\n`;
  }

  // cURL example
  md += `## Example (cURL)\n\n`;
  md += "```bash\n";
  md += `curl -X ${method} '${url}'`;
  headers.forEach((h: any) => {
    if (h.enabled !== false) md += ` \\\n  -H '${h.key}: ${h.value}'`;
  });
  if (request.rawBody && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    md += ` \\\n  -d '${request.rawBody.replace(/'/g, "'\\''")}'`;
  }
  md += "\n```\n";

  return md;
}

function generatePdfHtml(request: any, envVariables: any[] = []): string {
  request = interpolateRequest(request, envVariables);
  const method = (request?.method || 'GET').toUpperCase();
  const url = request?.url || '';
  const name = request?.name || 'Untitled Request';
  const pathVars = (request?.pathVariables || []).filter((p: any) => p.key);
  const params = (request?.params || []).filter((p: any) => p.key);
  const headers = (request?.headers || []).filter((h: any) => h.key);

  const methodColors: Record<string, string> = {
    GET: '#10b981', POST: '#f59e0b', PUT: '#3b82f6',
    PATCH: '#a855f7', DELETE: '#ef4444', OPTIONS: '#6b7280', HEAD: '#06b6d4',
  };
  const mc = methodColors[method] || '#10b981';

  const tableRow = (key: string, value: string, extra?: string) =>
    `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-family:monospace;font-weight:600;font-size:12px;">${key}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;color:#666;">${value || '<em>empty</em>'}</td>${extra ? `<td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:11px;color:#888;">${extra}</td>` : ''}</tr>`;

  let html = `<!DOCTYPE html><html><head><title>${name} - API Documentation</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1a1a1a; padding:40px; max-width:800px; margin:0 auto; }
    h1 { font-size:22px; margin-bottom:8px; }
    h2 { font-size:14px; text-transform:uppercase; letter-spacing:1px; color:#888; margin:28px 0 12px; padding-bottom:6px; border-bottom:1px solid #eee; }
    .method { display:inline-block; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:800; color:white; background:${mc}; margin-right:8px; }
    .url { font-family:monospace; font-size:12px; color:#555; word-break:break-all; }
    .desc { font-size:13px; color:#666; margin-top:12px; line-height:1.6; }
    table { width:100%; border-collapse:collapse; margin:8px 0; }
    th { padding:6px 12px; border:1px solid #e5e7eb; background:#f9fafb; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#888; }
    pre { background:#1e1e1e; color:#d4d4d4; padding:16px; border-radius:8px; font-size:12px; line-height:1.6; overflow-x:auto; white-space:pre-wrap; word-break:break-all; }
    .footer { margin-top:40px; padding-top:16px; border-top:1px solid #eee; font-size:10px; color:#aaa; text-align:center; }
    @media print { body { padding:20px; } }
  </style></head><body>`;

  html += `<h1>${name}</h1>`;
  html += `<div style="margin:12px 0 20px;"><span class="method">${method}</span><span class="url">${url || 'No URL'}</span></div>`;
  if (request?.description) html += `<p class="desc">${request.description}</p>`;

  if (pathVars.length > 0) {
    html += `<h2>Path Variables</h2><table><tr><th>Name</th><th>Value</th></tr>`;
    pathVars.forEach((p: any) => { html += tableRow(':' + p.key, p.value); });
    html += `</table>`;
  }

  if (params.length > 0) {
    html += `<h2>Query Parameters</h2><table><tr><th>Name</th><th>Value</th><th>Status</th></tr>`;
    params.forEach((p: any) => { html += tableRow(p.key, p.value, p.enabled !== false ? '✓ Enabled' : '✗ Disabled'); });
    html += `</table>`;
  }

  if (headers.length > 0) {
    html += `<h2>Headers</h2><table><tr><th>Key</th><th>Value</th></tr>`;
    headers.forEach((h: any) => { html += tableRow(h.key, h.value); });
    html += `</table>`;
  }

  if (request?.rawBody || (Array.isArray(request?.body) && request.body.some((b: any) => b.key))) {
    const bodyType = request.bodyType || 'json';
    const ct = bodyType === 'json' ? 'application/json' : bodyType === 'form' ? 'multipart/form-data' : bodyType === 'urlencoded' ? 'application/x-www-form-urlencoded' : bodyType;
    html += `<h2>Request Body</h2><p style="font-size:11px;color:#888;margin-bottom:8px;">Content-Type: <strong>${ct}</strong></p>`;
    if (bodyType === 'json' && request.rawBody) {
      let body = request.rawBody;
      try { body = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      html += `<pre>${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    } else if (Array.isArray(request.body)) {
      html += `<table><tr><th>Field</th><th>Value</th><th>Type</th></tr>`;
      request.body.filter((b: any) => b.key).forEach((b: any) => { html += tableRow(b.key, b.value, b.type || 'text'); });
      html += `</table>`;
    } else if (request.rawBody) {
      html += `<pre>${request.rawBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    }
  }

  if (request?.authType && request.authType !== 'none') {
    html += `<h2>Authentication</h2><p style="font-size:13px;">Type: <strong style="font-family:monospace;">${request.authType}</strong></p>`;
  }

  // cURL
  let curl = `curl -X ${method} '${url}'`;
  headers.forEach((h: any) => { if (h.enabled !== false) curl += ` \\\n  -H '${h.key}: ${h.value}'`; });
  if (request?.rawBody && ['POST','PUT','PATCH'].includes(method)) curl += ` \\\n  -d '${request.rawBody.replace(/'/g, "'\\\''")}'`;
  html += `<h2>Example (cURL)</h2><pre>${curl.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

  html += `<div class="footer">Generated by JetAPI · ${new Date().toLocaleDateString()}</div>`;
  html += `</body></html>`;
  return html;
}

export default function DocumentationPanel({ request, envVariables = [], onClose }: { request: any; envVariables?: any[]; onClose: () => void }) {
  const resolvedRequest = useMemo(() => interpolateRequest(request, envVariables), [request, envVariables]);
  const [width, setWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX - 40;
      setWidth(Math.min(Math.max(newWidth, 300), window.innerWidth - 300));
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const method = (resolvedRequest?.method || "GET").toUpperCase();
  const url = resolvedRequest?.url || "";
  const name = resolvedRequest?.name || "Untitled Request";
  const methodColor = METHOD_COLORS[method] || METHOD_COLORS.GET;
  const markdown = useMemo(() => generateMarkdownDoc(resolvedRequest), [resolvedRequest]);

  const pathVars = (resolvedRequest?.pathVariables || []).filter((p: any) => p.key);
  const params = (resolvedRequest?.params || []).filter((p: any) => p.key);
  const headers = (resolvedRequest?.headers || []).filter((h: any) => h.key);
  const hasBody = resolvedRequest?.rawBody || (Array.isArray(resolvedRequest?.body) && resolvedRequest.body.some((b: any) => b.key));

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyMarkdown = async () => {
    await copyToClipboard(markdown);
    setCopied(true);
    toast.success("Documentation copied as Markdown!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    const html = generatePdfHtml(request, envVariables);
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Please allow popups to download PDF'); return; }
    printWindow.document.write(html);
    printWindow.document.close();
    // Wait for content to render, then trigger print (Save as PDF)
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 300);
    };
    toast.success('Print dialog opened — select "Save as PDF"');
  };

  const SectionHeader = ({ id, title, count, color }: { id: string; title: string; count: number; color: string }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center gap-2 px-4 py-2.5 bg-[var(--background)]/50 border-b border-[var(--border)] hover:bg-[var(--background)]/80 transition-colors text-left"
    >
      {collapsedSections[id] 
        ? <ChevronRight className="w-3 h-3 text-[var(--muted)]" /> 
        : <ChevronDown className="w-3 h-3 text-[var(--muted)]" />
      }
      <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{title}</span>
      <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums">{count}</span>
    </button>
  );

  return (
    <div 
      className="h-full bg-[var(--sidebar)] border-l border-[var(--border)] flex flex-col overflow-hidden flex-shrink-0 animate-in slide-in-from-right-10 duration-200 shadow-2xl z-50 relative"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 bottom-0 -left-1 w-2 hover:bg-[var(--color-brand-500)] cursor-col-resize z-50 transition-colors"
        onMouseDown={() => setIsDragging(true)}
      />
      {isDragging && <div className="fixed inset-0 z-[100] cursor-col-resize" />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--color-brand-500)]" />
          <span className="text-sm font-semibold">API Documentation</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownloadPdf}
            className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors"
            title="Download as PDF"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopyMarkdown}
            className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors"
            title="Copy as Markdown"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Endpoint Hero */}
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--foreground)] mb-3">{name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${methodColor}`}>{method}</span>
            <code className="text-[11px] font-mono text-[var(--muted)] break-all select-all leading-relaxed">{url || "No URL"}</code>
          </div>
          {resolvedRequest?.description && (
            <p className="mt-3 text-xs text-[var(--muted)] leading-relaxed">{resolvedRequest.description}</p>
          )}
        </div>

        {/* Path Variables */}
        {pathVars.length > 0 && (
          <div>
            <SectionHeader id="pathVars" title="Path Variables" count={pathVars.length} color="text-purple-400" />
            {!collapsedSections.pathVars && (
              <div className="divide-y divide-[var(--border)]/50">
                {pathVars.map((p: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 hover:bg-[var(--background)]/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono font-semibold text-purple-400">:{p.key}</code>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5 truncate">{p.value || <span className="italic opacity-50">No value</span>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Query Parameters */}
        {params.length > 0 && (
          <div>
            <SectionHeader id="params" title="Query Parameters" count={params.length} color="text-cyan-400" />
            {!collapsedSections.params && (
              <div className="divide-y divide-[var(--border)]/50">
                {params.map((p: any, i: number) => (
                  <div key={i} className={`px-4 py-2.5 hover:bg-[var(--background)]/30 transition-colors ${p.enabled === false ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono font-semibold text-cyan-400">{p.key}</code>
                      {p.enabled === false && <span className="text-[8px] bg-[var(--border)] text-[var(--muted)] px-1 rounded">DISABLED</span>}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5 truncate">{p.value || <span className="italic opacity-50">No value</span>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Headers */}
        {headers.length > 0 && (
          <div>
            <SectionHeader id="headers" title="Headers" count={headers.length} color="text-sky-400" />
            {!collapsedSections.headers && (
              <div className="divide-y divide-[var(--border)]/50">
                {headers.map((h: any, i: number) => (
                  <div key={i} className={`px-4 py-2.5 hover:bg-[var(--background)]/30 transition-colors ${h.enabled === false ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono font-semibold text-sky-400">{h.key}</code>
                      {h.enabled === false && <span className="text-[8px] bg-[var(--border)] text-[var(--muted)] px-1 rounded">DISABLED</span>}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5 truncate">{h.value || <span className="italic opacity-50">No value</span>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Request Body */}
        {hasBody && (
          <div>
            <SectionHeader id="body" title="Request Body" count={1} color="text-amber-400" />
            {!collapsedSections.body && (
              <div className="px-4 py-3">
                <div className="text-[10px] text-[var(--muted)] mb-2 font-semibold uppercase tracking-wider">
                  Content-Type: <span className="text-[var(--foreground)]">
                    {resolvedRequest.bodyType === 'json' ? 'application/json' : 
                     resolvedRequest.bodyType === 'form' ? 'multipart/form-data' : 
                     resolvedRequest.bodyType === 'urlencoded' ? 'application/x-www-form-urlencoded' : 
                     resolvedRequest.bodyType || 'text/plain'}
                  </span>
                </div>
                {resolvedRequest.bodyType === 'json' && resolvedRequest.rawBody ? (
                  <pre className="text-[11px] font-mono bg-[#1e1e1e] text-[#d4d4d4] p-3 rounded-lg border border-[#333] overflow-x-auto leading-relaxed max-h-[300px] overflow-y-auto">{
                    (() => {
                      try { return JSON.stringify(JSON.parse(resolvedRequest.rawBody), null, 2); }
                      catch { return resolvedRequest.rawBody; }
                    })()
                  }</pre>
                ) : Array.isArray(resolvedRequest.body) ? (
                  <div className="divide-y divide-[var(--border)]/50 border border-[var(--border)] rounded-lg overflow-hidden">
                    {resolvedRequest.body.filter((b: any) => b.key).map((b: any, i: number) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-2 text-[11px] font-mono">
                        <span className="font-semibold text-amber-400">{b.key}</span>
                        <span className="text-[var(--muted)]">=</span>
                        <span className="text-[var(--muted)] truncate">{b.value || ''}</span>
                        <span className="ml-auto text-[8px] bg-[var(--border)] text-[var(--muted)] px-1 rounded">{b.type || 'text'}</span>
                      </div>
                    ))}
                  </div>
                ) : resolvedRequest.rawBody ? (
                  <pre className="text-[11px] font-mono bg-[#1e1e1e] text-[#d4d4d4] p-3 rounded-lg border border-[#333] overflow-x-auto leading-relaxed max-h-[300px] overflow-y-auto">{resolvedRequest.rawBody}</pre>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Auth */}
        {resolvedRequest?.authType && resolvedRequest.authType !== 'none' && (
          <div>
            <SectionHeader id="auth" title="Authentication" count={1} color="text-rose-400" />
            {!collapsedSections.auth && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Type:</span>
                  <span className="text-[11px] font-mono font-semibold text-rose-400">{resolvedRequest.authType}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No content */}
        {pathVars.length === 0 && params.length === 0 && headers.length === 0 && !hasBody && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[var(--muted)]">This is a simple {method} request with no parameters, headers, or body.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--card)]/30">
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-colors"
          >
            <Download className="w-3 h-3" /> Download PDF
          </button>
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--color-brand-500)] transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Markdown"}
          </button>
        </div>
        <span className="text-[10px] text-[var(--muted)] opacity-60">{method} · {params.length}p · {headers.length}h</span>
      </div>
    </div>
  );
}
