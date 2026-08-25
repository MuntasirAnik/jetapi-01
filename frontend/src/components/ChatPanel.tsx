"use client";
import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X, Terminal, Users, Link, Loader2, Edit2, Trash2, FileJson, Smile } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { toast } from "react-toastify";
import { useAppContext } from "@/lib/AppContext";
import { apiFetch } from "@/lib/api";

interface MessageItem {
  id: string;
  content: string;
  codeSnippet?: string;
  sender: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

export default function ChatPanel({ workspaceId, activeRequest, onClose }: { workspaceId: string; activeRequest: any; onClose: () => void }) {
  const { activeOrganizationId, unreadRooms, markRoomAsRead } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'team' | 'workspace' | 'dm'>('workspace');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [shareAsCode, setShareAsCode] = useState(false);
  const [connected, setConnected] = useState(false);
  
  // Direct Messages state
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState<any | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Edit / Delete state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(-1);

  // Emoji state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const EMOJIS = ["😀", "😂", "👍", "❤️", "🎉", "🔥", "🚀", "👀", "💬", "⚠️", "💻", "💯", "📁", "🔍"];

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelWidth, setPanelWidth] = useState(340);
  const isDragging = useRef(false);

  useEffect(() => {
    try {
      const localUserStr = localStorage.getItem("user");
      if (localUserStr) setCurrentUser(JSON.parse(localUserStr));
    } catch {}
  }, []);

  // Fetch organization users for Direct Messages tab and @mentions
  const fetchMembers = async () => {
    if (!activeOrganizationId) return;
    setLoadingMembers(true);
    try {
      const res = await apiFetch(`/organizations/${activeOrganizationId}/users`);
      if (res.ok) {
        const users = await res.json();
        // Exclude current logged in user from DMs directory
        const localUserStr = localStorage.getItem("user");
        const localUser = localUserStr ? JSON.parse(localUserStr) : null;
        setMembers(users.filter((m: any) => m.id !== localUser?.id));
      }
    } catch (e) {
      console.error("Failed to load members", e);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [activeOrganizationId]);

  // Determine active room name helper
  const getRoomName = () => {
    if (activeTab === 'team') {
      return `team_${activeOrganizationId}`;
    } else if (activeTab === 'workspace') {
      return `workspace_${workspaceId}`;
    } else if (activeTab === 'dm' && activeRecipient) {
      const localUserStr = localStorage.getItem("user");
      const localUser = localUserStr ? JSON.parse(localUserStr) : null;
      if (localUser) {
        const ids = [localUser.id, activeRecipient.id].sort();
        return `dm_${ids[0]}_${ids[1]}`;
      }
    }
    return '';
  };

  // Establish and manage Socket connection
  useEffect(() => {
    if (!activeOrganizationId) return;

    const token = localStorage.getItem("token");
    const socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", {
      auth: { token },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("chat_history", (history: MessageItem[]) => {
      setMessages(history);
      const roomName = getRoomName();
      if (roomName) markRoomAsRead(roomName);
    });

    socket.on("new_message", (msg: MessageItem) => {
      setMessages((prev) => [...prev, msg]);
      const roomName = getRoomName();
      if (roomName) markRoomAsRead(roomName);
    });

    socket.on("message_edited", (data: { messageId: string; content: string; codeSnippet?: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, content: data.content, codeSnippet: data.codeSnippet }
            : msg
        )
      );
    });

    socket.on("message_deleted", (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== data.messageId));
    });

    socket.on("presence_update", (data: { onlineUsers: string[] }) => {
      setOnlineUsers(data.onlineUsers || []);
    });

    return () => {
      socket.disconnect();
    };
  }, [workspaceId, activeOrganizationId]);

  // Manage room joining based on active tab
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    // Join new room
    if (activeTab === 'team') {
      socket.emit("join_room", { type: 'team', organizationId: activeOrganizationId });
    } else if (activeTab === 'workspace' && workspaceId) {
      socket.emit("join_room", { type: 'workspace', workspaceId });
    } else if (activeTab === 'dm' && activeRecipient) {
      socket.emit("join_room", { type: 'dm', recipientId: activeRecipient.id, organizationId: activeOrganizationId });
    }

    return () => {
      const roomName = getRoomName();
      if (roomName && socket) {
        socket.emit("leave_room", { roomName });
      }
      setMessages([]);
      setOnlineUsers([]);
    };
  }, [activeTab, activeRecipient, connected, activeOrganizationId, workspaceId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeRecipient]);

  const handleSend = () => {
    if (!newMsg.trim() || !socketRef.current) return;

    const payload: any = {
      type: activeTab,
      content: newMsg.trim(),
      codeSnippet: shareAsCode ? newMsg.trim() : undefined,
    };

    if (activeTab === 'team') {
      payload.organizationId = activeOrganizationId;
    } else if (activeTab === 'workspace') {
      payload.workspaceId = workspaceId;
    } else if (activeTab === 'dm' && activeRecipient) {
      payload.recipientId = activeRecipient.id;
    }

    socketRef.current.emit("send_message", payload);

    setNewMsg("");
    setShareAsCode(false);
    setShowEmojiPicker(false);
  };

  const startEditing = (msg: MessageItem) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = () => {
    if (!editText.trim() || !socketRef.current || !editingId) return;
    socketRef.current.emit("edit_message", {
      messageId: editingId,
      content: editText.trim(),
      roomName: getRoomName(),
    });
    cancelEditing();
  };

  const emitDelete = (messageId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("delete_message", {
      messageId,
      roomName: getRoomName(),
    });
  };

  // Handle autocomplete mentions lookup trigger
  const handleInputChange = (val: string) => {
    setNewMsg(val);

    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && lastAt >= val.length - 15) {
      const textAfterAt = val.substring(lastAt + 1);
      if (!textAfterAt.includes(" ")) {
        setShowMentions(true);
        setMentionQuery(textAfterAt.toLowerCase());
        setMentionIndex(lastAt);
        return;
      }
    }
    setShowMentions(false);
  };

  const getMentionSuggestions = () => {
    const options = [{ id: 'all', name: 'all', email: 'Notify Everyone' }, ...members];
    return options.filter(opt =>
      (opt.name || '').toLowerCase().includes(mentionQuery) ||
      (opt.email || '').toLowerCase().includes(mentionQuery)
    );
  };

  const selectMention = (name: string) => {
    if (mentionIndex === -1) return;
    const before = newMsg.substring(0, mentionIndex);
    const completed = `${before}@${name} `;
    setNewMsg(completed);
    setShowMentions(false);
  };

  // Highlighting parser for @mentions in chat bubble
  const formatMessageContent = (content: string) => {
    if (!content) return "";
    const parts = content.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const mentionName = part.substring(1).toLowerCase();
        const isTeamMember = members.some(m =>
          (m.name || '').toLowerCase().replace(/\s+/g, '') === mentionName ||
          m.email.toLowerCase().split('@')[0] === mentionName
        );
        const isAll = mentionName === 'all';
        
        if (isAll || isTeamMember) {
          return (
            <span key={i} className="bg-[var(--color-brand-500)]/20 text-[var(--color-brand-500)] px-1.5 py-0.2 rounded font-bold text-[10px] inline-block font-sans select-all">
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  const attachRequest = () => {
    if (!activeRequest) return;
    const reqText = `\n[Request Link: ${activeRequest.method} ${activeRequest.name}]`;
    setNewMsg((prev) => prev + reqText);
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const formatted = JSON.stringify(parsed, null, 2);
        setNewMsg(formatted);
        setShareAsCode(true);
        toast.success("JSON loaded and formatted in text box!");
      } catch (err) {
        toast.error("Invalid JSON file structure!");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset
  };

  const insertEmoji = (emoji: string) => {
    setNewMsg((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(280, Math.min(600, startWidth + (startX - ev.clientX)));
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const getInitials = (name: string) => {
    return (name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const showInput = activeTab !== 'dm' || activeRecipient !== null;

  return (
    <div
      className="h-full border-l border-[var(--border)] bg-[var(--sidebar)] flex flex-col overflow-hidden shrink-0 relative panel-slide-right z-10"
      style={{ width: panelWidth }}
    >
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleJsonUpload}
        accept=".json"
        className="hidden"
      />

      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-brand-500)] z-10 transition-colors"
        onMouseDown={handleDragStart}
      />

      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2 shrink-0 bg-[var(--sidebar)]/55">
        <MessageSquare className="w-4 h-4 text-[var(--color-brand-500)]" />
        <span className="text-xs font-semibold">Messages</span>
        {activeTab !== 'dm' && (
          <div className="flex items-center gap-1.5 ml-2 text-[10px] text-[var(--muted)]">
            <Users className="w-3 h-3" />
            <span>{onlineUsers.length} online</span>
          </div>
        )}
        <div className={`w-1.5 h-1.5 rounded-full ml-auto ${connected ? "bg-green-500" : "bg-red-500"}`} title={connected ? "Connected" : "Disconnected"} />
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--card)] rounded transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Channel Switcher Tabs */}
      <div className="flex border-b border-[var(--border)] bg-[var(--sidebar)]/40 p-1 gap-1 shrink-0">
        <button
          onClick={() => { setActiveTab('workspace'); setActiveRecipient(null); }}
          className={`relative flex-1 py-1 rounded text-[10px] font-semibold transition-all duration-200 ${activeTab === 'workspace' ? 'bg-[var(--color-brand-500)] text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/20'}`}
        >
          Workspace
          {unreadRooms?.some(r => r === `workspace_${workspaceId}`) && activeTab !== 'workspace' && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('team'); setActiveRecipient(null); }}
          className={`relative flex-1 py-1 rounded text-[10px] font-semibold transition-all duration-200 ${activeTab === 'team' ? 'bg-[var(--color-brand-500)] text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/20'}`}
        >
          Team
          {unreadRooms?.some(r => r === `team_${activeOrganizationId}`) && activeTab !== 'team' && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          className={`relative flex-1 py-1 rounded text-[10px] font-semibold transition-all duration-200 ${activeTab === 'dm' ? 'bg-[var(--color-brand-500)] text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/20'}`}
        >
          Direct
          {unreadRooms?.some(r => r.startsWith('dm_')) && (activeTab !== 'dm' || !activeRecipient) && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          )}
        </button>
      </div>

      {/* DM sub-header */}
      {activeTab === 'dm' && activeRecipient && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--background)]/30 shrink-0 text-[10px]">
          <button
            onClick={() => setActiveRecipient(null)}
            className="text-[var(--color-brand-500)] hover:underline font-semibold"
          >
            &larr; Members List
          </button>
          <span className="text-[var(--muted)]">| Chat with</span>
          <span className="font-bold truncate text-[var(--foreground)]">{activeRecipient.name || activeRecipient.email}</span>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'dm' && !activeRecipient ? (
        // Direct Messages Members Directory List
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {loadingMembers ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-[var(--muted)] gap-2 py-12">
              <Users className="w-8 h-8 opacity-20" />
              <p className="text-xs font-medium">No other members</p>
              <p className="text-[10px] opacity-60 text-center max-w-[180px]">
                Invite members to this team in Team Settings to start direct chats.
              </p>
            </div>
          ) : (
            members.map((member) => {
              const dmRoomId = currentUser ? `dm_${[currentUser.id, member.id].sort().join('_')}` : '';
              const hasUnread = unreadRooms?.includes(dmRoomId);

              return (
                <button
                  key={member.id}
                  onClick={() => setActiveRecipient(member)}
                  className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-[var(--border)]/30 text-left transition-colors relative"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-brand-500)]/20 to-[var(--color-brand-600)]/20 border border-[var(--brand-500)]/30 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-[var(--color-brand-500)]">{getInitials(member.name || member.email)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate ${hasUnread ? 'font-bold text-[var(--foreground)]' : 'font-semibold text-[var(--foreground)]'}`}>
                      {member.name || member.email}
                    </p>
                    <p className="text-[9px] text-[var(--muted)] truncate">{member.email}</p>
                  </div>
                  {hasUnread && (
                    <span className="w-2 h-2 bg-red-500 rounded-full shrink-0"></span>
                  )}
                  {!hasUnread && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted)] uppercase border border-[var(--border)] font-mono">{member.role}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : (
        // Chat messages timeline feed
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-[var(--muted)] gap-2 py-12">
              <MessageSquare className="w-8 h-8 opacity-20" />
              <p className="text-xs font-medium">
                {activeTab === 'team' ? "Team Chat Room" : activeTab === 'workspace' ? "Workspace Chat Room" : `Chat with ${activeRecipient?.name || "Member"}`}
              </p>
              <p className="text-[10px] opacity-60 text-center max-w-[200px]">
                {activeTab === 'team'
                  ? "Share links, test cURLs, and brainstorm with the entire organization team."
                  : activeTab === 'workspace'
                  ? "Focus discussions specifically around requests in this workspace."
                  : "Private conversation. Messages are encrypted and secured."}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.sender?.id === currentUser?.id;
              const isEditing = editingId === msg.id;

              return (
                <div key={msg.id || index} className={`flex items-start gap-2 relative group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-bold ${
                    isMe ? 'bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-700)]' : 'bg-gradient-to-br from-neutral-600 to-neutral-700'
                  }`}>
                    {getInitials(msg.sender?.name || msg.sender?.email)}
                  </div>
                  
                  {/* Message Bubble Container */}
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Header info */}
                    <div className={`flex items-center gap-1 text-[9px] text-[var(--muted)] mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <span className="font-semibold text-[var(--foreground)]">{isMe ? 'You' : (msg.sender?.name || msg.sender?.email || "Unknown")}</span>
                      <span>•</span>
                      <span>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</span>
                      
                      {/* Action buttons directly in the header to prevent clipping */}
                      {isMe && !isEditing && (
                        <div className="flex items-center gap-1 ml-1.5 opacity-60 hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => startEditing(msg)}
                            className="hover:text-[var(--color-brand-500)] font-medium transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <span>|</span>
                          <button
                            onClick={() => emitDelete(msg.id)}
                            className="hover:text-red-500 font-medium transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Chat Bubble / Edit Form */}
                    {isEditing ? (
                      <div className="flex flex-col gap-1 w-full mt-1 min-w-[200px]">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-2 text-xs outline-none focus:border-[var(--color-brand-500)] w-full resize-none text-[var(--foreground)]"
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              saveEdit();
                            }
                          }}
                        />
                        <div className="flex gap-1.5 self-end">
                          <button
                            onClick={cancelEditing}
                            className="px-2 py-0.5 rounded text-[9px] bg-[var(--border)] text-[var(--muted)] font-medium hover:text-[var(--foreground)] transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEdit}
                            className="px-2 py-0.5 rounded text-[9px] bg-[var(--color-brand-500)] text-white font-medium hover:bg-[var(--color-brand-600)] transition-all"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : msg.codeSnippet ? (
                      <div className="mt-1 bg-[var(--background)] border border-[var(--border)] rounded p-2 overflow-x-auto text-[10px] font-mono leading-relaxed max-w-full text-green-500 whitespace-pre">
                        {msg.codeSnippet}
                      </div>
                    ) : (
                      <div className={`p-2 rounded-lg text-xs break-words whitespace-pre-wrap ${
                        isMe 
                          ? 'bg-[var(--color-brand-500)] text-white rounded-tr-none' 
                          : 'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-tl-none'
                      }`}>
                        {formatMessageContent(msg.content)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Input box */}
      {showInput && (
        <div className="p-3 border-t border-[var(--border)] shrink-0 bg-[var(--sidebar)]/55 relative">
          
          {/* @Mention Autocomplete Dropdown Popup */}
          {showMentions && getMentionSuggestions().length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1.5 max-h-36 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl p-1 z-50 flex flex-col gap-0.5">
              <div className="px-2 py-1 text-[9px] text-[var(--muted)] font-semibold uppercase tracking-wider border-b border-[var(--border)] mb-1">
                Mention Someone
              </div>
              {getMentionSuggestions().map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectMention(opt.name || opt.email.split('@')[0])}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-[var(--foreground)] hover:bg-[var(--border)]/30 rounded text-left transition-colors w-full"
                >
                  <span className="text-[var(--color-brand-500)] font-semibold">@{opt.name || opt.email.split('@')[0]}</span>
                  <span className="text-[9px] text-[var(--muted)] font-normal truncate">({opt.email})</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 relative">
            <textarea
              value={newMsg}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={shareAsCode ? "Paste code snippet here..." : "Type a message..."}
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] placeholder-[var(--muted)] resize-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/10 outline-none transition-all"
            />
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={shareAsCode}
                    onChange={(e) => setShareAsCode(e.target.checked)}
                    className="rounded border-[var(--border)] text-[var(--color-brand-500)] focus:ring-[var(--color-brand-500)] w-3.5 h-3.5 bg-[var(--background)]"
                  />
                  <Terminal className="w-3 h-3" />
                  <span>Code Snippet</span>
                </label>

                {activeRequest && (
                  <button
                    type="button"
                    onClick={attachRequest}
                    className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    title="Attach active request link"
                  >
                    <Link className="w-3 h-3" />
                    <span>Attach Request</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  title="Upload JSON File"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Upload JSON</span>
                </button>
              </div>
              
              <div className="flex items-center gap-1 shrink-0 relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-1.5 rounded-lg transition-colors ${showEmojiPicker ? 'bg-[var(--border)] text-[var(--color-brand-500)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
                  title="Add Emoji"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!newMsg.trim()}
                  className="p-2 bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>

                {/* Emoji Picker Popup Bubble */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 p-2 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl grid grid-cols-5 gap-1 z-50 min-w-[150px]">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-[var(--border)]/50 rounded text-sm transition-all"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
