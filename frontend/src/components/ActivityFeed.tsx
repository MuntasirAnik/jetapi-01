"use client";
import { useState, useEffect } from "react";
import { Activity, FilePlus, Edit2, Trash2, Share2, MessageSquare, RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ActivityItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  collectionId: string;
  metadata: any;
  createdAt: string;
}

function getActionIcon(action: string) {
  switch (action) {
    case "CREATED": return <FilePlus className="w-3 h-3 text-green-500" />;
    case "UPDATED": return <Edit2 className="w-3 h-3 text-blue-500" />;
    case "DELETED": return <Trash2 className="w-3 h-3 text-red-500" />;
    case "SHARED": return <Share2 className="w-3 h-3 text-purple-500" />;
    case "UNSHARED": return <Share2 className="w-3 h-3 text-orange-500" />;
    case "RESTORED": return <RotateCcw className="w-3 h-3 text-teal-500" />;
    case "COMMENTED": return <MessageSquare className="w-3 h-3 text-[var(--color-brand-500)]" />;
    default: return <Activity className="w-3 h-3 text-[var(--muted)]" />;
  }
}

function getActionLabel(action: string, entityType: string): string {
  const type = entityType.toLowerCase();
  switch (action) {
    case "CREATED": return `created a ${type}`;
    case "UPDATED": return `updated a ${type}`;
    case "DELETED": return `deleted a ${type}`;
    case "SHARED": return `shared a ${type}`;
    case "UNSHARED": return `removed access to a ${type}`;
    case "RESTORED": return `restored a ${type}`;
    case "COMMENTED": return `commented on a ${type === 'comment' ? 'request' : type}`;
    default: return `performed ${action.toLowerCase()} on a ${type}`;
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const groups: Record<string, ActivityItem[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  items.forEach(item => {
    const d = new Date(item.createdAt).toDateString();
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

export default function ActivityFeed({ onOpenRequest }: { onOpenRequest?: (req: any) => void }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/activity/recent");
      if (res.ok) {
        setActivities(await res.json());
      }
    } catch (e) {
      console.error("Failed to load activities", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
    // Poll every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const grouped = groupByDate(activities);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-3 pb-2 flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--color-brand-500)]" />
        <span className="font-semibold text-xs tracking-wide">Activity</span>
        <button
          onClick={fetchActivities}
          disabled={loading}
          className="ml-auto p-1 hover:bg-[var(--card)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
        {loading && !activities.length ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--muted)] gap-2 py-12">
            <Activity className="w-10 h-10 opacity-20" />
            <p className="text-xs font-medium">No activity yet</p>
            <p className="text-[10px] opacity-60 max-w-[180px] text-center">
              Create, edit, or share requests and activity will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(group => (
              <div key={group.label}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-1 mb-2">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--card)] transition-colors cursor-default group"
                    >
                      {/* Action icon */}
                      <div className="mt-0.5 p-1 rounded-md bg-[var(--background)] border border-[var(--border)] shrink-0">
                        {getActionIcon(item.action)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] leading-snug">
                          <span className="font-bold text-[var(--foreground)]">{item.userName}</span>{" "}
                          <span className="text-[var(--muted)]">{getActionLabel(item.action, item.entityType)}</span>
                        </p>
                        {item.entityName && (
                          <p className="text-[10px] text-[var(--foreground)] font-mono mt-0.5 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                            {item.entityName}
                          </p>
                        )}
                        <p className="text-[9px] text-[var(--muted)] mt-0.5 opacity-60">
                          {timeAgo(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
