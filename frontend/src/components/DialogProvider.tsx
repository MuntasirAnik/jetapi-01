"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { AlertCircle, HelpCircle } from "lucide-react";

type DialogContextType = {
  confirmDialog: (title: string, message?: string) => Promise<boolean>;
  promptDialog: (title: string, defaultValue?: string) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within DialogProvider");
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, title: string, message: string, resolve: (v: boolean) => void} | null>(null);
  const [promptState, setPromptState] = useState<{isOpen: boolean, title: string, value: string, resolve: (v: string | null) => void} | null>(null);

  const confirmDialog = (title: string, message: string = "") => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ isOpen: true, title, message, resolve });
    });
  };

  const promptDialog = (title: string, defaultValue: string = "") => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ isOpen: true, title, value: defaultValue, resolve });
    });
  };

  const handleConfirmClose = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  const handlePromptClose = (result: boolean) => {
    if (promptState) {
      if (result) {
        promptState.resolve(promptState.value);
      } else {
        promptState.resolve(null);
      }
      setPromptState(null);
    }
  };

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      
      {/* Confirm Modal */}
      {confirmState?.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="p-5 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)] mt-0.5">{confirmState.title}</h3>
                {confirmState.message && <p className="text-sm text-[var(--muted)] mt-1">{confirmState.message}</p>}
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-end gap-2">
              <button 
                onClick={() => handleConfirmClose(false)} 
                className="px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                autoFocus 
                onClick={() => handleConfirmClose(true)} 
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {promptState?.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4 text-[var(--color-brand-500)]">
                <HelpCircle className="w-5 h-5" />
                <h3 className="text-base font-semibold text-[var(--foreground)]">{promptState.title}</h3>
              </div>
              <input
                type="text"
                autoFocus
                value={promptState.value}
                onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded py-2 px-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePromptClose(true);
                  if (e.key === 'Escape') handlePromptClose(false);
                }}
              />
            </div>
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-end gap-2">
              <button 
                onClick={() => handlePromptClose(false)} 
                className="px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar)] rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handlePromptClose(true)} 
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-brand-500)] hover:brightness-110 rounded transition-colors shadow-sm"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
