"use client";
import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Trash2, Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  content: string;
  createdAt: string;
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

export default function CommentsPanel({ request, onClose }: { request: any; onClose: () => void }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(340);
  const isDragging = useRef(false);

  const fetchComments = async () => {
    if (!request?.id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/comments/request/${request.id}`);
      if (res.ok) setComments(await res.json());
    } catch (e) {
      console.error("Failed to load comments", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [request?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handleSend = async () => {
    if (!newComment.trim() || !request?.id) return;
    setSending(true);
    try {
      const res = await apiFetch("/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          collectionId: request.collectionId,
          content: newComment.trim(),
        }),
      });
      if (res.ok) {
        setNewComment("");
        fetchComments();
      }
    } catch (e) {
      console.error("Failed to send comment", e);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete comment", e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(280, Math.min(600, startWidth + (startX - ev.clientX)));
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div
      className="h-full border-l border-[var(--border)] bg-[var(--sidebar)] flex flex-col overflow-hidden shrink-0 relative panel-slide-right"
      style={{ width: panelWidth }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-brand-500)] z-10 transition-colors"
        onMouseDown={handleDragStart}
      />

      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
        <MessageSquare className="w-4 h-4 text-[var(--color-brand-500)]" />
        <span className="text-xs font-semibold">Comments</span>
        <span className="text-[10px] text-[var(--muted)] font-mono ml-1">{comments.length}</span>
        <button
          onClick={onClose}
          className="ml-auto p-1 hover:bg-[var(--card)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Request context */}
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            request.method === 'GET' ? 'text-green-500 bg-green-500/10' :
            request.method === 'POST' ? 'text-orange-500 bg-orange-500/10' :
            request.method === 'PUT' ? 'text-blue-500 bg-blue-500/10' :
            request.method === 'DELETE' ? 'text-red-500 bg-red-500/10' :
            'text-[var(--muted)] bg-[var(--card)]'
          }`}>{request.method}</span>
          <span className="text-[11px] font-medium truncate">{request.name}</span>
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--muted)] gap-2 py-12">
            <MessageSquare className="w-8 h-8 opacity-20" />
            <p className="text-xs font-medium">No comments yet</p>
            <p className="text-[10px] opacity-60 text-center max-w-[200px]">
              Start a discussion about this endpoint with your team.
            </p>
          </div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="group">
              <div className="flex items-start gap-2.5">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-brand-600)] flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-white">{getInitials(comment.userName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold">{comment.userName}</span>
                    <span className="text-[9px] text-[var(--muted)]">{timeAgo(comment.createdAt)}</span>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-[var(--muted)] hover:text-red-500 transition-all"
                      title="Delete comment"
                    >
                      {deletingId === comment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--foreground)] mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)] shrink-0">
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a comment..."
            rows={2}
            className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] placeholder-[var(--muted)] resize-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/10 outline-none transition-all"
          />
          <button
            onClick={handleSend}
            disabled={sending || !newComment.trim()}
            className="self-end p-2.5 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[9px] text-[var(--muted)] mt-1.5 opacity-60">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  );
}
