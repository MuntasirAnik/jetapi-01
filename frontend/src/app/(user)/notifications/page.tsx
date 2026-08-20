"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Bell, Check, CheckCheck, Trash2, Loader2, ChevronLeft, ChevronRight,
  Filter, Inbox, BellOff, X, UserPlus, Users,
} from "lucide-react";
import { toast } from "react-toastify";
import UserSidebar from "@/components/UserSidebar";

interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
  totalAll: number;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [limit] = useState(15);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const fetchNotifications = useCallback(async (p: number, f: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/notifications?page=${p}&limit=${limit}&filter=${f}`);
      if (!res.ok) throw new Error("Failed to load notifications");
      const data: PaginatedResponse = await res.json();
      setNotifications(data.data);
      setTotal(data.total);
      setTotalAll(data.totalAll);
      setTotalPages(data.totalPages);
      setUnreadCount(data.unreadCount);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchNotifications(page, filter);
  }, [page, filter, fetchNotifications]);

  // Update select-all indeterminate state
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < notifications.length;
    }
  }, [selectedIds, notifications.length]);

  const handleMarkAsRead = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PUT" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { toast.error("Failed to mark as read"); }
    finally { setActionLoading(null); }
  };

  const handleMarkAllAsRead = async () => {
    setActionLoading("all");
    try {
      await apiFetch("/notifications/read-all", { method: "PUT" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch { toast.error("Failed to mark all as read"); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/notifications/${id}`, { method: "DELETE" });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setTotal(t => t - 1);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      // If page is now empty, go to previous page
      if (notifications.length <= 1 && page > 1) {
        setPage(p => p - 1);
      }
    } catch { toast.error("Failed to delete notification"); }
    finally { setActionLoading(null); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading("bulk");
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        apiFetch(`/notifications/${id}`, { method: "DELETE" })
      ));
      toast.success(`Deleted ${selectedIds.size} notification${selectedIds.size > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      fetchNotifications(page, filter);
    } catch { toast.error("Failed to delete some notifications"); }
    finally { setActionLoading(null); }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading("bulk");
    try {
      await Promise.all(
        Array.from(selectedIds)
          .filter(id => !notifications.find(n => n.id === id)?.isRead)
          .map(id => apiFetch(`/notifications/${id}/read`, { method: "PUT" }))
      );
      setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - Array.from(selectedIds).filter(id => !notifications.find(n => n.id === id)?.isRead).length));
      setSelectedIds(new Set());
      toast.success("Marked as read");
    } catch { toast.error("Failed"); }
    finally { setActionLoading(null); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map(n => n.id)));
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  };

  const filterTabs = [
    { id: "all" as const, label: "All", count: totalAll },
    { id: "unread" as const, label: "Unread", count: unreadCount },
    { id: "read" as const, label: "Read", count: totalAll - unreadCount },
  ];

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] font-sans">
      <UserSidebar activePage="notifications" />

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-500)]/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-[var(--color-brand-500)]" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Notifications</h1>
                <p className="text-xs text-[var(--muted)]">
                  {totalAll} total · {unreadCount} unread
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={actionLoading === "all"}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-brand-500)]/10 transition-colors disabled:opacity-50"
              >
                {actionLoading === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 mb-4 bg-[var(--sidebar)] rounded-lg p-1 border border-[var(--border)]">
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setFilter(tab.id); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  filter === tab.id
                    ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.id === "unread" && <Filter className="w-3 h-3" />}
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  filter === tab.id
                    ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]"
                    : "bg-[var(--border)] text-[var(--muted)]"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[var(--color-brand-500)]/5 border border-[var(--color-brand-500)]/20 rounded-lg text-xs animate-in fade-in duration-200">
              <span className="font-semibold text-[var(--color-brand-500)]">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                onClick={handleBulkMarkRead}
                disabled={actionLoading === "bulk"}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[var(--foreground)] hover:bg-[var(--sidebar)] transition-colors font-medium"
              >
                <Check className="w-3 h-3" /> Mark read
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={actionLoading === "bulk"}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors font-medium"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Notification List */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Select All Header */}
            {notifications.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--sidebar)]/30">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={selectedIds.size === notifications.length && notifications.length > 0}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-[var(--border)] accent-[var(--color-brand-500)] cursor-pointer"
                />
                <span className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                  {selectedIds.size === notifications.length ? "Deselect all" : "Select all"}
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-brand-500)]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--sidebar)] flex items-center justify-center mb-3">
                  {filter === "unread" ? (
                    <BellOff className="w-6 h-6 text-[var(--muted)]" />
                  ) : (
                    <Inbox className="w-6 h-6 text-[var(--muted)]" />
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
                  {filter === "unread" ? "All caught up!" : filter === "read" ? "No read notifications" : "No notifications yet"}
                </p>
                <p className="text-xs text-[var(--muted)] max-w-xs">
                  {filter === "unread"
                    ? "You have no unread notifications. Check back later!"
                    : filter === "read"
                    ? "Notifications you've read will appear here."
                    : "When you receive notifications, they'll show up here."
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--sidebar)]/30 ${
                      !n.isRead ? "bg-[var(--color-brand-500)]/[0.03]" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="pt-0.5 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(n.id)}
                        onChange={() => toggleSelect(n.id)}
                        className="w-3.5 h-3.5 rounded border-[var(--border)] accent-[var(--color-brand-500)] cursor-pointer"
                      />
                    </div>

                    {/* Unread indicator */}
                    <div className="pt-1.5 flex-shrink-0">
                      {!n.isRead ? (
                        <div className="w-2 h-2 rounded-full bg-[var(--color-brand-500)]" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-transparent" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-relaxed ${!n.isRead ? "text-[var(--foreground)] font-medium" : "text-[var(--muted)]"}`}>
                        {n.message}
                      </p>
                      <p className="text-[10px] text-[var(--muted)] mt-1 opacity-70">
                        {formatDate(n.createdAt)}
                      </p>
                      {/* Accept/Decline buttons for team invitations */}
                      {(n as any).type === 'TEAM_INVITE' && (n as any).metadata?.invitationId && !n.isRead && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActionLoading(n.id);
                              try {
                                const res = await apiFetch(`/organizations/invitations/${(n as any).metadata.invitationId}/accept`, { method: 'POST' });
                                if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed'); }
                                toast.success(`You've joined ${(n as any).metadata.organizationName || 'the team'}!`);
                                await apiFetch(`/notifications/${n.id}/read`, { method: "PUT" });
                                setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                                setUnreadCount(c => Math.max(0, c - 1));
                                window.dispatchEvent(new Event('postclone-refresh-sidebar'));
                              } catch (err: any) { toast.error(err.message); }
                              finally { setActionLoading(null); }
                            }}
                            disabled={actionLoading === n.id}
                            className="flex items-center gap-1 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {actionLoading === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Accept Invitation
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setActionLoading(n.id);
                              try {
                                const res = await apiFetch(`/organizations/invitations/${(n as any).metadata.invitationId}/decline`, { method: 'POST' });
                                if (!res.ok) throw new Error('Failed');
                                toast.info('Invitation declined');
                                await apiFetch(`/notifications/${n.id}/read`, { method: "PUT" });
                                setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                                setUnreadCount(c => Math.max(0, c - 1));
                              } catch (err: any) { toast.error(err.message); }
                              finally { setActionLoading(null); }
                            }}
                            disabled={actionLoading === n.id}
                            className="flex items-center gap-1 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <X className="w-3 h-3" /> Decline
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {!n.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(n.id)}
                          disabled={actionLoading === n.id}
                          className="p-1.5 text-[var(--muted)] hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/10 rounded-md transition-colors"
                          title="Mark as read"
                        >
                          {actionLoading === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={actionLoading === n.id}
                        className="p-1.5 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                        title="Delete"
                      >
                        {actionLoading === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (() => {
            // Compute only the visible page numbers (max 7) — O(1), no large arrays
            const visiblePages: (number | '...')[] = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) visiblePages.push(i);
            } else {
              visiblePages.push(1);
              if (page > 3) visiblePages.push('...');
              const start = Math.max(2, page - 1);
              const end = Math.min(totalPages - 1, page + 1);
              for (let i = start; i <= end; i++) visiblePages.push(i);
              if (page < totalPages - 2) visiblePages.push('...');
              visiblePages.push(totalPages);
            }

            return (
              <div className="flex items-center justify-between mt-4 px-1">
                <p className="text-xs text-[var(--muted)]">
                  Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page <= 1}
                    className="px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {visiblePages.map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-[var(--muted)]">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-md text-xs font-semibold transition-colors ${
                          page === p
                            ? "bg-[var(--color-brand-500)] text-white"
                            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)]"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    className="px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>

                  {/* Page jump */}
                  {totalPages > 7 && (
                    <form
                      className="ml-2 flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.target as HTMLFormElement).elements.namedItem('pageJump') as HTMLInputElement;
                        const val = parseInt(input.value, 10);
                        if (val >= 1 && val <= totalPages) {
                          setPage(val);
                          input.value = '';
                          input.blur();
                        }
                      }}
                    >
                      <span className="text-[10px] text-[var(--muted)]">Go to</span>
                      <input
                        name="pageJump"
                        type="number"
                        min={1}
                        max={totalPages}
                        placeholder={`${page}`}
                        className="w-14 h-7 text-xs text-center bg-[var(--sidebar)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--color-brand-500)] text-[var(--foreground)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </form>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
