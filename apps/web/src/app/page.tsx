"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useStore } from "@/store/useStore";
import { 
  Sparkles, 
  Send, 
  LogOut, 
  Menu, 
  X, 
  Settings, 
  Bot, 
  User, 
  Database, 
  Cpu, 
  RefreshCw, 
  ArrowRight,
  MessageSquare,
  ShieldCheck,
  Upload,
  FileText,
  Terminal,
  Image as ImageIcon
} from "lucide-react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Zustand Store
  const { 
    sidebarOpen, 
    toggleSidebar, 
    systemPrompt, 
    setSystemPrompt,
    isSettingsOpen, 
    setSettingsOpen,
    currentModel,
    codeMode,
    toggleCodeMode
  } = useStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Local input and suggestion triggers
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Notes, Todos, Calendar State
  const [sidebarTab, setSidebarTab] = useState<"system" | "notes" | "todos" | "calendar" | "audit">("system");
  const [notes, setNotes] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [backendOnline, setBackendOnline] = useState(true);

  // Vision State
  const [visionImage, setVisionImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setVisionImage(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const fetchFiles = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/files`, {
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  }, [session?.user?.accessToken, apiBaseUrl]);

  const fetchNotes = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/notes`, {
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    }
  }, [session?.user?.accessToken, apiBaseUrl]);

  const fetchTodos = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/todos`, {
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTodos(data);
      }
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    }
  }, [session?.user?.accessToken, apiBaseUrl]);

  const fetchCalendarEvents = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/calendar/events`, {
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    }
  }, [session?.user?.accessToken, apiBaseUrl]);

  const fetchReminders = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/reminders`, {
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReminders(data);
      }
    } catch (err) {
      console.error("Failed to fetch reminders:", err);
    }
  }, [session?.user?.accessToken, apiBaseUrl]);

  const handleDeleteNote = async (id: string) => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/notes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.user.accessToken}` },
      });
      if (res.ok) fetchNotes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    if (!session?.user?.accessToken) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/todos/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.user.accessToken}`,
        },
        body: JSON.stringify({ completed }),
      });
      if (res.ok) fetchTodos();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (session?.user?.accessToken) {
      fetchFiles();
      fetchNotes();
      fetchTodos();
      fetchCalendarEvents();
      fetchReminders();
    }
  }, [session?.user?.accessToken, fetchFiles, fetchNotes, fetchTodos, fetchCalendarEvents, fetchReminders]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/health`);
        setBackendOnline(res.ok);
      } catch (err) {
        setBackendOnline(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);



  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${apiBaseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.user?.accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Upload failed");
      }

      await fetchFiles();
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  // Memoize transport to avoid re-creation on render
  const transport = React.useMemo(() => {
    return new DefaultChatTransport({
      api: `${apiBaseUrl}/api/chat`,
      headers: {
        Authorization: `Bearer ${session?.user?.accessToken || ""}`,
        "x-code-assistant": codeMode ? "true" : "false",
      },
    });
  }, [apiBaseUrl, session?.user?.accessToken, codeMode]);

  // Vercel AI SDK (V5+ API)
  const { 
    messages, 
    sendMessage, 
    status: chatStatus, 
    setMessages
  } = useChat({
    transport,
    onError: (err) => {
      console.error("Streaming error:", err);
    }
  });

  const isLoading = chatStatus === "streaming" || chatStatus === "submitted" || visionLoading;

  // Reactive refresh: whenever Claude completes tool use execution, reload lists
  useEffect(() => {
    if (chatStatus === "ready" && session?.user?.accessToken) {
      fetchNotes();
      fetchTodos();
      fetchCalendarEvents();
      fetchReminders();
    }
  }, [chatStatus, session?.user?.accessToken, fetchNotes, fetchTodos, fetchCalendarEvents, fetchReminders]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !visionImage) return;

    if (visionImage) {
      const userPrompt = input.trim() || "Analyze this image.";
      setInput("");
      setImagePreview(null);
      setVisionImage(null);

      // Append user message with image preview
      const userMsgId = Math.random().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user" as const,
          content: userPrompt,
          metadata: { image: imagePreview }
        } as any
      ]);

      // Append assistant pending message
      const assistantMsgId = Math.random().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant" as const,
          content: "",
          parts: [{ type: "text", text: "" }]
        } as any
      ]);

      try {
        setVisionLoading(true);
        const formData = new FormData();
        formData.append("file", visionImage);
        formData.append("prompt", userPrompt);

        const res = await fetch(`${apiBaseUrl}/api/chat/vision`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.user?.accessToken}`,
          },
          body: formData,
        });

        if (!res.ok) throw new Error("Vision analysis failed");

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let accumulatedText = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("0:")) {
                try {
                  const token = JSON.parse(line.substring(2));
                  accumulatedText += token;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? ({
                            ...m,
                            content: accumulatedText,
                            parts: [{ type: "text", text: accumulatedText }]
                          } as any)
                        : m
                    )
                  );
                } catch (err) {}
              }
            }
          }
        }
      } catch (err: any) {
        console.error(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? ({
                  ...m,
                  content: `Error: ${err.message || "Failed to analyze image."}`
                } as any)
              : m
          )
        );
      } finally {
        setVisionLoading(false);
      }
    } else {
      handleSubmit(e);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#06070a]">
        <div className="h-8 w-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-gray-400 font-medium">Securing session...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="h-screen flex bg-[#06070a] overflow-hidden text-gray-200">
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">System Settings</h3>
              </div>
              <button 
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  AI System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={4}
                  className="w-full p-3.5 rounded-xl text-sm text-white glass-input outline-none resize-none"
                  placeholder="Instruct the AI on how to behave..."
                />
                <p className="text-[11px] text-gray-500">
                  Defines the persona and rules for the assistant. Passed in every request context.
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  System Architecture Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">API HOST</span>
                    <span className="text-xs text-white font-mono truncate">{apiBaseUrl}</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Auth Driver</span>
                    <span className="text-xs text-white flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> NextAuth JWT
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1 col-span-2">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Database Adapter</span>
                    <span className="text-xs text-white flex items-center gap-1.5 font-medium">
                      <Database className="h-3.5 w-3.5 text-indigo-400" /> SQLAlchemy (PostgreSQL / SQLite fallback)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? "w-[300px] translate-x-0" : "w-0 -translate-x-full"
        } transition-all duration-300 ease-in-out border-r border-white/5 flex flex-col h-full bg-[#0a0c10]/80 backdrop-blur-xl z-20 shrink-0`}
      >
        {/* Brand header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/10">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Aether AI
            </span>
          </div>
          <button 
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Panel */}
        <div className="p-4">
          <button
            onClick={handleClearChat}
            className="w-full py-3 px-4 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            New Conversation
          </button>
        </div>

        {/* Sidebar Tab Selector */}
        <div className="px-4 py-2.5 flex items-center gap-1 border-b border-white/5 bg-black/10">
          {[
            { id: "system", label: "Sys" },
            { id: "notes", label: "Notes" },
            { id: "todos", label: "Todos" },
            { id: "calendar", label: "Cal" },
            { id: "audit", label: "Audit" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id as any)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                sidebarTab === tab.id
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  : "text-gray-400 hover:text-white border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info & System Status */}
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
          {sidebarTab === "system" && (
            <>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Services</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-indigo-400" /> LLM Stream
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15">
                      Anthropic
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-indigo-400" /> DB Engine
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/15">
                      SQLAlchemy
                    </span>
                  </div>
                </div>
              </div>

              {/* Documents (RAG Context) */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-indigo-400" /> Documents (RAG)
                  </h4>
                  <label className="cursor-pointer text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-white/5">
                    <Upload className="h-2.5 w-2.5" /> Upload
                    <input 
                      type="file" 
                      accept=".pdf,.txt,.md" 
                      onChange={handleFileUpload} 
                      disabled={uploading} 
                      className="hidden" 
                    />
                  </label>
                </div>
                
                {uploading && (
                  <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse py-1">
                    <div className="h-3 w-3 border-2 border-indigo-400/20 border-t-indigo-400 rounded-full animate-spin"></div>
                    <span>Parsing and indexing...</span>
                  </div>
                )}
                
                {uploadError && (
                  <p className="text-[9px] text-red-400 font-semibold bg-red-500/5 p-1.5 rounded-lg border border-red-500/10">{uploadError}</p>
                )}

                {files.length === 0 ? (
                  <p className="text-[10px] text-gray-500 italic py-1">No files uploaded yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {files.map((file) => (
                      <div key={file.id} className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-2 group hover:bg-white/10 transition-colors">
                        <span className="text-[11px] text-gray-300 truncate max-w-[170px]" title={file.filename}>
                          {file.filename}
                        </span>
                        <span className="text-[8px] font-bold text-gray-500 bg-white/5 px-1.5 py-0.5 rounded uppercase shrink-0">
                          {file.file_type.includes("pdf") ? "PDF" : file.file_type.includes("markdown") ? "MD" : "TXT"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {sidebarTab === "notes" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Add Note</h4>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="Note title..." 
                    id="new-note-title"
                    className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/5 text-xs text-white outline-none focus:border-indigo-500/30 transition-colors"
                  />
                  <textarea 
                    placeholder="Note content..." 
                    id="new-note-content"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/5 text-xs text-white outline-none focus:border-indigo-500/30 transition-colors resize-none"
                  />
                  <button
                    onClick={async () => {
                      const titleEl = document.getElementById("new-note-title") as HTMLInputElement;
                      const contentEl = document.getElementById("new-note-content") as HTMLTextAreaElement;
                      if (!titleEl.value.trim() || !contentEl.value.trim()) return;
                      await fetch(`${apiBaseUrl}/api/notes`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${session?.user?.accessToken}`
                        },
                        body: JSON.stringify({ title: titleEl.value, content: contentEl.value })
                      });
                      titleEl.value = "";
                      contentEl.value = "";
                      fetchNotes();
                    }}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    Add Note
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {notes.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">No notes created yet.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5 relative group hover:bg-white/10 transition-colors">
                      <button 
                        onClick={() => handleDeleteNote(note.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-red-400 transition-colors font-bold uppercase"
                      >
                        Delete
                      </button>
                      <h5 className="text-xs font-bold text-white pr-10 truncate">{note.title}</h5>
                      <p className="text-[11px] text-gray-400 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {sidebarTab === "todos" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Add Task</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Todo description... (Enter to add)" 
                    id="new-todo-task"
                    className="flex-1 px-3 py-2 rounded-lg bg-black/20 border border-white/5 text-xs text-white outline-none focus:border-indigo-500/30 transition-colors"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const inputEl = e.currentTarget;
                        if (!inputEl.value.trim()) return;
                        await fetch(`${apiBaseUrl}/api/todos`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session?.user?.accessToken}`
                          },
                          body: JSON.stringify({ task: inputEl.value })
                        });
                        inputEl.value = "";
                        fetchTodos();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {todos.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">No tasks in your list.</p>
                ) : (
                  todos.map((todo) => (
                    <div key={todo.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 gap-3 group hover:bg-white/10 transition-colors">
                      <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                        <input 
                          type="checkbox" 
                          checked={todo.completed}
                          onChange={(e) => handleToggleTodo(todo.id, e.target.checked)}
                          className="h-4 w-4 rounded border-white/10 bg-black/20 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        <span className={`text-xs truncate ${todo.completed ? "line-through text-gray-500" : "text-gray-200"}`}>
                          {todo.task}
                        </span>
                      </label>
                      <button 
                        onClick={async () => {
                          await fetch(`${apiBaseUrl}/api/todos/${todo.id}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${session?.user?.accessToken}` }
                          });
                          fetchTodos();
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-red-400 transition-colors font-bold uppercase shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {sidebarTab === "calendar" && (
            <div className="space-y-4">
              {reminders.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <h5 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    Alerts & Reminders (Next 24h)
                  </h5>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {reminders.map((r) => {
                      const timeStr = r.time ? new Date(r.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                      return (
                        <div key={r.id} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 flex justify-between items-center gap-2">
                          <span className="text-[11px] text-gray-300 truncate max-w-[170px] font-medium" title={r.title}>
                            {r.title}
                          </span>
                          <span className="text-[9px] text-amber-400 font-semibold shrink-0">
                            {timeStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Schedule Event</h4>
                <div className="space-y-2.5">
                  <input 
                    type="text" 
                    placeholder="Event title..." 
                    id="new-event-summary"
                    className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/5 text-xs text-white outline-none focus:border-indigo-500/30 transition-colors"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-gray-500 font-bold uppercase">Start</span>
                      <input 
                        type="datetime-local" 
                        id="new-event-start"
                        className="px-2 py-1.5 bg-black/20 border border-white/5 rounded-lg text-[10px] text-white outline-none cursor-pointer focus:border-indigo-500/30"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-gray-500 font-bold uppercase">End</span>
                      <input 
                        type="datetime-local" 
                        id="new-event-end"
                        className="px-2 py-1.5 bg-black/20 border border-white/5 rounded-lg text-[10px] text-white outline-none cursor-pointer focus:border-indigo-500/30"
                      />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const summaryEl = document.getElementById("new-event-summary") as HTMLInputElement;
                      const startEl = document.getElementById("new-event-start") as HTMLInputElement;
                      const endEl = document.getElementById("new-event-end") as HTMLInputElement;
                      if (!summaryEl.value.trim() || !startEl.value || !endEl.value) return;
                      await fetch(`${apiBaseUrl}/api/calendar/events`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${session?.user?.accessToken}`
                        },
                        body: JSON.stringify({
                          summary: summaryEl.value,
                          start_time: new Date(startEl.value).toISOString(),
                          end_time: new Date(endEl.value).toISOString()
                        })
                      });
                      summaryEl.value = "";
                      startEl.value = "";
                      endEl.value = "";
                      fetchCalendarEvents();
                    }}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    Create Event
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {calendarEvents.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">No events scheduled.</p>
                ) : (
                  calendarEvents.map((evt) => {
                    const startStr = new Date(evt.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={evt.id} className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1 relative hover:bg-white/10 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-bold text-white truncate max-w-[170px]">{evt.summary}</h5>
                          <span className="text-[8px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase shrink-0">
                            {evt.source ? evt.source.split(" ")[0] : "Local"}
                          </span>
                        </div>
                        <p className="text-[10px] text-indigo-400 font-semibold">{startStr}</p>
                        {evt.description && <p className="text-[10px] text-gray-400 truncate">{evt.description}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {sidebarTab === "audit" && (
            <div className="space-y-4">
              {/* Executive Summary Card */}
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-3.5 animate-in fade-in duration-200">
                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                  SAIL Tagging Audit Summary
                </h4>
                
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-[9px] text-gray-500 block uppercase font-bold">Allotted</span>
                    <span className="text-sm font-bold text-white">4,957</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-[9px] text-gray-500 block uppercase font-bold">Tagged</span>
                    <span className="text-sm font-bold text-emerald-400">3,321</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] text-red-400 uppercase font-bold block">Missing Tags</span>
                    <span className="text-base font-black text-red-400">1,636</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Completion</span>
                    <span className="text-sm font-bold text-white">67.0%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" style={{ width: "67.0%" }}></div>
                  </div>
                </div>
              </div>

              {/* Device breakdown list */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Equipment Deficits</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-gray-400">PCs</span>
                    <span className="font-semibold text-white">3,360 / 2,030 <span className="text-red-400 font-bold ml-1">(-1,330)</span></span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-gray-400">Printers</span>
                    <span className="font-semibold text-white">941 / 913 <span className="text-red-400 font-bold ml-1">(-28)</span></span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-gray-400">MFDs</span>
                    <span className="font-semibold text-white">170 / 75 <span className="text-red-400 font-bold ml-1">(-95)</span></span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-400">Scanners</span>
                    <span className="font-semibold text-white">486 / 303 <span className="text-red-400 font-bold ml-1">(-183)</span></span>
                  </div>
                </div>
              </div>

              {/* Department breakdown list */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Top Department Deficits</h4>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {[
                    { name: "C&A", missing: 204 },
                    { name: "HR L&D", missing: 171 },
                    { name: "M&HS", missing: 137 },
                    { name: "MINES - KIRUBURU", missing: 115 },
                    { name: "CHAS NALA", missing: 105 },
                    { name: "CISF", missing: 93 },
                    { name: "C&IT", missing: 90 },
                    { name: "WORK ADMIN", missing: 66 },
                    { name: "SAFETY & FIRE", missing: 53 },
                    { name: "F&A", missing: 47 }
                  ].map((dept, i) => (
                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-[11px] text-gray-300 truncate max-w-[150px] font-medium" title={dept.name}>{dept.name}</span>
                      <span className="text-[10px] text-red-400 font-bold">-{dept.missing} tags</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User profile block */}
        <div className="p-4 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-3 mb-3.5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
              {session.user?.name ? session.user.name[0].toUpperCase() : session.user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{session.user?.name || "User"}</p>
              <p className="text-[10px] text-gray-400 truncate">{session.user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 border border-red-500/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-[72px] border-b border-white/5 flex items-center justify-between px-6 bg-[#06070a]/60 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button 
                onClick={toggleSidebar}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Single Conversation</span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                {backendOnline ? (
                  <>
                    Active Session <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </>
                ) : (
                  <>
                    Offline (API Unreachable) <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleCodeMode}
              className={`p-2.5 rounded-xl transition-all flex items-center justify-center border ${
                codeMode 
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-md shadow-indigo-500/5" 
                  : "bg-white/5 border-white/5 text-gray-400 hover:text-white"
              }`}
              title={codeMode ? "Disable Code Assistant Mode" : "Enable Code Assistant Mode"}
            >
              <Terminal className="h-4.5 w-4.5" />
            </button>
            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all flex items-center justify-center border border-white/5"
            >
              <Settings className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>
        {!backendOnline && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs font-semibold px-6 py-2.5 flex items-center justify-center gap-2 animate-in fade-in duration-200 shrink-0">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
            Warning: Backend API host is offline. Please verify uvicorn is running.
          </div>
        )}

        {/* Message Panel / suggestions */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center max-w-2xl mx-auto text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-300">
              <div className="space-y-3">
                <div className="inline-flex p-4 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 mb-2">
                  <Bot className="h-8 w-8 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">How can I assist you today?</h2>
                <p className="text-sm text-gray-400 max-w-md">
                  Send a message to stream a response from Claude. Use the settings icon above to configure rules.
                </p>
              </div>

              {/* Suggestions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full pt-4">
                {[
                  {
                    title: "Draft an email",
                    desc: "Write a professional update for stakeholders",
                    prompt: "Draft a polite, professional email to project stakeholders notifying them that our MVP frontend and backend are successfully integrated."
                  },
                  {
                    title: "Debug a schema",
                    desc: "Create an index optimization strategy",
                    prompt: "Explain how to write a PostgreSQL migration using SQLAlchemy to add a new `chats` table linked to our `users` table."
                  },
                  {
                    title: "Design a feature",
                    desc: "Describe architectural options for memory",
                    prompt: "Summarize the 4 pillars of Agentic Memory described in the Blueprint PDF (Working, Episodic, Semantic, and Procedural)."
                  },
                  {
                    title: "Analyze algorithms",
                    desc: "Explain dynamic multi-model routing",
                    prompt: "What is dynamic multi-model routing and how does it optimize operational API token costs?"
                  }
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(sug.prompt)}
                    className="p-4 rounded-2xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group flex items-start gap-3 active:scale-[0.99]"
                  >
                    <div className="p-2 rounded-xl bg-indigo-500/5 group-hover:bg-indigo-500/10 text-indigo-400 transition-colors shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-1">
                        {sug.title} <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-xs text-gray-400 mt-1 truncate">{sug.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                >
                  {message.role !== "user" && (
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 shadow-md">
                      <Bot className="h-4.5 w-4.5" />
                    </div>
                  )}

                  <div 
                    className={`max-w-[80%] rounded-2xl px-4.5 py-3 text-sm leading-relaxed ${
                      message.role === "user" 
                        ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10 rounded-tr-none" 
                        : "bg-white/5 border border-white/5 text-gray-200 rounded-tl-none"
                    }`}
                  >
                    {message.role === "user" && (message as any).metadata?.image && (
                      <img 
                        src={(message as any).metadata.image} 
                        alt="Uploaded context" 
                        className="max-w-xs max-h-48 rounded-xl object-cover mb-2 border border-white/10 shadow animate-in fade-in zoom-in-95 duration-200" 
                      />
                    )}
                    <div className="whitespace-pre-wrap">
                      {message.parts
                        ? message.parts.map((part, idx) => (part.type === "text" ? (part as any).text : null))
                        : (message as any).content}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-gray-300 flex items-center justify-center shrink-0 shadow-md">
                      <User className="h-4.5 w-4.5" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-4 justify-start animate-pulse">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-none px-4.5 py-3.5 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Footer Prompt Input */}
        <div className="p-6 border-t border-white/5 bg-[#06070a]/60 backdrop-blur-md shrink-0">
          <div className="max-w-3xl mx-auto">
            {imagePreview && (
              <div className="relative inline-block mb-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <img src={imagePreview} alt="Preview" className="h-20 w-20 rounded-xl object-cover border border-white/10 shadow" />
                <button 
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setVisionImage(null);
                  }}
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow transition-colors flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSend} className="relative">
              <label className="absolute left-3.5 bottom-2.5 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-center">
                <ImageIcon className="h-4.5 w-4.5" />
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageChange} 
                  className="hidden" 
                />
              </label>
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() || visionImage) {
                       const form = e.currentTarget.form;
                       if (form) form.requestSubmit();
                    }
                  }
                }}
                rows={1}
                placeholder={codeMode ? "Explain, generate, or debug code..." : "Ask Aether a question... (Press Enter to send)"}
                className="w-full pl-14 pr-14 py-4 rounded-2xl text-sm text-white glass-input outline-none resize-none min-h-[52px] max-h-36 block"
              />
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !visionImage)}
                className="absolute right-3.5 bottom-2.5 p-2 rounded-xl text-white bg-gradient-to-tr from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-[0.92] shadow-md shadow-indigo-500/10"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="text-[10px] text-gray-500 text-center mt-3 font-medium tracking-wide uppercase">
              FastAPI backend &bull; Anthropic stream &bull; Zustand state
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
