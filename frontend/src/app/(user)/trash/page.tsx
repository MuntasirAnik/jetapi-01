"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Search, ChevronLeft, Loader2, RotateCcw, Trash2, Info, MoreHorizontal, ChevronDown
} from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "@/components/DialogProvider";

export default function TrashPage() {
  const router = useRouter();
  const { confirmDialog } = useDialog();
  const [items, setItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCollection, setFilterCollection] = useState("all");
  const [filterDeletedBy, setFilterDeletedBy] = useState("all");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Get current user ID
  const userId = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.id; } catch { return null; } })()
    : null;

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const [trashRes, colRes] = await Promise.all([
        apiFetch("/requests/trash"),
        apiFetch("/collections"),
      ]);
      if (trashRes.ok) setItems(await trashRes.json());
      if (colRes.ok) setCollections(await colRes.json());
    } catch (err) {
      console.error("Failed to fetch trash:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrash(); }, []);

  // Close menu on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Only owned collections (exclude shared with me)
  const collectionOptions = useMemo(() => {
    return collections
      .filter((c: any) => !c.ownerId || c.ownerId === userId)
      .map((c: any) => c.name)
      .filter(Boolean)
      .sort();
  }, [collections, userId]);

  const deletedByOptions = useMemo(() => {
    const names = new Set(items.map(i => i.deletedByName || 'You').filter(Boolean));
    return Array.from(names).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = item.name?.toLowerCase().includes(q) ||
          item.url?.toLowerCase().includes(q) ||
          item.collection?.name?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      // Collection filter
      if (filterCollection !== 'all' && (item.collection?.name || '') !== filterCollection) return false;
      // Deleted by filter
      if (filterDeletedBy !== 'all' && (item.deletedByName || 'You') !== filterDeletedBy) return false;
      return true;
    });
  }, [items, searchQuery, filterCollection, filterDeletedBy]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setActiveMenu(null);
    try {
      const res = await apiFetch(`/requests/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to restore");
      toast.success("Request restored successfully");
      setItems(prev => prev.filter(item => item.id !== id));
      window.dispatchEvent(new Event("postclone-refresh-sidebar"));
    } catch {
      toast.error("Failed to restore request");
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    setActiveMenu(null);
    if (!(await confirmDialog(`Permanently delete "${name}"? This cannot be undone.`))) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/requests/${id}/permanent`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Permanently deleted");
      setItems(prev => prev.filter(item => item.id !== id));
    } catch {
      toast.error("Failed to delete permanently");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getRemovalDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const removal = new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000);
    return removal.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getMethodColor = (method: string) => {
    const c: Record<string, string> = {
      GET: "text-green-400", POST: "text-orange-400", PUT: "text-blue-400",
      PATCH: "text-yellow-400", DELETE: "text-red-400",
    };
    return c[method] || "text-[var(--muted)]";
  };

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] font-sans">
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">

          {/* Back */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] mb-5 transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back
          </button>

          {/* Title */}
          <h1 className="text-2xl font-bold mb-2">Trash</h1>
          <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed max-w-xl">
            Deleted items from workspaces you have access to will appear here. You can restore or permanently delete items if you have edit permissions.
          </p>

          {/* Info banner */}
          <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-6">
            <Info className="w-4 h-4 shrink-0" />
            <span>Items will be removed from the trash automatically after 30 days.</span>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Search requests"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--card)] border border-[var(--border)] rounded-md pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-[var(--color-brand-500)] transition-colors placeholder-[var(--muted)]"
              />
            </div>
            <div className="relative">
              <select
                value={filterCollection}
                onChange={e => setFilterCollection(e.target.value)}
                className="appearance-none bg-[var(--card)] border border-[var(--border)] rounded-md pl-3 pr-8 py-2 text-xs focus:outline-none focus:border-[var(--color-brand-500)] transition-colors text-[var(--foreground)] cursor-pointer min-w-[160px]"
              >
                <option value="all">All Collections</option>
                {collectionOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted)] pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={filterDeletedBy}
                onChange={e => setFilterDeletedBy(e.target.value)}
                className="appearance-none bg-[var(--card)] border border-[var(--border)] rounded-md pl-3 pr-8 py-2 text-xs focus:outline-none focus:border-[var(--color-brand-500)] transition-colors text-[var(--foreground)] cursor-pointer min-w-[140px]"
              >
                <option value="all">Deleted by</option>
                {deletedByOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted)] pointer-events-none" />
            </div>
          </div>

          {/* Table */}
          <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--sidebar)]/60">
              <div className="col-span-4 text-[11px] font-semibold text-[var(--muted)]">Name</div>
              <div className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">Collection</div>
              <div className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">Deleted by</div>
              <div className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">Deleted on</div>
              <div className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">Day of removal</div>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
              </div>
            ) : filteredItems.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative w-24 h-24">
                  {/* Postman-style empty illustration */}
                  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full opacity-60">
                    <circle cx="60" cy="65" r="40" fill="var(--sidebar)" stroke="var(--border)" strokeWidth="1.5"/>
                    <rect x="38" y="42" width="44" height="50" rx="4" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5"/>
                    <rect x="45" y="52" width="20" height="2.5" rx="1" fill="var(--border)"/>
                    <rect x="45" y="58" width="28" height="2.5" rx="1" fill="var(--border)"/>
                    <rect x="45" y="64" width="14" height="2.5" rx="1" fill="var(--border)"/>
                    <rect x="45" y="74" width="22" height="2.5" rx="1" fill="var(--border)"/>
                    <circle cx="85" cy="35" r="4" fill="var(--color-brand-500)" opacity="0.6"/>
                    <path d="M52 82L68 82" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
                  </svg>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-sm mb-1">
                    {searchQuery ? "No Items Found" : "No Items in Trash"}
                  </h3>
                  <p className="text-xs text-[var(--muted)] max-w-xs leading-relaxed">
                    {searchQuery
                      ? "Try a different search term, adjust your filters or check for typos."
                      : "When you delete requests, they'll appear here for 30 days before being permanently removed."
                    }
                  </p>
                </div>
              </div>
            ) : (
              /* Table Rows */
              filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[var(--sidebar)]/30 transition-colors group ${
                    index < filteredItems.length - 1 ? "border-b border-[var(--border)]" : ""
                  }`}
                >
                  {/* Name */}
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-bold shrink-0 ${getMethodColor(item.method)}`}>{item.method}</span>
                    <span className="text-xs font-medium truncate">{item.name}</span>
                  </div>

                  {/* Collection */}
                  <div className="col-span-2 text-xs text-[var(--muted)] truncate">
                    {item.collection?.name || "—"}
                  </div>

                  {/* Deleted by */}
                  <div className="col-span-2 text-xs text-[var(--muted)]">
                    {item.deletedByName || 'You'}
                  </div>

                  {/* Deleted on */}
                  <div className="col-span-2 text-xs text-[var(--muted)]">
                    {formatDate(item.deletedAt)}
                  </div>

                  {/* Day of removal + actions */}
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)]">
                      {getRemovalDate(item.deletedAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(item.id)}
                        disabled={restoringId === item.id}
                        className="btn-spring flex items-center gap-1 text-[10px] font-semibold text-[var(--color-brand-500)] hover:text-white hover:bg-[var(--color-brand-500)] border border-[var(--color-brand-500)]/25 hover:border-[var(--color-brand-500)] px-2.5 py-1 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {restoringId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Restore
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === item.id ? null : item.id); }}
                          className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {activeMenu === item.id && (
                          <div className="absolute right-0 top-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1 min-w-[160px] dropdown-enter" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handlePermanentDelete(item.id, item.name)}
                              disabled={deletingId === item.id}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-[var(--sidebar)] transition-colors text-left text-red-400 disabled:opacity-50"
                            >
                              {deletingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              Delete permanently
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
