"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { apiFetch } from "@/lib/api";
import {
  X, Loader2, Settings, Activity, Save, Plug, Search,
  MessageSquare, Globe, CheckSquare, Webhook, BarChart3, Bell,
  AlertTriangle, Download, Send, Shield,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  MessageSquare, Globe, CheckSquare, Webhook, BarChart3, Bell,
  AlertTriangle, Download, Send, Plug, Settings, Shield,
};

const CATEGORY_COLORS: Record<string, { text: string; bg: string }> = {
  notification: { text: "text-blue-400", bg: "bg-blue-500/10" },
  "ci-cd": { text: "text-orange-400", bg: "bg-orange-500/10" },
  monitoring: { text: "text-purple-400", bg: "bg-purple-500/10" },
  automation: { text: "text-cyan-400", bg: "bg-cyan-500/10" },
  storage: { text: "text-green-400", bg: "bg-green-500/10" },
  "project-mgmt": { text: "text-pink-400", bg: "bg-pink-500/10" },
  other: { text: "text-gray-400", bg: "bg-gray-500/10" },
};

const CATEGORY_LABELS: Record<string, string> = {
  notification: "Notification",
  "ci-cd": "CI/CD",
  monitoring: "Monitoring",
  automation: "Automation",
  storage: "Storage",
  "project-mgmt": "Project Mgmt",
  other: "Other",
};

interface CollectionPluginsModalProps {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}

export default function CollectionPluginsModal({ collectionId, collectionName, onClose }: CollectionPluginsModalProps) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [configSlug, setConfigSlug] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadPlugins = async () => {
    try {
      const res = await apiFetch(`/collections/${collectionId}/plugins`);
      if (res.ok) setPlugins(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadPlugins(); }, [collectionId]);

  const handleToggle = async (slug: string, currentlyEnabled: boolean) => {
    try {
      const res = await apiFetch(`/collections/${collectionId}/plugins/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentlyEnabled }),
      });
      if (res.ok) {
        toast.success(`${slug} ${!currentlyEnabled ? "enabled" : "disabled"} for this collection`);
        loadPlugins();
      }
    } catch { toast.error("Failed to toggle plugin"); }
  };

  const openConfig = (plugin: any) => {
    let config: Record<string, string> = {};
    try { config = JSON.parse(plugin.userConfig || "{}"); } catch {}
    setConfigValues(config);
    setConfigSlug(plugin.slug);
  };

  const handleSaveConfig = async () => {
    if (!configSlug) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/collections/${collectionId}/plugins/${configSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: configValues, enabled: true }),
      });
      if (res.ok) {
        toast.success("Plugin configuration saved");
        setConfigSlug(null);
        loadPlugins();
      }
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!configSlug) return;
    setTesting(true);
    try {
      // Save first, then test
      await apiFetch(`/collections/${collectionId}/plugins/${configSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: configValues, enabled: true }),
      });
      const res = await apiFetch(`/collections/${collectionId}/plugins/${configSlug}/test`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
      }
    } catch { toast.error("Test failed"); }
    finally { setTesting(false); }
  };

  const handleRemove = async (slug: string) => {
    try {
      const res = await apiFetch(`/collections/${collectionId}/plugins/${slug}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Plugin removed from collection");
        loadPlugins();
      }
    } catch { toast.error("Failed to remove"); }
  };

  const getStatus = (p: any) => {
    if (!p.activated) return { label: "Available", color: "text-gray-400", dot: "bg-gray-500" };
    if (!p.enabled) return { label: "Paused", color: "text-yellow-400", dot: "bg-yellow-500" };
    let config: any = {};
    try { config = JSON.parse(p.userConfig || "{}"); } catch {}
    const schema = JSON.parse(p.configSchema || "[]");
    const hasConfig = schema.some((f: any) => config[f.key]);
    if (hasConfig) return { label: "Active", color: "text-green-400", dot: "bg-green-500" };
    return { label: "Not Configured", color: "text-yellow-400", dot: "bg-yellow-500" };
  };

  const filtered = plugins.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase())
  );

  const configPlugin = configSlug ? plugins.find(p => p.slug === configSlug) : null;
  const configSchema = configPlugin ? JSON.parse(configPlugin.configSchema || "[]") : [];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Plug className="w-4 h-4 text-[var(--color-brand-500)]" /> Plugins
            </h2>
            <p className="text-[10px] text-[var(--muted)] mt-0.5">Manage integrations for <span className="font-semibold text-[var(--foreground)]">{collectionName}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--sidebar)] text-[var(--muted)]"><X className="w-4 h-4" /></button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input type="text" placeholder="Search plugins..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)]" />
          </div>
        </div>

        {/* Plugin List */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plugins...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted)]">
              <Plug className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">{plugins.length === 0 ? "No plugins available. Ask your admin to enable plugins." : "No plugins match your search."}</p>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {filtered.map(plugin => {
                const IconComp = ICON_MAP[plugin.icon] || Plug;
                const status = getStatus(plugin);
                const catColor = CATEGORY_COLORS[plugin.category] || CATEGORY_COLORS.other;
                return (
                  <div key={plugin.slug}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      plugin.activated && plugin.enabled
                        ? "border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.03]"
                        : "border-[var(--border)] bg-[var(--sidebar)]/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        plugin.activated && plugin.enabled
                          ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]"
                          : "bg-[var(--border)] text-[var(--muted)]"
                      }`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold truncate">{plugin.name}</h3>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${catColor.bg} ${catColor.text}`}>
                            {CATEGORY_LABELS[plugin.category] || plugin.category}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            <span className={`text-[9px] font-medium ${status.color}`}>{status.label}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">{plugin.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {plugin.activated && (
                        <button onClick={() => openConfig(plugin)}
                          className="text-[9px] px-2.5 py-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--sidebar)] hover:text-[var(--foreground)] transition-colors font-medium flex items-center gap-1">
                          <Settings className="w-3 h-3" /> Config
                        </button>
                      )}
                      <button onClick={() => plugin.activated ? handleToggle(plugin.slug, plugin.enabled) : handleToggle(plugin.slug, false)}
                        className={`relative rounded-full transition-all duration-200 flex-shrink-0 ${
                          plugin.activated && plugin.enabled ? "bg-emerald-500" : "bg-[var(--border)]"
                        }`}
                        style={{ width: 36, height: 20 }}>
                        <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
                          plugin.activated && plugin.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Config Panel (slides in from bottom) */}
        {configPlugin && (
          <div className="border-t border-[var(--border)] p-5 flex-shrink-0 bg-[var(--sidebar)]/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {(() => { const IC = ICON_MAP[configPlugin.icon] || Plug; return <IC className="w-4 h-4 text-[var(--color-brand-500)]" />; })()}
                <h3 className="text-xs font-bold">{configPlugin.name} Configuration</h3>
              </div>
              <button onClick={() => setConfigSlug(null)} className="text-[var(--muted)] hover:text-[var(--foreground)] p-1 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              {configSchema.map((field: any) => (
                <div key={field.key}>
                  <label className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold mb-1 block">{field.label}</label>
                  {field.type === "select" ? (
                    <select value={configValues[field.key] || ""} onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)]">
                      <option value="">Select...</option>
                      {(field.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                      value={configValues[field.key] || ""}
                      onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || ""}
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)]"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={handleTest} disabled={testing}
                className="text-[9px] px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)] transition-colors font-medium flex items-center gap-1.5 disabled:opacity-50">
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <div className="flex gap-2">
                <button onClick={() => handleRemove(configSlug!)}
                  className="text-[9px] px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors font-medium">
                  Remove
                </button>
                <button onClick={handleSaveConfig} disabled={saving}
                  className="text-[9px] px-3 py-1.5 rounded-lg bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white transition-colors font-semibold flex items-center gap-1.5 disabled:opacity-50">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {saving ? "Saving..." : "Save Config"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
