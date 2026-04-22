import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle2, ChevronDown, Folder, Download } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-toastify';
import { useAppContext } from '@/lib/AppContext';

export default function ImportCollectionModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const { workspaces, activeWorkspaceId } = useAppContext();
  const [file, setFile] = useState<File | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      if (activeWorkspaceId) setSelectedWorkspaceId(activeWorkspaceId);
      else if (workspaces && workspaces.length > 0) setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [isOpen, activeWorkspaceId, workspaces]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedWorkspaceId) return;
    
    setIsImporting(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      const res = await apiFetch("/collections/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: selectedWorkspaceId, data: importData })
      });
      
      
      if (!res.ok) throw new Error((await res.json()).message || "Import failed");
      
      toast.success("Collection imported successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Import failed. Invalid JSON.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--card)] w-full max-w-lg rounded-xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--sidebar)]">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5 text-[var(--color-brand-500)]" /> Import Collection
          </h2>
          <button onClick={onClose} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] rounded transition-colors"><X className="w-5 h-5"/></button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          <p className="text-sm text-[var(--muted)] mb-5">
            Select a Workspace and upload a standard Postman Collection (v2.1) JSON file.
          </p>
          
          {/* Workspace Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--foreground)] uppercase max-w-fit">Destination Workspace</label>
            <div className="relative">
              <select 
                title="Workspace Destination"
                className="w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm rounded-lg pl-10 pr-10 py-3 outline-none focus:border-[var(--color-brand-500)] appearance-none cursor-pointer hover:bg-[var(--sidebar)] transition-colors"
                value={selectedWorkspaceId}
                onChange={e => setSelectedWorkspaceId(e.target.value)}
              >
                {workspaces?.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
                {(!workspaces || workspaces.length === 0) && <option value="" disabled>No workspaces available</option>}
              </select>
              <Folder className="w-4 h-4 text-[var(--color-brand-500)] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-4 h-4 text-[var(--muted)] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-xs text-[var(--muted)] flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[var(--color-brand-500)] rounded-full animate-pulse"></span> Your collections will be safely isolated to this workspace.</p>
          </div>

          {/* File Upload Zone */}
          <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-[var(--foreground)] uppercase">JSON File</label>
             <div 
               className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${file ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5 hover:bg-[var(--color-brand-500)]/10' : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--sidebar)]'}`}
               onClick={() => fileInputRef.current?.click()}
             >
               <input type="file" ref={fileInputRef} onChange={handleFileChange} onClick={(e) => e.stopPropagation()} accept=".json,application/json" className="hidden" />
               
               {file ? (
                 <>
                   <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-3">
                     <CheckCircle2 className="w-6 h-6" />
                   </div>
                   <h3 className="font-bold text-[var(--foreground)] text-sm line-clamp-1 break-all">{file.name}</h3>
                   <p className="text-xs text-[var(--muted)] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                   <button className="mt-4 text-xs font-semibold text-[var(--color-brand-500)] hover:underline">Choose a different file</button>
                 </>
               ) : (
                 <>
                   <div className="w-12 h-12 bg-[var(--sidebar)] border border-[var(--border)] text-[var(--muted)] rounded-full flex items-center justify-center mb-3">
                     <Upload className="w-5 h-5" />
                   </div>
                   <h3 className="font-semibold text-[var(--foreground)] text-sm">Click to upload Postman Collection</h3>
                   <p className="text-xs text-[var(--muted)] mt-1 max-w-[250px]">Upload a valid V2.1 JSON file to parse endpoints</p>
                 </>
               )}
             </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--sidebar)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--border)] transition-colors">
            Cancel
          </button>
          <button 
            disabled={!file || !selectedWorkspaceId || isImporting}
            onClick={handleImport} 
            className="flex items-center gap-2 px-6 py-2 bg-[var(--color-brand-500)] text-white font-bold rounded-lg hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isImporting ? "Importing..." : "Start Import"}
          </button>
        </div>

      </div>
    </div>
  );
}
