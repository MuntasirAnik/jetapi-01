"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, X, Send, Bug, Lightbulb, MessageCircle, HelpCircle, Loader2, ChevronDown, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";

const TICKET_TYPES = [
  { id: "bug", label: "Bug Report", icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { id: "feature", label: "Feature Request", icon: Lightbulb, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { id: "feedback", label: "General Feedback", icon: MessageCircle, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  { id: "other", label: "Other", icon: HelpCircle, color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
];

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"form" | "tickets">("form");
  const [type, setType] = useState("feedback");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  // Offset layout position if the right sidebar drawer panel is open
  const [isShifted, setIsShifted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPanel = () => {
      const hasPanel = document.body.classList.contains("right-panel-open");
      setIsShifted(hasPanel);
    };

    checkPanel();

    const observer = new MutationObserver(checkPanel);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  const loadMyTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await apiFetch("/feedback/my-tickets");
      if (res.ok) setMyTickets(await res.json());
    } catch {}
    finally { setLoadingTickets(false); }
  };

  useEffect(() => {
    if (isOpen && view === "tickets") loadMyTickets();
  }, [isOpen, view]);

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.warning("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, type }),
      });
      if (res.ok) {
        toast.success("Feedback submitted! We'll get back to you soon.");
        setSubject("");
        setDescription("");
        setType("feedback");
        setIsOpen(false);
      } else {
        toast.error("Failed to submit feedback");
      }
    } catch { toast.error("Error submitting feedback"); }
    finally { setSubmitting(false); }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "open": return <Clock className="w-3.5 h-3.5 text-blue-400" />;
      case "in_progress": return <ArrowRight className="w-3.5 h-3.5 text-yellow-400" />;
      case "resolved": return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
      case "closed": return <X className="w-3.5 h-3.5 text-gray-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "open": return "text-blue-400";
      case "in_progress": return "text-yellow-400";
      case "resolved": return "text-green-400";
      case "closed": return "text-gray-500";
      default: return "text-blue-400";
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => { setIsOpen(true); setView("form"); setSelectedTicket(null); }}
        className={`fixed bottom-6 z-[900] w-12 h-12 rounded-full bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 btn-spring ${
          isShifted ? 'right-[404px]' : 'right-6'
        }`}
        title="Send Feedback"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Modal */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[999] flex items-end justify-end p-6 modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-[420px] max-h-[600px] shadow-2xl flex flex-col modal-content overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--color-brand-500)]" />
                <h3 className="text-sm font-bold">Feedback</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setView("form"); setSelectedTicket(null); }}
                  className={`text-[10px] px-3 py-1 rounded-full font-medium transition-colors ${view === "form" ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]" : "text-[var(--muted)] hover:bg-[var(--sidebar)]"}`}
                >New</button>
                <button
                  onClick={() => { setView("tickets"); setSelectedTicket(null); }}
                  className={`text-[10px] px-3 py-1 rounded-full font-medium transition-colors ${view === "tickets" ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]" : "text-[var(--muted)] hover:bg-[var(--sidebar)]"}`}
                >My Tickets {myTickets.length > 0 && <span className="ml-1 bg-[var(--color-brand-500)] text-white rounded-full px-1.5 text-[9px]">{myTickets.length}</span>}</button>
                <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-[var(--border)] ml-2"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {view === "form" ? (
                <div className="space-y-4">
                  {/* Type Selector */}
                  <div>
                    <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-semibold mb-2 block">Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TICKET_TYPES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setType(t.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${type === t.id ? t.color + " border-current" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--sidebar)]"}`}
                        >
                          <t.icon className="w-3.5 h-3.5" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-semibold mb-2 block">Subject</label>
                    <input
                      type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary..."
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-semibold mb-2 block">Description</label>
                    <textarea
                      value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your issue or suggestion in detail..."
                      rows={5}
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] resize-none outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit} disabled={submitting || !subject.trim() || !description.trim()}
                    className="w-full bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors btn-spring"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? "Submitting..." : "Submit Feedback"}
                  </button>
                </div>
              ) : selectedTicket ? (
                /* Ticket Detail View */
                <div>
                  <button onClick={() => setSelectedTicket(null)} className="text-xs text-[var(--color-brand-500)] hover:underline mb-3 flex items-center gap-1">
                    ← Back to tickets
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    {statusIcon(selectedTicket.status)}
                    <span className={`text-[10px] font-semibold uppercase ${statusColor(selectedTicket.status)}`}>{selectedTicket.status.replace("_", " ")}</span>
                  </div>
                  <h4 className="text-sm font-bold mb-2">{selectedTicket.subject}</h4>
                  <p className="text-xs text-[var(--muted)] mb-3">{new Date(selectedTicket.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>

                  {/* Admin Reply */}
                  {selectedTicket.adminReply ? (
                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 mt-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Send className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] font-semibold text-green-400">Admin Reply</span>
                        {selectedTicket.repliedAt && <span className="text-[10px] text-[var(--muted)]">• {new Date(selectedTicket.repliedAt).toLocaleDateString()}</span>}
                      </div>
                      <p className="text-xs text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{selectedTicket.adminReply}</p>
                    </div>
                  ) : (
                    <div className="bg-[var(--sidebar)] border border-[var(--border)] rounded-lg p-3 mt-3 text-center">
                      <Clock className="w-5 h-5 text-[var(--muted)] mx-auto mb-1.5 opacity-40" />
                      <p className="text-xs text-[var(--muted)]">Awaiting admin response</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Tickets List */
                <div>
                  {loadingTickets ? (
                    <div className="flex items-center justify-center py-10 text-[var(--muted)]"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                  ) : myTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-[var(--muted)] gap-2">
                      <MessageSquare className="w-10 h-10 opacity-15" />
                      <p className="text-xs">No tickets yet</p>
                      <button onClick={() => setView("form")} className="text-xs text-[var(--color-brand-500)] hover:underline mt-1">Submit your first feedback</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {myTickets.map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTicket(t)}
                          className="w-full text-left bg-[var(--sidebar)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--color-brand-500)]/30 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {statusIcon(t.status)}
                              <span className={`text-[10px] font-semibold uppercase ${statusColor(t.status)}`}>{t.status.replace("_", " ")}</span>
                            </div>
                            <span className="text-[10px] text-[var(--muted)]">{new Date(t.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs font-medium text-[var(--foreground)] truncate">{t.subject}</p>
                          {t.adminReply && (
                            <div className="flex items-center gap-1 mt-1.5">
                              <Send className="w-3 h-3 text-green-500" />
                              <span className="text-[10px] text-green-400">Admin replied</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
