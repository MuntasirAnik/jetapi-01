"use client";
import { useState, useEffect } from "react";
import { apiFetch, getApiError } from "@/lib/api";
import { Users, X, Check, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

export default function InvitationBanner() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadInvitations = async () => {
    try {
      const res = await apiFetch('/organizations/invitations/mine');
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } catch { }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const handleAccept = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await apiFetch(`/organizations/invitations/${id}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to accept"));
      const data = await res.json();
      toast.success(`You've joined ${data.organizationName}!`);
      setInvitations(prev => prev.filter(i => i.id !== id));
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await apiFetch(`/organizations/invitations/${id}/decline`, { method: 'POST' });
      if (!res.ok) throw new Error("Failed to decline");
      setInvitations(prev => prev.filter(i => i.id !== id));
      toast.info("Invitation declined");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {invitations.map(inv => (
        <div
          key={inv.id}
          className="bg-[var(--color-brand-500)]/10 border border-[var(--color-brand-500)]/20 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm animate-in slide-in-from-top-2"
        >
          <Users className="w-4 h-4 text-[var(--color-brand-500)] shrink-0" />
          <span className="flex-1">
            You've been invited to join <strong className="text-[var(--color-brand-500)]">{inv.organizationName}</strong> as <strong>{inv.role}</strong>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleAccept(inv.id)}
              disabled={processingId === inv.id}
              className="flex items-center gap-1 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {processingId === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Accept
            </button>
            <button
              onClick={() => handleDecline(inv.id)}
              disabled={processingId === inv.id}
              className="flex items-center gap-1 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
