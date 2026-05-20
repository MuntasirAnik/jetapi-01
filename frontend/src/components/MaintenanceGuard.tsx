"use client";

import { useState, useEffect } from "react";

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
        setIsAdmin(true);
      }
    } catch {}

    const checkMaintenance = async () => {
      try {
        const API = process.env.NEXT_PUBLIC_API_URL ?? '';
        const res = await fetch(`${API}/api/maintenance`);
        if (res.ok) {
          const data = await res.json();
          setMaintenance(data);
        }
      } catch {
        setMaintenance({ enabled: false, message: "" });
      }
    };

    // Defer initial check so it doesn't compete with critical rendering
    const initialDelay = setTimeout(checkMaintenance, 500);
    const interval = setInterval(checkMaintenance, 15000);
    return () => { clearTimeout(initialDelay); clearInterval(interval); };
  }, []);

  // Animate dots — ONLY when maintenance is actually enabled
  useEffect(() => {
    if (!maintenance?.enabled) return;
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, [maintenance?.enabled]);

  if (maintenance === null) return <>{children}</>;

  if (maintenance.enabled && !isAdmin) {
    return (
      <div className="maintenance-page">
        <style>{`
          .maintenance-page {
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: #0a0b0f;
            overflow: hidden;
            font-family: 'Inter', -apple-system, sans-serif;
          }

          /* Animated gradient orbs */
          .maintenance-page .orb {
            position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15;
            animation: orbFloat 8s ease-in-out infinite;
          }
          .maintenance-page .orb-1 {
            width: 500px; height: 500px; top: -150px; left: -100px;
            background: linear-gradient(135deg, #6366f1, #a78bfa);
            animation-delay: 0s;
          }
          .maintenance-page .orb-2 {
            width: 400px; height: 400px; bottom: -100px; right: -100px;
            background: linear-gradient(135deg, #f59e0b, #f97316);
            animation-delay: -3s;
          }
          .maintenance-page .orb-3 {
            width: 300px; height: 300px; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #3b82f6, #06b6d4);
            animation-delay: -5s;
          }

          @keyframes orbFloat {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -40px) scale(1.1); }
            66% { transform: translate(-20px, 30px) scale(0.9); }
          }

          /* Grid lines */
          .maintenance-page .grid-bg {
            position: absolute; inset: 0;
            background-image:
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
            background-size: 60px 60px;
            mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black, transparent);
          }

          /* Main content */
          .maintenance-page .content {
            position: relative; z-index: 10;
            max-width: 540px; width: 100%; text-align: center; padding: 2rem;
          }

          /* Gear animation */
          .maintenance-page .gear-wrap {
            position: relative; width: 120px; height: 120px; margin: 0 auto 2.5rem;
          }
          .maintenance-page .gear-ring {
            position: absolute; inset: 0; border-radius: 50%;
            border: 2px solid transparent;
            border-top-color: rgba(245, 158, 11, 0.6);
            border-right-color: rgba(245, 158, 11, 0.2);
            animation: spin 3s linear infinite;
          }
          .maintenance-page .gear-ring-2 {
            position: absolute; inset: 8px; border-radius: 50%;
            border: 2px solid transparent;
            border-bottom-color: rgba(99, 102, 241, 0.5);
            border-left-color: rgba(99, 102, 241, 0.2);
            animation: spin 4s linear infinite reverse;
          }
          .maintenance-page .gear-ring-3 {
            position: absolute; inset: 16px; border-radius: 50%;
            border: 2px solid transparent;
            border-top-color: rgba(6, 182, 212, 0.4);
            animation: spin 5s linear infinite;
          }
          .maintenance-page .gear-icon {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          }
          .maintenance-page .gear-icon svg {
            width: 40px; height: 40px; color: #f59e0b; opacity: 0.9;
            animation: pulse-gear 2s ease-in-out infinite;
          }
          .maintenance-page .gear-glow {
            position: absolute; inset: 20px; border-radius: 50%;
            background: radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%);
            animation: pulse-gear 2s ease-in-out infinite;
          }

          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-gear {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.05); opacity: 1; }
          }

          .maintenance-page h1 {
            font-size: 2.25rem; font-weight: 900; color: #f1f5f9;
            margin-bottom: 0.75rem; letter-spacing: -0.03em;
            line-height: 1.2;
          }
          .maintenance-page h1 span {
            background: linear-gradient(135deg, #f59e0b, #f97316);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .maintenance-page .subtitle {
            font-size: 1.05rem; color: #94a3b8; line-height: 1.7;
            margin-bottom: 2rem; max-width: 420px; margin-left: auto; margin-right: auto;
          }

          /* Custom message card */
          .maintenance-page .msg-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px; padding: 1.25rem 1.5rem;
            margin-bottom: 2rem;
            backdrop-filter: blur(10px);
          }
          .maintenance-page .msg-label {
            font-size: 0.65rem; font-weight: 700; color: #64748b;
            text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem;
            display: flex; align-items: center; gap: 6px;
          }
          .maintenance-page .msg-label::before {
            content: ''; width: 6px; height: 6px; border-radius: 50%;
            background: #f59e0b; animation: blink 1.5s ease-in-out infinite;
          }
          .maintenance-page .msg-text {
            font-size: 0.95rem; color: #cbd5e1; line-height: 1.6;
          }

          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }

          /* Status pills */
          .maintenance-page .status-row {
            display: flex; align-items: center; justify-content: center; gap: 12px;
            flex-wrap: wrap;
          }
          .maintenance-page .status-pill {
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 999px; padding: 6px 14px; font-size: 0.75rem; font-weight: 600; color: #94a3b8;
          }
          .maintenance-page .status-dot {
            width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;
            animation: blink 1.5s ease-in-out infinite;
          }
          .maintenance-page .status-pill.auto {
            border-color: rgba(34,197,94,0.2);
          }
          .maintenance-page .status-pill.auto .status-dot {
            background: #22c55e;
            animation: blink 2s ease-in-out infinite;
          }

          /* Progress bar */
          .maintenance-page .progress-wrap {
            margin-top: 2.5rem; max-width: 200px; margin-left: auto; margin-right: auto;
          }
          .maintenance-page .progress-bar {
            height: 3px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden;
          }
          .maintenance-page .progress-fill {
            height: 100%; width: 30%; border-radius: 999px;
            background: linear-gradient(90deg, #f59e0b, #f97316);
            animation: progress-slide 2s ease-in-out infinite;
          }
          @keyframes progress-slide {
            0% { transform: translateX(-100%); width: 30%; }
            50% { width: 60%; }
            100% { transform: translateX(400%); width: 30%; }
          }

          .maintenance-page .progress-text {
            margin-top: 0.75rem; font-size: 0.7rem; color: #475569; letter-spacing: 0.05em;
          }

          /* Footer */
          .maintenance-page .footer {
            position: absolute; bottom: 2rem; left: 0; right: 0; text-align: center;
            font-size: 0.7rem; color: #334155;
          }
          .maintenance-page .footer strong {
            color: #475569;
          }
        `}</style>

        {/* Background effects */}
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
        <div className="grid-bg"></div>

        {/* Content */}
        <div className="content">
          {/* Animated rings */}
          <div className="gear-wrap">
            <div className="gear-ring"></div>
            <div className="gear-ring-2"></div>
            <div className="gear-ring-3"></div>
            <div className="gear-glow"></div>
            <div className="gear-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" opacity="0"/>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
              </svg>
            </div>
          </div>

          <h1>We&apos;ll Be <span>Right Back</span></h1>

          <p className="subtitle">
            Our team is working hard to improve your experience. We apologize for any inconvenience and appreciate your patience.
          </p>

          {/* Custom message from admin */}
          {maintenance.message && (
            <div className="msg-card">
              <div className="msg-label">From the team</div>
              <div className="msg-text">{maintenance.message}</div>
            </div>
          )}

          {/* Status */}
          <div className="status-row">
            <div className="status-pill">
              <div className="status-dot"></div>
              Maintenance in progress{'.'.repeat(dots)}
            </div>
            <div className="status-pill auto">
              <div className="status-dot"></div>
              Auto-refresh enabled
            </div>
          </div>

          {/* Animated progress */}
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
            <div className="progress-text">Working on it — hang tight!</div>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          Powered by <strong>JetAPI</strong> — We&apos;ll be back before you know it ✨
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
