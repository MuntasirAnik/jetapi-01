import { Code2, FileText, MessageSquare, Info, Layers } from "lucide-react";
import { toast } from "react-toastify";

export default function RightSidebar({ activeTab, activePanel, onTogglePanel }: { activeTab?: string, activePanel: string | null, onTogglePanel: (p: string) => void }) {
  const notImplemented = (name: string) => {
    toast.info(`${name} panel coming soon!`);
  };

  return (
    <div className="w-10 bg-[var(--background)] border-l border-[var(--border)] flex flex-col items-center py-4 gap-3 flex-shrink-0 z-10 transition-all h-full">
      <button 
        onClick={() => onTogglePanel("docs")}
        className={`p-1.5 rounded transition-colors ${activePanel === 'docs' ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'}`} 
        title="Documentation"
      >
        <FileText className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
      <button 
        onClick={() => notImplemented("Comments")}
        className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors" 
        title="Comments"
      >
        <MessageSquare className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
      <div className="w-4 h-[1px] bg-[var(--border)] my-1" />
      <button 
        onClick={() => onTogglePanel("variables")}
        className={`p-1.5 rounded transition-colors ${activePanel === 'variables' ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'}`} 
        title="Variables"
      >
        <Layers className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
      <button 
        onClick={() => onTogglePanel("code")}
        className={`p-1.5 rounded transition-colors ${activePanel === 'code' ? 'bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]'}`} 
        title="Code Snippet"
      >
        <Code2 className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
      <button 
        onClick={() => notImplemented("Request Info")}
        className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)] rounded transition-colors" 
        title="Request Info"
      >
        <Info className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
    </div>
  );
}
