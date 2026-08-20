"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Users, Loader2, CheckCircle2, XCircle, LogIn } from "lucide-react";
import { toast } from "react-toastify";

export default function JoinTeamPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [teamName, setTeamName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const join = async () => {
      // Check if user is logged in
      const authToken = localStorage.getItem('token');
      if (!authToken) {
        setStatus('login');
        return;
      }

      try {
        const res = await apiFetch(`/organizations/join/${token}`, {
          method: 'POST',
        });

        if (res.ok) {
          const data = await res.json();
          setTeamName(data.organizationName || 'the team');
          setStatus('success');
          toast.success(`You've joined ${data.organizationName}!`);
          // Refresh sidebar after a brief delay
          setTimeout(() => {
            window.dispatchEvent(new Event('postclone-refresh-sidebar'));
          }, 500);
        } else {
          const err = await res.json();
          setErrorMessage(err.message || 'Failed to join team');
          setStatus('error');
        }
      } catch (e: any) {
        setErrorMessage(e.message || 'Something went wrong');
        setStatus('error');
      }
    };

    if (token) join();
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center text-center gap-6">
        
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-brand-500)]/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[var(--color-brand-500)] animate-spin" />
            </div>
            <div>
              <h1 className="text-xl font-bold mb-2">Joining Team...</h1>
              <p className="text-sm text-[var(--muted)]">Please wait while we process your invite link.</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold mb-2">Welcome to {teamName}! 🎉</h1>
              <p className="text-sm text-[var(--muted)]">You've successfully joined the team. You now have access to all shared workspaces and collections.</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold mb-2">Unable to Join</h1>
              <p className="text-sm text-[var(--muted)]">{errorMessage}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full bg-[var(--sidebar)] border border-[var(--border)] hover:bg-[var(--border)] py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'login' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-brand-500)]/10 flex items-center justify-center">
              <LogIn className="w-8 h-8 text-[var(--color-brand-500)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold mb-2">Sign In Required</h1>
              <p className="text-sm text-[var(--muted)]">You need to sign in or create an account before joining this team.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => router.push(`/login?redirect=/join/${token}`)}
                className="w-full bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push(`/register?redirect=/join/${token}`)}
                className="w-full bg-[var(--sidebar)] border border-[var(--border)] hover:bg-[var(--border)] py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                Create Account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
