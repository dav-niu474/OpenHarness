import { create } from 'zustand';

export type Page =
  | 'dashboard'
  | 'playground'
  | 'tools'
  | 'skills'
  | 'swarm'
  | 'memory'
  | 'permissions'
  | 'tasks';

// ── Domain Types ──────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
  type: string;
  provider: string;
  model: string;
  status: string;
  systemPrompt: string;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolResults?: unknown;
  tokenCount?: number;
  createdAt: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  inputSchema: string;
  permissionMode: string;
  isEnabled: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  isLoaded: boolean;
}

export interface Task {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

// ── Store Interface ───────────────────────────────────────────

interface AgentStore {
  // Navigation
  activePage: Page;
  setActivePage: (page: Page) => void;

  // Agent state
  agents: Agent[];
  selectedAgent: Agent | null;
  setSelectedAgent: (agent: Agent | null) => void;

  // Conversation state
  conversations: Conversation[];
  activeConversation: Conversation | null;
  setActiveConversation: (conv: Conversation | null) => void;
  messages: Message[];
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  isStreaming: boolean;
  setIsStreaming: (val: boolean) => void;

  // Tools state
  tools: Tool[];
  setTools: (tools: Tool[]) => void;

  // Skills state
  skills: Skill[];
  setSkills: (skills: Skill[]) => void;

  // Task state
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
}

// ── Store Implementation ──────────────────────────────────────

export const useAgentStore = create<AgentStore>((set) => ({
  // Navigation
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),

  // Agent state
  agents: [],
  selectedAgent: null,
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),

  // Conversation state
  conversations: [],
  activeConversation: null,
  setActiveConversation: (conv) => set({ activeConversation: conv }),
  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  isStreaming: false,
  setIsStreaming: (val) => set({ isStreaming: val }),

  // Tools state
  tools: [],
  setTools: (tools) => set({ tools }),

  // Skills state
  skills: [],
  setSkills: (skills) => set({ skills }),

  // Task state
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
}));
