"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { Eye, EyeOff, Loader2, Rocket, ArrowRight, ShieldCheck } from "lucide-react";
import JetLogo from "@/components/JetLogo";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("Invalid credentials");
      
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event('auth-login'));
      toast.success("Welcome back to JetAPI");
      
      // Redirect based on role
      if (data.user.role === 'SUPER_ADMIN') {
        router.push("/admin");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed. Please check your credentials.");
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

      <div className="w-full max-w-[1000px] h-[600px] mx-4 bg-[var(--card)]/60 backdrop-blur-2xl border border-[var(--border)] rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] flex overflow-hidden z-10 anim-scale-in relative">
        
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
              Design, Test, and <br/> SHIP your APIs <br/> <span className="text-[var(--color-brand-500)]">Faster.</span>
            </h2>
            <p className="text-[var(--muted)] text-lg pr-4">
              The ultimate collaborative platform for backend engineering teams. Mock, generate, and execute seamlessly.
            </p>
          </div>
          
          <div className="relative z-10">
             <div className="flex items-center gap-2 text-sm text-[var(--muted)] font-medium bg-[var(--background)]/50 inline-flex px-4 py-2 rounded-full border border-[var(--border)] backdrop-blur-md">
               <ShieldCheck className="w-4 h-4 text-green-400" /> Enterprise-grade Security
             </div>
          </div>
          
          {/* Decorative mesh/grid background for left side */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] z-0"></div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-10 sm:p-14 flex flex-col justify-center items-center bg-[var(--background)]/40 relative">
          
          <div className="w-full max-w-[360px]">
            <div className="mb-10 text-center">
              <h3 className="text-2xl font-bold text-[var(--foreground)] tracking-tight mb-2">Welcome Back</h3>
              <p className="text-[var(--muted)] text-sm">Please sign in to access your workspaces.</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5 w-full">
            <div className="group">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5 block group-focus-within:text-[var(--color-brand-500)] transition-colors">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="developer@company.com"
                className="w-full bg-[var(--sidebar)] border border-[var(--border)] px-4 py-3 rounded-xl outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-500)]/10 text-[var(--foreground)] text-sm transition-all duration-300 shadow-inner"
                required 
              />
            </div>

            <div className="group">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] block group-focus-within:text-[var(--color-brand-500)] transition-colors">Password</label>
                <Link href="/forgot-password" className="text-xs text-[var(--color-brand-500)] hover:text-[var(--color-brand-400)] transition-colors font-semibold">Forgot?</Link>
              </div>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="w-full bg-[var(--sidebar)] border border-[var(--border)] px-4 py-3 pr-12 rounded-xl outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-500)]/10 text-[var(--foreground)] text-sm transition-all duration-300 shadow-inner tracking-widest placeholder:tracking-normal"
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-500)] hover:from-[var(--color-brand-500)] hover:to-[var(--color-brand-400)] text-white font-bold px-4 py-3 mt-4 rounded-xl shadow-[0_0_20px_rgba(var(--color-brand-500-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-brand-500-rgb),0.5)] transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Authenticating...</>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center w-full mt-8">
            <p className="text-sm text-[var(--muted)] font-medium">
              Don't have an account? <Link href="/register" className="text-[var(--foreground)] hover:text-[var(--color-brand-500)] font-bold transition-colors ml-1">Create one now</Link>
            </p>
          </div>
          </div>
        </div>

      </div>
    </div>
  );
}
