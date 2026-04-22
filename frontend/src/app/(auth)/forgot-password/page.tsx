"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || "Failed to send reset link");
      
      toast.success(data.message || "Reset link sent!");
      
      // FOR LOCAL DEV FEEDBACK
      if (data.dev_token) {
        toast.info(
          <div className="flex flex-col gap-1">
            <span className="font-bold">DEV MODE MOCK EMAIL:</span>
            <span className="text-xs break-all">localhost:3000/reset-password?token={data.dev_token}</span>
          </div>,
          { autoClose: false }
        );
      }
      
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-md bg-[var(--card)] p-8 rounded border border-[var(--border)] shadow-xl animate-in zoom-in-95 duration-300">
        
        <button onClick={() => router.back()} className="text-[var(--muted)] hover:text-[var(--foreground)] mb-6 flex items-center gap-1 text-sm font-semibold transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </button>

        <div className="flex justify-center mb-6">
           <div className="w-16 h-16 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] rounded-full flex items-center justify-center">
             <ShieldCheck className="w-8 h-8" />
           </div>
        </div>

        <h1 className="text-2xl font-bold mb-2 text-center text-[var(--foreground)]">Forgot Password?</h1>
        <p className="text-sm text-center text-[var(--muted)] mb-6">
          Enter your registered email address and we'll send you a link to reset your password.
        </p>

        {success ? (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center text-green-500 text-sm font-semibold">
            If an account exists for {email}, a recovery link has been sent. Check your inbox (or the dev console).
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-[var(--muted)] font-semibold uppercase mb-1 block">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="w-full bg-[var(--sidebar)] border border-[var(--border)] p-2 rounded outline-none focus:border-[var(--color-brand-500)] text-sm"
                required 
                placeholder="developer@company.com"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading || !email}
              className="w-full bg-[var(--color-brand-500)] text-white font-bold py-2 mt-2 rounded hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50"
            >
              {loading ? "Sending link..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
