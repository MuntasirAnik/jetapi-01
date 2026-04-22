"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { X, FolderGit2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useDialog } from "./DialogProvider";

export default function WorkspaceSettingsModal({ workspaceId, organizationId, onClose }: { workspaceId: string, organizationId: string, onClose: () => void }) {
  const { confirmDialog } = useDialog();
  const [workspace, setWorkspace] = useState<any>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  const loadData = async () => {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
         setCurrentUserEmail(JSON.parse(userStr).email);
      }
      
      const res = await apiFetch(`/workspaces/${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkspace(data);
        setEditName(data.name);
      }

      const usersRes = await apiFetch(`/organizations/${organizationId}/users`);
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const handleUpdateName = async () => {
    if (!editName.trim() || editName === workspace?.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName })
      });
      if (!res.ok) throw new Error("Failed to update workspace");
      toast.success("Workspace renamed successfully");
      setIsEditingName(false);
      loadData();
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!(await confirmDialog(`Are you sure you want to delete the workspace "${workspace?.name}"?`))) return;
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete workspace");
      toast.success("Workspace deleted");
      window.dispatchEvent(new Event('postclone-refresh-sidebar'));
      onClose(); // Parent will handle workspace change safely
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const currentUserMembership = users.find(u => u.email === currentUserEmail);
  const isOwner = currentUserMembership && currentUserMembership.role === 'OWNER';
  const isOwnerOrAdmin = currentUserMembership && ['OWNER', 'ADMIN'].includes(currentUserMembership.role);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden zoom-in-95 animate-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)]">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Workspace Settings</h2>
          <button onClick={onClose} className="p-1 rounded text-[var(--muted)] hover:bg-[var(--sidebar)] hover:text-[var(--foreground)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 bg-[var(--background)] flex-1 overflow-y-auto space-y-8">
          
          {/* Workspace Details */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)] rounded-xl flex items-center justify-center shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-sm font-semibold bg-[var(--background)] border border-[var(--border)] rounded px-2 py-0.5 focus:outline-none focus:border-[var(--color-brand-500)]"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateName(); if (e.key === 'Escape') setIsEditingName(false); }}
                    autoFocus
                  />
                  <button onClick={handleUpdateName} className="text-xs bg-[var(--color-brand-500)] text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setIsEditingName(false)} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { if (isOwnerOrAdmin) setIsEditingName(true); }}>
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">{workspace?.name} Settings</h2>
                  {isOwnerOrAdmin && <span className="text-[10px] text-[var(--color-brand-500)] opacity-0 group-hover:opacity-100 transition-opacity">Edit Rename</span>}
                </div>
              )}
              <p className="text-xs text-[var(--muted)] mt-1">Manage this workspace</p>
            </div>
          </div>

          <div className="border-t border-[var(--border)]"></div>

          {/* Danger Zone */}
          {isOwner && (
            <div>
              <h3 className="text-sm font-semibold text-red-500 mb-3">Danger Zone</h3>
              <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Delete Workspace</h4>
                    <p className="text-xs text-[var(--muted)]">Permanently remove this workspace and all its collections.</p>
                  </div>
                  <button 
                    onClick={handleDeleteWorkspace}
                    className="bg-red-500 text-white hover:bg-red-600 px-4 py-2 rounded text-xs font-semibold whitespace-nowrap"
                  >
                    Delete Workspace
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
