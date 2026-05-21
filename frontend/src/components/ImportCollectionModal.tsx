import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle2, Folder, Download, FileJson } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-toastify';
import { useAppContext } from '@/lib/AppContext';
import StyledSelect from './StyledSelect';
import { useFeatureFlags } from '@/lib/FeatureFlagContext';
import { Lock } from 'lucide-react';

export default function ImportCollectionModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const { workspaces, activeWorkspaceId } = useAppContext();
  const [file, setFile] = useState<File | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const featureFlags = useFeatureFlags();
  const isLocked = !featureFlags.allow_collection_upload;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setIsDragging(false);
      dragCounterRef.current = 0;
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (isLocked) return;
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type === 'application/json' || droppedFile.name.endsWith('.json')) {
        setFile(droppedFile);
      } else {
        toast.error('Please drop a JSON file');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (!isLocked) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm modal-backdrop">
      <div className="bg-[var(--card)] w-full max-w-lg rounded-xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden modal-content">
        
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
              <StyledSelect
                options={
                  workspaces && workspaces.length > 0
                    ? workspaces.map((w: any) => ({ value: w.id, label: w.name }))
                    : [{ value: '', label: 'No workspaces available' }]
                }
                value={selectedWorkspaceId}
                onChange={(val) => setSelectedWorkspaceId(val)}
                size="md"
                icon={<Folder className="w-4 h-4 text-[var(--color-brand-500)]" />}
              />
            </div>
            <p className="text-xs text-[var(--muted)] flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[var(--color-brand-500)] rounded-full animate-pulse"></span> Your collections will be safely isolated to this workspace.</p>
          </div>

          {/* File Upload / Drop Zone */}
          <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-[var(--foreground)] uppercase">JSON File</label>
             {isLocked ? (
               <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center border-amber-500/30 bg-amber-500/5 cursor-not-allowed" onClick={() => toast.warning("Collection upload is disabled by admin")}>
                 <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mb-3">
                   <Lock className="w-6 h-6" />
                 </div>
                 <h3 className="font-semibold text-[var(--foreground)] text-sm">Collection Upload Locked</h3>
                 <p className="text-xs text-[var(--muted)] mt-1 max-w-[280px]">The administrator has disabled collection imports. Contact your admin to unlock this feature.</p>
               </div>
             ) : (
             <div 
               className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 relative ${
                 isDragging 
                   ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 scale-[1.02] shadow-lg shadow-[var(--color-brand-500)]/10' 
                   : file 
                     ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5 hover:bg-[var(--color-brand-500)]/10' 
                     : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--sidebar)] hover:border-[var(--muted)]'
               }`}
               onClick={() => fileInputRef.current?.click()}
               onDrop={handleDrop}
               onDragOver={handleDragOver}
               onDragEnter={handleDragEnter}
               onDragLeave={handleDragLeave}
             >
               <input type="file" ref={fileInputRef} onChange={handleFileChange} onClick={(e) => e.stopPropagation()} accept=".json,application/json" className="hidden" />
               
               {isDragging ? (
                 <>
                   <div className="w-14 h-14 bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)] rounded-full flex items-center justify-center mb-3 animate-bounce">
                     <FileJson className="w-7 h-7" />
                   </div>
                   <h3 className="font-bold text-[var(--color-brand-500)] text-sm">Drop your JSON file here</h3>
                   <p className="text-xs text-[var(--color-brand-500)]/70 mt-1">Release to upload</p>
                 </>
               ) : file ? (
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
                   <h3 className="font-semibold text-[var(--foreground)] text-sm">Drag & drop or click to upload</h3>
                   <p className="text-xs text-[var(--muted)] mt-1 max-w-[280px]">Upload a valid Postman Collection V2.1 JSON file to parse endpoints</p>
                   <div className="flex items-center gap-3 mt-3 w-full max-w-[200px]">
                     <span className="h-px flex-1 bg-[var(--border)]" />
                     <span className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">or browse</span>
                     <span className="h-px flex-1 bg-[var(--border)]" />
                   </div>
                 </>
               )}
             </div>
             )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--sidebar)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--border)] transition-colors">
            Cancel
          </button>
          <button 
            disabled={isLocked || !file || !selectedWorkspaceId || isImporting}
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
