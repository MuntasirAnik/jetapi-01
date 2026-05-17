"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { Eye, EyeOff, Loader2, Rocket, ArrowRight, ShieldCheck, Ban, CheckCircle, X } from "lucide-react";
import JetLogo from "@/components/JetLogo";
import { apiFetch } from "@/lib/api";
import { useFeatureFlags } from "@/lib/FeatureFlagContext";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const flags = useFeatureFlags();
  const signupsDisabled = !flags.allow_signups;
  const [policy, setPolicy] = useState<any>(null);

  useEffect(() => {
    apiFetch("/api/auth/password-policy").then(r => r.ok ? r.json() : null).then(d => { if (d) setPolicy(d); }).catch(() => {});
  }, []);

  const policyChecks = useMemo(() => {
    if (!policy) return [];
    const checks: { label: string; pass: boolean }[] = [
      { label: `At least ${policy.minLength} characters`, pass: password.length >= policy.minLength },
    ];
    if (policy.requireUppercase) checks.push({ label: 'Uppercase letter (A-Z)', pass: /[A-Z]/.test(password) });
    if (policy.requireLowercase) checks.push({ label: 'Lowercase letter (a-z)', pass: /[a-z]/.test(password) });
    if (policy.requireNumber) checks.push({ label: 'Number (0-9)', pass: /[0-9]/.test(password) });
    if (policy.requireSpecial) checks.push({ label: 'Special character (!@#$)', pass: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) });
    return checks;
  }, [password, policy]);

  const policyMet = policyChecks.length === 0 || policyChecks.every(c => c.pass);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupsDisabled) {
      toast.error("Registration is currently disabled by the administrator.");
      return;
    }
    if (!policyMet) { toast.error("Password does not meet the policy requirements"); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Registration failed");
      }
      
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event('auth-login'));
      toast.success("Welcome aboard! Account created successfully.");
      router.push("/");
    } catch (err: any) {
      toast.error(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full bg-[var(--background)] flex items-center justify-center relative overflow-hidden font-sans">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-[var(--color-brand-500)]/20 blur-[120px] mix-blend-screen animate-pulse shadow-2xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-500/10 blur-[150px] mix-blend-screen shadow-2xl"></div>
      </div>

      <div className="w-full max-w-[1000px] max-h-[90vh] mx-4 bg-[var(--card)]/60 backdrop-blur-2xl border border-[var(--border)] rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] flex overflow-hidden z-10 anim-scale-in relative">
        
        {/* Left Side: Branding & Marketing */}
        <div className="hidden md:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden bg-gradient-to-br from-[var(--color-brand-500)]/10 to-[var(--background)] border-r border-[var(--border)]">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-brand-600)] flex items-center justify-center shadow-lg shadow-[var(--color-brand-500)]/20 mb-6 drop-shadow-md">
                <JetLogo className="w-8 h-8 text-white drop-shadow-sm" />
              </div>
              <span className="text-3xl font-extrabold tracking-tight text-[var(--foreground)] bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">JetAPI</span>
            </div>
            <h2 className="text-4xl font-bold text-[var(--foreground)] leading-tight mb-4">
              Join the API <br/> <span className="text-[var(--color-brand-500)]">Revolution.</span>
            </h2>
            <p className="text-[var(--muted)] text-lg pr-4">
              Create your account to unlock powerful mocking, seamless execution, and deep collaborative features for your team.
            </p>
          </div>
          
          <div className="relative z-10">
             <div className="flex items-center gap-2 text-sm text-[var(--muted)] font-medium bg-[var(--background)]/50 inline-flex px-4 py-2 rounded-full border border-[var(--border)] backdrop-blur-md">
               <ShieldCheck className="w-4 h-4 text-green-400" /> Start building for free today.
             </div>
          </div>
          
          {/* Decorative mesh/grid background for left side */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] z-0"></div>
        </div>

        {/* Right Side: Register Form */}
        <div className="w-full md:w-1/2 p-5 sm:p-8 flex flex-col justify-center items-center bg-[var(--background)]/40 relative">
          
          <div className="w-full max-w-[360px]">
            <div className="mb-4 text-center">
              <h3 className="text-xl font-bold text-[var(--foreground)] tracking-tight mb-1">Create Account</h3>
              <p className="text-[var(--muted)] text-xs">Sign up to start building your first workspace.</p>
            </div>

            <div className={`${signupsDisabled ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => { if (signupsDisabled) toast.error("Registration is currently disabled by the administrator."); }}
            >
            <div className="flex gap-2 w-full mb-3">
              <button
                type="button"
                onClick={() => toast.info('GitHub login coming soon!')}
                className="flex-1 flex items-center justify-center gap-2 bg-[#24292f] hover:bg-[#30363d] text-white font-semibold px-3 py-2.5 rounded-lg transition-all text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </button>
              <button
                type="button"
                onClick={() => toast.info('Google login coming soon!')}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--sidebar)] hover:bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] font-semibold px-3 py-2.5 rounded-lg transition-all text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full mb-3">
              <div className="flex-1 h-px bg-[var(--border)]"></div>
              <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[var(--border)]"></div>
            </div>

            <form onSubmit={handleRegister} className="flex flex-col gap-3 w-full">
            <div className="group">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1 block group-focus-within:text-[var(--color-brand-500)] transition-colors">Full Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="John Doe"
                className="w-full bg-[var(--sidebar)] border border-[var(--border)] px-3 py-2 rounded-lg outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/10 text-[var(--foreground)] text-sm transition-all"
                required 
              />
            </div>

            <div className="group">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1 block group-focus-within:text-[var(--color-brand-500)] transition-colors">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="developer@company.com"
                className="w-full bg-[var(--sidebar)] border border-[var(--border)] px-3 py-2 rounded-lg outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/10 text-[var(--foreground)] text-sm transition-all"
                required 
              />
            </div>

            <div className="group">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1 block group-focus-within:text-[var(--color-brand-500)] transition-colors">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="w-full bg-[var(--sidebar)] border border-[var(--border)] px-3 py-2 pr-10 rounded-lg outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/10 text-[var(--foreground)] text-sm transition-all tracking-widest placeholder:tracking-normal"
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Policy Checklist */}
            {policy && password.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
                {policyChecks.map((c, i) => (
                  <div key={i} className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${c.pass ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                    {c.pass ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3 opacity-40" />}
                    {c.label}
                  </div>
                ))}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || (password.length > 0 && !policyMet)}
              className="w-full bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-500)] hover:from-[var(--color-brand-500)] hover:to-[var(--color-brand-400)] text-white font-bold px-4 py-2.5 mt-1 rounded-lg shadow-[0_0_20px_rgba(var(--color-brand-500-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-brand-500-rgb),0.5)] transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 group text-sm"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Registering...</>
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
          </div>

           {signupsDisabled && (
             <div className="mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
               <Ban className="w-4 h-4 text-red-400 flex-shrink-0" />
               <p className="text-xs text-red-400 font-medium">Registration is currently disabled by the administrator.</p>
             </div>
           )}

          <div className="mt-4 text-center w-full">
            <p className="text-sm text-[var(--muted)] font-medium">
              Already have an account? <Link href="/login" className="text-[var(--foreground)] hover:text-[var(--color-brand-500)] font-bold transition-colors ml-1">Sign in instead</Link>
            </p>
          </div>
          </div>
        </div>

      </div>
    </div>
  );
}
