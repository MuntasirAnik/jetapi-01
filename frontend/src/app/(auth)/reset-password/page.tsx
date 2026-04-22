"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Invalid or missing reset token");
      router.push("/login");
    }
  }, [token, router]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || "Failed to reset password");
      
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-md bg-[var(--card)] p-8 rounded border border-[var(--border)] shadow-xl animate-in zoom-in-95 duration-300">
        
        {success ? (
          <div className="flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Password Reset Complete</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              Your password has been successfully updated. You can now sign in with your new credentials.
            </p>
            <button 
              onClick={() => router.push("/login")}
              className="w-full bg-[var(--color-brand-500)] text-white font-bold py-2 rounded hover:bg-[var(--color-brand-600)] transition-colors"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] rounded-full flex items-center justify-center">
                <ShieldAlert className="w-8 h-8" />
              </div>
            </div>

            <h1 className="text-2xl font-bold mb-2 text-center text-[var(--foreground)]">Create New Password</h1>
            <p className="text-sm text-center text-[var(--muted)] mb-6">
              Your new password must be securely formed.
            </p>

            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">New Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full bg-[var(--sidebar)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                  required 
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">Confirm Password</label>
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  className="w-full bg-[var(--sidebar)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                  required 
                />
              </div>
              
              <button 
                type="submit" 
                disabled={loading || !password || !confirmPassword}
                className="w-full bg-[var(--color-brand-500)] text-white font-bold py-2 mt-2 rounded hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[var(--background)]">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
