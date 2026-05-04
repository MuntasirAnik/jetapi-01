"use client";
import { useState, useEffect } from "react";
import { Megaphone } from "lucide-react";

const ANNOUNCEMENTS = [
  "🚀 JetAPI v2.0 — History panel is now live! Track all your requests automatically.",
  "💡 Tip: Use {{variables}} in your URLs and headers for dynamic environments.",
  "⌨️ Shortcut: Press Ctrl+S (⌘+S) to save your request instantly.",
  "🔗 Share collections with your team — right-click any collection → Share.",
  "🌙 Toggle between dark and light themes from the top bar.",
  "📦 Import your Postman collections directly into JetAPI with one click.",
  "⚡ Pro tip: Use the Console panel to monitor all request/response traffic in real-time.",
];

export default function AnnouncementTicker() {
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const check = () => {
      const off = localStorage.getItem("jetapi_announcements_off");
      setVisible(off !== "true");
    };
    check();
    window.addEventListener("jetapi-announcements-toggle", check);
    return () => window.removeEventListener("jetapi-announcements-toggle", check);
  }, []);

  if (!visible) return null;

  const tickerText = ANNOUNCEMENTS.join("     •     ");

  return (
    <>
      <style>{`
        @keyframes jetapiTicker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
      <div className="relative h-7 bg-[var(--sidebar)] border-b border-[var(--border)] text-[var(--muted)] overflow-hidden flex items-center shrink-0 z-20">
        {/* Left label */}
        <div className="flex items-center gap-1.5 px-3 shrink-0 z-10 bg-[var(--sidebar)] pr-4">
          <Megaphone className="w-3 h-3 text-[var(--color-brand-500)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-500)] opacity-80">What&apos;s New</span>
        </div>

        {/* Scrolling text */}
        <div 
          className="flex-1 overflow-hidden relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--sidebar)] to-transparent z-10 pointer-events-none"></div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--sidebar)] to-transparent z-10 pointer-events-none"></div>
          <div 
            style={{ 
              display: 'flex', 
              whiteSpace: 'nowrap',
              animation: 'jetapiTicker 45s linear infinite',
              animationPlayState: hovered ? 'paused' : 'running',
            }}
          >
            <span className="text-[11px] font-medium" style={{ flexShrink: 0 }}>{tickerText}</span>
            <span className="text-[11px] font-medium" style={{ flexShrink: 0, marginLeft: 50 }}>{tickerText}</span>
          </div>
        </div>
      </div>
    </>
  );
}
