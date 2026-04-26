"use client";
import { useRouter } from "next/navigation";
import { X, Rocket, ArrowRight } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  currentPlan?: string;
  requiredPlan?: string;
}

export default function UpgradeModal({ isOpen, onClose, feature, currentPlan = "Free", requiredPlan = "Pro" }: UpgradeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1a1a22] border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-violet-500/20 rounded-full blur-[60px]" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-500 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative p-6 pt-8">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20">
              <Rocket className="w-8 h-8 text-violet-400" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-center mb-2">Upgrade to {requiredPlan}</h2>
          <p className="text-sm text-gray-400 text-center mb-6">
            <span className="text-white font-semibold">{feature}</span> is available on the <span className="text-violet-400 font-semibold">{requiredPlan}</span> plan.
            Upgrade now to unlock this and more features.
          </p>

          {/* Comparison */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wider mb-2">Current</p>
              <p className="text-sm font-bold text-gray-400">{currentPlan}</p>
            </div>
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
              <p className="text-[10px] font-bold uppercase text-violet-400 tracking-wider mb-2">Recommended</p>
              <p className="text-sm font-bold text-white">{requiredPlan}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={() => { onClose(); router.push("/pricing"); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-500 hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25 flex items-center justify-center gap-1.5"
            >
              Upgrade <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
