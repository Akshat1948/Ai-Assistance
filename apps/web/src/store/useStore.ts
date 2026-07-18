import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  
  currentModel: string;
  setCurrentModel: (model: string) => void;
  
  codeMode: boolean;
  toggleCodeMode: () => void;
  setCodeMode: (active: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  systemPrompt: "You are a helpful, premium AI assistant. Assist the user with clarity and precision.",
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  
  isSettingsOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  
  currentModel: "claude-3-5-sonnet-20240620",
  setCurrentModel: (model) => set({ currentModel: model }),
  
  codeMode: false,
  toggleCodeMode: () => set((state) => ({ codeMode: !state.codeMode })),
  setCodeMode: (active) => set({ codeMode: active }),
}));
