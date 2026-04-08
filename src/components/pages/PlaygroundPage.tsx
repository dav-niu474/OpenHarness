'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Send,
  Paperclip,
  CheckCircle2,
  Clock,
  User,
  CircleDot,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Cpu,
  Brain,
  ChevronDown,
  Lightbulb,
  Zap,
  BookOpen,
  RotateCcw,
  Terminal,
  ArrowDown,
  MessageSquare,
  X,
  StopCircle,
  AlertTriangle,
  Network,
  ToggleLeft,
  ToggleRight,
  Wand2,
  ArrowRight,
  ListChecks,
  ClipboardList,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

interface AgentOption {
  id: string;
  name: string;
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
  description: string;
  icon: string;
  borderCss: string;
  ringCss: string;
}

type MessageRole = 'user' | 'assistant' | 'tool' | 'skill';

interface ToolCallInfo {
  id?: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  status?: 'running' | 'success' | 'error';
  duration?: number;
  iteration?: number;
}

interface SkillCallInfo {
  name: string;
  description: string;
  status?: 'loading' | 'loaded' | 'error';
  category?: string;
}

type CollaborativePhase = 'coordinating' | 'executing' | 'synthesizing';

interface TaskPlanData {
  title: string;
  steps: string[];
  complexity: string;
  completedSteps: number[];
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  skillCalls?: SkillCallInfo[];
  agentId?: string;
  model?: string;
  timestamp?: string;
  isStreaming?: boolean;
  tokenCount?: number;
  isMultiAgentDivider?: boolean;
  isSynthesis?: boolean;
  collaborativePhase?: CollaborativePhase;
  previousAgentContext?: string;
  taskPlan?: TaskPlanData | null;
  isPlanning?: boolean;
}

interface ConversationItem {
  id: string;
  title: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: string;
}

interface SkillData {
  id: string;
  name: string;
  description: string | null;
  content: string;
  category: string;
  isLoaded: boolean;
}

type AgentMode = 'single' | 'multi';

type LoopStatus = 'idle' | 'thinking' | 'planning' | 'executing' | 'tool_executing' | 'coordinating' | 'synthesizing';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'default', name: 'Default (z-ai-sdk)', provider: 'zai', description: 'Default AI model' },
  { id: 'z-ai/glm4.7', name: 'GLM 4.7', provider: 'nvidia', description: 'Zhipu AI — 中文理解和代码生成' },
  { id: 'z-ai/glm5', name: 'GLM 5', provider: 'nvidia', description: 'Zhipu AI — 最新一代推理' },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi 2.5', provider: 'nvidia', description: 'Moonshot AI — 长上下文' },
];

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    label: 'Alpha - Code Assistant',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600',
    borderColor: 'border-emerald-200',
    bgColor: 'bg-emerald-50',
    description: 'Expert in code writing, review, and refactoring',
    icon: '💻',
    borderCss: 'border-l-emerald-500',
    ringCss: 'ring-emerald-500/20',
  },
  {
    id: 'beta',
    name: 'Beta',
    label: 'Beta - Research Agent',
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50',
    description: 'Specialized in web search and data analysis',
    icon: '🔍',
    borderCss: 'border-l-amber-500',
    ringCss: 'ring-amber-500/20',
  },
  {
    id: 'gamma',
    name: 'Gamma',
    label: 'Gamma - DevOps Agent',
    color: 'bg-cyan-500',
    textColor: 'text-cyan-600',
    borderColor: 'border-cyan-200',
    bgColor: 'bg-cyan-50',
    description: 'CI/CD pipelines and infrastructure management',
    icon: '🚀',
    borderCss: 'border-l-cyan-500',
    ringCss: 'ring-cyan-500/20',
  },
];

const QUICK_PROMPTS = [
  { label: 'Search the web', prompt: 'Search the web for "Next.js 15 latest features 2025" and summarize the results.' },
  { label: 'List agents & tools', prompt: 'Use the Agent tool to list all available agents in the system, then use the Skill tool to list available skills.' },
  { label: 'Create a task', prompt: 'Create a task titled "Review code quality" with high priority, then list all tasks to verify it was created.' },
  { label: 'Debug an issue', prompt: 'I have a React component that re-renders infinitely. Here is the code:\n\n```tsx\nuseEffect(() => {\n  const data = fetchData();\n  setData(data);\n}, [data]);\n```\n\nWhat\'s wrong and how do I fix it?' },
];

const SKILL_CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  development: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  document: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  research: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
  communication: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200' },
};

// ═══════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════

function getAgentConfig(agentId: string): AgentOption {
  return AGENT_OPTIONS.find((a) => a.id === agentId) ?? AGENT_OPTIONS[0];
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


// ═══════════════════════════════════════════════════════════════════
// THINKING BLOCK COMPONENT (Premium)
// ═══════════════════════════════════════════════════════════════════

function ThinkingBlock({ thinking, isStreaming, isDone }: { thinking: string; isStreaming?: boolean; isDone?: boolean }) {
  // For loaded messages from DB: start collapsed with thinking available
  const isLoadedMessage = !isStreaming && !!thinking && isDone;
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);

  // Auto-open while streaming (render-time prop sync — React-approved pattern)
  const [prevStreaming, setPrevStreaming] = useState(!!isStreaming);
  if (!!isStreaming !== prevStreaming) {
    setPrevStreaming(!!isStreaming);
    if (isStreaming) {
      setIsOpen(true);
      setHasAutoCollapsed(false);
    }
  }

  // Auto-collapse when thinking is done and content has started (once per stream)
  const [prevDone, setPrevDone] = useState(!!isDone);
  if (!!isDone !== prevDone) {
    setPrevDone(!!isDone);
    if (isDone && !hasAutoCollapsed) {
      setIsOpen(false);
      setHasAutoCollapsed(true);
    }
  }

  // Don't render if no thinking content and not streaming
  if (!thinking && !isStreaming) return null;

  return (
    <div className="mb-1">
      {thinking ? (
        <Collapsible open={isOpen} onOpenChange={(open) => { if (!isStreaming) setIsOpen(open); }}>
          <div className="overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/50 dark:hover:bg-white/[0.03] transition-colors rounded">
              <Brain className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              <span className="text-[11px] text-muted-foreground/70 flex-1">
                {isStreaming ? 'Thinking…' : `Thoughts (${thinking.length} chars)`}
              </span>
              <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform duration-150 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="max-h-64 overflow-y-auto">
                <div className="px-2.5 pb-2.5 pt-1.5 font-mono text-xs leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">
                  {thinking}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-muted-foreground/50 ml-0.5 align-text-bottom animate-pulse" />
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : null}

      {/* Analyzing indicator — shown when streaming but no thinking content yet */}
      {isStreaming && !thinking && (
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <motion.div className="flex gap-1" aria-hidden="true">
            <motion.span
              className="w-1 h-1 rounded-full bg-amber-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-1 h-1 rounded-full bg-amber-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
            />
            <motion.span
              className="w-1 h-1 rounded-full bg-amber-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
            />
          </motion.div>
          <span className="text-[11px] text-muted-foreground/70">Analyzing your request…</span>
        </div>
      )}

      {/* Subtle indicator below thinking block during thinking phase */}
      {isStreaming && thinking && !isDone && (
        <div className="flex items-center gap-1.5 px-2.5 pt-0.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
          </span>
          <span className="text-[10px] text-muted-foreground/50">Analyzing your request…</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOOL CALL CARD COMPONENT (Premium Glassmorphism)
// ═══════════════════════════════════════════════════════════════════

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [isOpen, setIsOpen] = useState(false);
  const status = toolCall.status || 'success';

  const statusStyles = {
    running: {
      icon: Loader2,
      color: 'text-amber-500',
      borderLeft: 'border-l-amber-500',
      label: 'Running',
      animate: true,
      dotColor: 'bg-amber-400',
    },
    success: {
      icon: CheckCircle2,
      color: 'text-emerald-500',
      borderLeft: 'border-l-emerald-500',
      label: 'Done',
      animate: false,
      dotColor: 'bg-emerald-400',
    },
    error: {
      icon: AlertTriangle,
      color: 'text-red-500',
      borderLeft: 'border-l-red-500',
      label: 'Error',
      animate: false,
      dotColor: 'bg-red-400',
    },
  };

  const config = statusStyles[status as keyof typeof statusStyles] || statusStyles.success;
  const StatusIcon = config.icon;

  return (
    <div
      className={`rounded-xl overflow-hidden my-2 backdrop-blur-md bg-white/70 dark:bg-zinc-900/70 border border-white/20 dark:border-zinc-700/50 shadow-lg border-l-[3px] ${config.borderLeft}`}
    >
      {/* Terminal-style header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors text-left"
      >
        {/* Pulsing dot */}
        <div className="relative flex items-center justify-center">
          <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
          {status === 'running' && (
            <motion.div
              className={`absolute w-2 h-2 rounded-full ${config.dotColor}`}
              animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>

        <Terminal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex-1 font-mono">
          {toolCall.tool}
        </span>

        {toolCall.duration != null && toolCall.duration > 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground font-mono">
            {toolCall.duration}ms
          </Badge>
        )}

        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.color} bg-current/10`}>
          {config.label}
        </span>

        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3 border-t border-zinc-200/50 dark:border-zinc-700/50 pt-3">
              {/* Input */}
              {Object.keys(toolCall.input).length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Input</span>
                  </div>
                  <div className="bg-zinc-900/90 rounded-lg p-3 border border-zinc-700/50 max-h-48 overflow-y-auto">
                    <pre className="text-[12px] text-emerald-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(toolCall.input, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {/* Result */}
              {toolCall.result && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Result</span>
                  </div>
                  <div className="bg-zinc-900/90 rounded-lg p-3 border border-zinc-700/50 max-h-48 overflow-y-auto">
                    <pre className="text-[12px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                      {toolCall.result}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SKILL CALL CARD COMPONENT (Premium)
// ═══════════════════════════════════════════════════════════════════

function SkillCallCard({ skillCall }: { skillCall: SkillCallInfo }) {
  const [isOpen, setIsOpen] = useState(false);
  const status = skillCall.status || 'loaded';

  const statusConfig = {
    loading: { icon: Loader2, color: 'text-amber-500', label: 'Loading', animate: true },
    loaded: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Loaded', animate: false },
    error: { icon: AlertTriangle, color: 'text-red-500', label: 'Error', animate: false },
  };
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.loaded;
  const StatusIcon = config.icon;

  const categoryColors = SKILL_CATEGORY_COLORS[skillCall.category || 'general'] || SKILL_CATEGORY_COLORS.general;

  return (
    <div className="my-2 rounded-xl overflow-hidden relative">
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/30 via-fuchsia-500/30 to-emerald-500/30 opacity-50" />
      <div className="relative rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-white/30 dark:border-zinc-700/60 overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left"
        >
          {/* Icon with glow */}
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="absolute -inset-0.5 rounded-lg bg-violet-400/20 blur-sm" />
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">{skillCall.name}</span>
            {skillCall.description && (
              <p className="text-[11px] text-zinc-500 truncate">{skillCall.description}</p>
            )}
          </div>

          {/* Category badge */}
          {skillCall.category && (
            <Badge className={`text-[9px] h-4 px-1.5 ${categoryColors.bg} ${categoryColors.text} ${categoryColors.border} border`}>
              {skillCall.category}
            </Badge>
          )}

          <StatusIcon className={`w-3.5 h-3.5 ${config.color} shrink-0 ${config.animate ? 'animate-spin' : ''}`} />
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 border-t border-zinc-200/50 dark:border-zinc-700/50 pt-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-violet-500 border-violet-300">
                    Skill
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-emerald-500 border-emerald-300">
                    {config.label}
                  </Badge>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOOL CALL CHAIN — Visual Pipeline Component
// ═══════════════════════════════════════════════════════════════════

interface TimelineItem {
  id: string;
  type: 'tool' | 'skill';
  name: string;
  status: string;
  input?: Record<string, unknown>;
  result?: string;
  description?: string;
  duration?: number;
  iteration?: number;
}

function ToolCallChain({
  toolCalls,
  skillCalls,
  isStreaming,
}: {
  toolCalls?: ToolCallInfo[];
  skillCalls?: SkillCallInfo[];
  isStreaming?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!toolCalls?.length && !skillCalls?.length) return null;

  const items: TimelineItem[] = [
    ...(toolCalls || []).map((tc) => ({
      id: tc.id || `tc-${tc.tool}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'tool' as const,
      name: tc.tool,
      status: tc.status || 'success',
      input: tc.input,
      result: tc.result,
      duration: tc.duration,
      iteration: tc.iteration,
    })),
    ...(skillCalls || []).map((sc) => ({
      id: `sc-${sc.name}`,
      type: 'skill' as const,
      name: sc.name,
      status: sc.status || 'loaded',
      description: sc.description,
    })),
  ];

  const runningCount = items.filter(
    (i) => i.status === 'running' || i.status === 'loading'
  ).length;
  const successCount = items.filter((i) => i.status === 'success' || i.status === 'loaded').length;

  return (
    <div className="my-1.5">
      {/* Header for multi-item chains */}
      {items.length > 0 && (
        <div className="text-[10px] text-muted-foreground/50 mb-1 ml-[18px] font-medium">
          {items.length} operation{items.length > 1 ? 's' : ''}
          {runningCount > 0
            ? ` · ${runningCount} active`
            : successCount === items.length
              ? ' · completed'
              : ''}
        </div>
      )}

      <div className="relative">
        {/* Vertical connector line */}
        {items.length > 1 && (
          <div className="absolute left-[5px] top-[7px] bottom-[7px] w-px bg-zinc-200 dark:bg-zinc-700/60" />
        )}

        <div className="flex flex-col">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const isRunning = item.status === 'running' || item.status === 'loading';
            const isSuccess = item.status === 'success' || item.status === 'loaded';
            const isError = item.status === 'error';

            return (
              <div key={item.id}>
                {/* Node row */}
                <div className="flex items-start gap-2.5 py-[3px]">
                  {/* Timeline dot */}
                  <div className="relative z-10 shrink-0 mt-[5px]">
                    {isRunning ? (
                      <motion.div
                        className="w-[10px] h-[10px] rounded-full"
                        style={{
                          backgroundColor:
                            item.type === 'tool' ? 'rgb(251, 191, 36)' : 'rgb(167, 139, 250)',
                        }}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0.25, 0.7] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    ) : isSuccess ? (
                      <motion.div
                        initial={isStreaming ? { scale: 0.5, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="w-[10px] h-[10px] rounded-full bg-emerald-500"
                      />
                    ) : isError ? (
                      <div className="w-[10px] h-[10px] rounded-full bg-red-400" />
                    ) : (
                      <div className="w-[10px] h-[10px] rounded-full bg-zinc-400 dark:bg-zinc-500" />
                    )}
                  </div>

                  {/* Node content */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center gap-2 px-2 py-[3px] rounded-md hover:bg-muted/50 dark:hover:bg-white/[0.03] transition-colors text-left group/node min-w-0 flex-1"
                  >
                    {/* Icon */}
                    {item.type === 'tool' ? (
                      <Terminal className="w-3 h-3 text-zinc-400 shrink-0" />
                    ) : (
                      <BookOpen className="w-3 h-3 text-violet-400 shrink-0" />
                    )}

                    {/* Name */}
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 font-mono truncate">
                      {item.name}
                    </span>

                    {/* Iteration badge */}
                    {item.type === 'tool' && item.iteration && item.iteration > 1 && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 shrink-0">
                        loop {item.iteration}
                      </span>
                    )}

                    {/* Duration */}
                    {item.type === 'tool' && item.duration != null && item.duration > 0 && (
                      <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0">
                        {item.duration}ms
                      </span>
                    )}

                    {/* Status indicator */}
                    {isRunning && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0">
                        running
                      </span>
                    )}
                    {isSuccess && (
                      <motion.div
                        initial={isStreaming ? { scale: 0, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      </motion.div>
                    )}
                    {isError && (
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    )}

                    {/* Expand chevron */}
                    <ChevronDown
                      className={`w-2.5 h-2.5 text-zinc-400 transition-transform duration-150 shrink-0 ${
                        isExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </button>
                </div>

                {/* Expanded details */}
                <AnimatePresence initial={false}>
                  {isExpanded && item.type === 'tool' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-[18px] mr-1 mb-1.5 space-y-1.5">
                        {/* Input */}
                        {item.input && Object.keys(item.input).length > 0 && (
                          <div className="rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/40 p-2 max-h-36 overflow-y-auto">
                            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Input
                            </div>
                            <pre className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                              {JSON.stringify(item.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {/* Result */}
                        {item.result && (
                          <div className="rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/40 p-2 max-h-36 overflow-y-auto">
                            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Result
                            </div>
                            <pre className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                              {item.result}
                            </pre>
                          </div>
                        )}
                        {/* Empty state */}
                        {!item.input?.keys?.length && !item.result && (
                          <div className="text-[10px] text-muted-foreground/50 py-1">
                            No details available
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TASK PLAN BLOCK COMPONENT
// ═══════════════════════════════════════════════════════════════════

function TaskPlanBlock({
  taskPlan,
  isStreaming,
}: {
  taskPlan: TaskPlanData;
  isStreaming?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const completedCount = taskPlan.completedSteps?.length || 0;
  const totalCount = taskPlan.steps?.length || 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const complexityConfig = {
    simple: { color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', label: 'Simple' },
    moderate: { color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', label: 'Moderate' },
    complex: { color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', label: 'Complex' },
  };
  const cplx = complexityConfig[taskPlan.complexity as keyof typeof complexityConfig] || complexityConfig.moderate;

  if (!taskPlan.steps || taskPlan.steps.length === 0) return null;

  return (
    <div className="my-2 rounded-xl overflow-hidden">
      <div className={`rounded-xl border ${cplx.border} ${cplx.bg} backdrop-blur-sm`}>
        {/* Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left"
        >
          <div className="relative">
            <div className={`w-7 h-7 rounded-lg ${cplx.bg} flex items-center justify-center`}>
              <ClipboardList className={`w-3.5 h-3.5 ${cplx.color}`} />
            </div>
            {isStreaming && (
              <motion.div
                className={`absolute -inset-0.5 rounded-lg ${cplx.color.replace('text-', 'bg-').replace('500', '400')}/20 blur-sm`}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block truncate">
              {taskPlan.title}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[9px] h-4 px-1.5 ${cplx.color} ${cplx.bg} ${cplx.border} border`}>
                {cplx.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {completedCount}/{totalCount} steps
              </span>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className={`text-[10px] font-mono ${cplx.color}`}>
              {progressPercent}%
            </span>
          </div>

          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </motion.div>
        </button>

        {/* Checklist */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-1.5 border-t border-zinc-200/50 dark:border-zinc-700/50 pt-2.5">
                {taskPlan.steps.map((step, i) => {
                  const stepIndex = i + 1;
                  const isCompleted = taskPlan.completedSteps?.includes(stepIndex) || false;

                  return (
                    <motion.div
                      key={i}
                      initial={isStreaming ? { opacity: 0, x: -8 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      className="flex items-start gap-2.5 py-1"
                    >
                      {/* Checkbox */}
                      <div className="relative mt-0.5 shrink-0">
                        {isCompleted ? (
                          <motion.div
                            initial={{ scale: 0.5 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          </motion.div>
                        ) : (
                          <div className="w-4 h-4 rounded border-2 border-zinc-300 dark:border-zinc-600" />
                        )}
                      </div>

                      {/* Step text */}
                      <span className={`text-xs leading-relaxed flex-1 ${isCompleted ? 'text-muted-foreground line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {step}
                      </span>

                      {/* Step number */}
                      <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0 mt-px">
                        {stepIndex}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PLANNING INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════

function PlanningIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2.5 px-3 py-2 my-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <ListChecks className="w-4 h-4 text-violet-500" />
      </motion.div>
      <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
        Creating task plan...
      </span>
      <motion.div className="flex gap-0.5" aria-hidden="true">
        <motion.span
          className="w-1 h-1 rounded-full bg-violet-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
        />
        <motion.span
          className="w-1 h-1 rounded-full bg-violet-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
        />
        <motion.span
          className="w-1 h-1 rounded-full bg-violet-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
        />
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGENT BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════

function AgentBadge({ agentId, model }: { agentId?: string; model?: string }) {
  const agent = getAgentConfig(agentId || 'alpha');
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${agent.textColor} ${agent.borderColor}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1" />
        {agent.name}
      </Badge>
      {model && (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground border-muted-foreground/20">
          <Cpu className="w-2.5 h-2.5 mr-0.5" />
          {model}
        </Badge>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CODE BLOCK COMPONENT (Premium with line numbers & header)
// ═══════════════════════════════════════════════════════════════════

const LANGUAGE_ICONS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'Py',
  rust: 'Rs',
  go: 'Go',
  bash: 'Sh',
  shell: 'Sh',
  json: '{}',
  html: '<>',
  css: '#',
  sql: 'DB',
  java: 'Jv',
  cpp: 'C++',
  c: 'C',
  ruby: 'Rb',
  php: 'Php',
  swift: 'Sw',
  kotlin: 'Kt',
  dart: 'Dt',
  yaml: 'YM',
  yml: 'YM',
  toml: 'TM',
  graphql: 'GQ',
  jsx: 'JX',
  tsx: 'TX',
  markdown: 'MD',
  dockerfile: 'DK',
};

function CodeBlockWrapper({
  language,
  children,
}: {
  language: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const lines = codeString.split('\n');
  const lineCount = lines.length;
  const langLabel = language?.toLowerCase() || '';
  const langIcon = LANGUAGE_ICONS[langLabel] || null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-700/50 shadow-lg group/code">
      {/* File-like tab header with gradient */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-750 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          {/* Language icon/badge */}
          <div className="w-5 h-5 rounded bg-zinc-700/80 flex items-center justify-center text-[9px] font-bold text-zinc-400">
            {langIcon || '<>'}
          </div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            {language || 'code'}
          </span>
          {lineCount > 1 && (
            <span className="text-[10px] text-zinc-600 ml-1">{lineCount} lines</span>
          )}
        </div>
        <motion.button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors px-2.5 py-1 rounded-md hover:bg-zinc-700/50"
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-1 text-emerald-400"
              >
                <Check className="w-3 h-3" />
                Copied!
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Copy
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Code area with line numbers */}
      {language ? (
        <div className="relative">
          {lineCount > 1 && (
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-zinc-800/50 border-r border-zinc-700/30 flex flex-col items-end pr-3 pt-4 select-none overflow-hidden">
              {lines.map((_, i) => (
                <span
                  key={i}
                  className="text-[12px] leading-[1.6] text-zinc-600 hover:text-zinc-400 transition-colors font-mono"
                >
                  {i + 1}
                </span>
              ))}
            </div>
          )}
          <SyntaxHighlighter
            style={oneDark}
            language={language}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: '1rem',
              paddingLeft: lineCount > 1 ? '3.5rem' : '1rem',
              fontSize: '13px',
              lineHeight: '1.6',
              background: '#18181b',
            }}
            showLineNumbers={false}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      ) : (
        <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto">
          <code className="text-[13px] leading-[1.6] font-mono">{children}</code>
        </pre>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RICH MARKDOWN RENDERER (Premium)
// ═══════════════════════════════════════════════════════════════════

function RichMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none
      prose-p:my-1.5 prose-p:leading-relaxed
      prose-headings:my-3 prose-headings:text-foreground prose-headings:font-bold
      prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent prose-pre:rounded-none
      prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
      prose-blockquote:my-2 prose-blockquote:border-l-emerald-500 prose-blockquote:bg-emerald-50/50 dark:prose-blockquote:bg-emerald-950/20 prose-blockquote:border prose-blockquote:py-1.5 prose-blockquote:px-3 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
      prose-table:text-xs prose-table:w-full
      prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:font-semibold prose-th:border-b-2 prose-th:border-border
      prose-td:px-3 prose-td:py-2 prose-td:border-border prose-td:even:bg-muted/30
      prose-tr:hover:prose-td:bg-muted/50
      prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-a:no-underline prose-a:font-medium
      hover:prose-a:underline prose-a:decoration-emerald-300 hover:prose-a:decoration-emerald-500
      prose-code:text-[13px] prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
      prose-img:rounded-lg prose-img:border prose-img:shadow-md prose-hr:border-border
      dark:prose-headings:text-zinc-100 dark:prose-p:text-zinc-300 dark:prose-li:text-zinc-300 dark:prose-strong:text-zinc-100
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            if (isInline) {
              return (
                <code className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md text-[13px] font-mono text-zinc-800 dark:text-zinc-200" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <CodeBlockWrapper language={match ? match[1] : ''}>
                {children}
              </CodeBlockWrapper>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-border shadow-sm">
                <table className="w-full">{children}</table>
              </div>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 no-underline font-medium hover:underline decoration-emerald-300 hover:decoration-emerald-500 transition-all inline-flex items-center gap-0.5"
                {...props}
              >
                {children}
                <span className="text-[10px]">↗</span>
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE ACTION BUTTONS
// ═══════════════════════════════════════════════════════════════════

function MessageActions({
  message,
  onCopy,
  onRetry,
}: {
  message: ChatMessage;
  onCopy: (content: string) => void;
  onRetry?: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showActions && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-0.5"
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onCopy(message.content)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Copy message</TooltipContent>
              </Tooltip>
              {message.thinking && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-muted-foreground hover:text-foreground"
                      onClick={() => onCopy(message.thinking!)}
                    >
                      <Brain className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Copy thinking</TooltipContent>
                </Tooltip>
              )}
              {onRetry && message.role === 'assistant' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-muted-foreground hover:text-foreground"
                      onClick={onRetry}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Retry</TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-AGENT DIVIDER
// ═══════════════════════════════════════════════════════════════════

function AgentDivider({ agentId, context }: { agentId: string; context?: string }) {
  const agent = getAgentConfig(agentId);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="my-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${agent.bgColor} border ${agent.borderColor}`}>
          <span className="text-xs">{agent.icon}</span>
          <span className={`text-xs font-semibold ${agent.textColor}`}>{agent.name}</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
      </div>
      {context && (
        <p className="text-[10px] text-muted-foreground/70 mt-1.5 text-center italic px-4">
          Building on previous agents&apos; work
        </p>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COLLABORATIVE PHASE DIVIDER
// ═══════════════════════════════════════════════════════════════════

function CollaborativePhaseDivider({
  phase,
  agentId,
  agentIndex,
  totalAgents,
}: {
  phase: CollaborativePhase;
  agentId?: string;
  agentIndex?: number;
  totalAgents?: number;
}) {
  if (phase === 'coordinating') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 my-4"
      >
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <Network className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Coordinating</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />
      </motion.div>
    );
  }

  if (phase === 'synthesizing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-300 dark:via-violet-700 to-transparent" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
            <Wand2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">Final Synthesis</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-300 dark:via-violet-700 to-transparent" />
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1.5 text-center italic px-4">
          Combining insights from all agents into a coherent response
        </p>
      </motion.div>
    );
  }

  // Executing phase with agent info
  if (phase === 'executing' && agentId) {
    const agent = getAgentConfig(agentId);
    const isBuildingOnPrevious = agentIndex !== undefined && agentIndex !== undefined && agentIndex > 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${agent.bgColor} border ${agent.borderColor}`}>
            <span className="text-xs">{agent.icon}</span>
            <span className={`text-xs font-semibold ${agent.textColor}`}>{agent.name}</span>
            {totalAgents && agentIndex !== undefined && (
              <span className="text-[10px] text-muted-foreground ml-1">
                ({agentIndex + 1}/{totalAgents})
              </span>
            )}
            {isBuildingOnPrevious && (
              <>
                <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[10px] text-muted-foreground">building on collaborators</span>
              </>
            )}
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
        </div>
        {isBuildingOnPrevious && (
          <p className="text-[10px] text-muted-foreground/70 mt-1.5 text-center italic px-4">
            Can see and reference previous agents&apos; work
          </p>
        )}
      </motion.div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// CHAT MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════

function ChatBubble({
  message,
  onCopy,
  onRetry,
  showAvatar = true,
}: {
  message: ChatMessage;
  onCopy: (content: string) => void;
  onRetry?: () => void;
  showAvatar?: boolean;
}) {
  const agent = getAgentConfig(message.agentId || 'alpha');
  const isUser = message.role === 'user';

  if (message.isMultiAgentDivider && message.collaborativePhase) {
    return (
      <CollaborativePhaseDivider
        phase={message.collaborativePhase}
        agentId={message.agentId}
        agentIndex={message.previousAgentContext ? 1 : undefined}
      />
    );
  }

  if (message.isMultiAgentDivider && message.agentId) {
    return <AgentDivider agentId={message.agentId} context={message.previousAgentContext} />;
  }

  if (message.role === 'tool' && message.toolCalls?.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-start max-w-[85%]"
      >
        <div className="space-y-1">
          {message.toolCalls.map((tc, idx) => (
            <ToolCallCard key={`${tc.tool}-${idx}`} toolCall={tc} />
          ))}
        </div>
      </motion.div>
    );
  }

  if (message.role === 'skill' && message.skillCalls?.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-start max-w-[85%]"
      >
        <div className="space-y-1">
          {message.skillCalls.map((sc) => (
            <SkillCallCard key={sc.name} skillCall={sc} />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex gap-2.5 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={`
            flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 text-xs shadow-sm
            ${isUser
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : `${agent.color} text-white`
            }
          `}
        >
          {isUser ? (
            <User className="w-3.5 h-3.5" />
          ) : (
            <span>{agent.icon}</span>
          )}
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Synthesis label for synthesis messages */}
        {!isUser && message.isSynthesis && showAvatar && (
          <div className="flex items-center gap-1.5 px-1">
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
              <Wand2 className="w-2.5 h-2.5 mr-0.5" />
              Synthesis
            </Badge>
            {message.timestamp && (
              <span className="text-[10px] text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
            )}
          </div>
        )}
        {/* Coordinator label */}
        {!isUser && message.agentId === 'coordinator' && showAvatar && (
          <div className="flex items-center gap-1.5 px-1">
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
              <Network className="w-2.5 h-2.5 mr-0.5" />
              Coordinator
            </Badge>
            {message.timestamp && (
              <span className="text-[10px] text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
            )}
          </div>
        )}
        {/* Agent info header for assistant */}
        {!isUser && message.agentId && message.agentId !== 'coordinator' && !message.isSynthesis && showAvatar && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-semibold text-foreground">{agent.name}</span>
            {message.timestamp && (
              <span className="text-[10px] text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
            )}
          </div>
        )}

        {/* ThinkingBlock — OUTSIDE bubble, above it */}
        {!isUser && (message.thinking || message.isStreaming) && (
          <ThinkingBlock
            thinking={message.thinking || ''}
            isStreaming={message.isStreaming}
            isDone={!message.isStreaming && !!message.content}
          />
        )}

        {/* Planning Indicator — shown during planning phase */}
        {!isUser && message.isPlanning && message.isStreaming && !message.taskPlan && (
          <PlanningIndicator />
        )}

        {/* TaskPlan Block — structured checklist */}
        {!isUser && message.taskPlan && (
          <TaskPlanBlock
            taskPlan={message.taskPlan}
            isStreaming={message.isStreaming}
          />
        )}

        {/* ToolCallChain — OUTSIDE bubble, between ThinkingBlock and bubble */}
        {!isUser && (message.toolCalls?.length || message.skillCalls?.length) && (
          <ToolCallChain
            toolCalls={message.toolCalls}
            skillCalls={message.skillCalls}
            isStreaming={message.isStreaming}
          />
        )}

        {/* Bubble */}
        <div
          className={`
            rounded-xl px-4 py-2.5 text-sm leading-relaxed relative shadow-sm
            ${isUser
              ? 'bg-emerald-600 dark:bg-emerald-600 text-white rounded-tr-sm'
              : 'bg-muted dark:bg-zinc-800/50 rounded-tl-sm text-foreground'
            }
          `}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">
              {message.content.split('\n').map((line, idx) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < message.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <>
              {/* Main content */}
              {message.content ? (
                <RichMarkdown content={message.content} />
              ) : !message.isStreaming ? null : null}
              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <motion.span
                  className="inline-block w-[2px] h-4 bg-emerald-400 ml-0.5 align-text-bottom rounded-full"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              )}
            </>
          )}
        </div>

        {/* Footer: Agent badge + Model info + Actions */}
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <AgentBadge agentId={message.agentId} model={message.model} />
            {!message.isStreaming && (
              <MessageActions message={message} onCopy={onCopy} onRetry={onRetry} />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WELCOME / EMPTY STATE
// ═══════════════════════════════════════════════════════════════════

function WelcomeState({
  agent,
  onQuickPrompt,
}: {
  agent: AgentOption;
  onQuickPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="relative">
          <div
            className={`w-16 h-16 rounded-2xl ${agent.color} flex items-center justify-center mb-5 shadow-lg`}
          >
            <span className="text-2xl">{agent.icon}</span>
          </div>
          <div className={`absolute -inset-2 rounded-3xl ${agent.color} opacity-20 blur-xl`} />
        </div>
      </motion.div>

      <motion.h3
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="text-lg font-semibold mb-1"
      >
        {agent.name} Agent
      </motion.h3>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="text-sm text-muted-foreground max-w-sm mb-8"
      >
        {agent.description}
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="w-full max-w-lg space-y-3"
      >
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Try a quick prompt
        </p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_PROMPTS.map((qp, idx) => (
            <motion.button
              key={idx}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + idx * 0.05, duration: 0.2 }}
              onClick={() => onQuickPrompt(qp.prompt)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/50 px-3 py-2.5 text-left transition-colors group"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors">
                {qp.label}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Capability badges */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="flex flex-wrap items-center gap-2 mt-8"
      >
        <Badge variant="outline" className="text-[10px] h-6">
          <Zap className="w-2.5 h-2.5 mr-1 text-amber-500" />
          19+ Tools
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <BookOpen className="w-2.5 h-2.5 mr-1 text-violet-500" />
          Skills
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <Brain className="w-2.5 h-2.5 mr-1 text-violet-500" />
          Agent Loop
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <Network className="w-2.5 h-2.5 mr-1 text-emerald-500" />
          Multi-Agent
        </Badge>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCROLL TO BOTTOM BUTTON
// ═══════════════════════════════════════════════════════════════════

function ScrollToBottom({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
    >
      <Button
        variant="outline"
        size="icon"
        className="w-8 h-8 rounded-full shadow-md border-muted-foreground/20 bg-background"
        onClick={onClick}
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </Button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SKILLS PANEL (in header)
// ═══════════════════════════════════════════════════════════════════

function SkillsPanel({
  availableSkills,
  enabledSkills,
  onToggleSkill,
}: {
  availableSkills: SkillData[];
  enabledSkills: string[];
  onToggleSkill: (skillId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className={`h-7 text-[11px] gap-1.5 px-2 ${enabledSkills.length > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Skills
            {enabledSkills.length > 0 && (
              <Badge className="text-[9px] h-4 px-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-700">
                {enabledSkills.length}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Toggle skills</TooltipContent>
      </Tooltip>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-72 max-h-80 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="p-2 border-b bg-muted/30">
              <div className="flex items-center gap-2 px-1">
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold">Available Skills</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{availableSkills.length} total</span>
              </div>
            </div>
            <div className="overflow-y-auto max-h-60 p-2">
              {availableSkills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading skills...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {availableSkills.map((skill) => {
                    const isEnabled = enabledSkills.includes(skill.id);
                    const catColors = SKILL_CATEGORY_COLORS[skill.category] || SKILL_CATEGORY_COLORS.general;
                    return (
                      <motion.button
                        key={skill.id}
                        onClick={() => onToggleSkill(skill.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs group/skill
                          ${isEnabled
                            ? 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800'
                            : 'hover:bg-muted border border-transparent'
                          }
                        `}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isEnabled ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'}`}>
                          {isEnabled ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <span className="text-[9px] font-bold">{skill.name[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate">{skill.name}</span>
                            <Badge className={`text-[8px] h-3.5 px-1 ${catColors.bg} ${catColors.text} ${catColors.border} border`}>
                              {skill.category}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ENABLED SKILLS BADGES (shown below header)
// ═══════════════════════════════════════════════════════════════════

function EnabledSkillsBadges({
  availableSkills,
  enabledSkills,
  onRemoveSkill,
}: {
  availableSkills: SkillData[];
  enabledSkills: string[];
  onRemoveSkill: (skillId: string) => void;
}) {
  if (enabledSkills.length === 0) return null;

  const enabled = availableSkills.filter((s) => enabledSkills.includes(s.id));

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-1.5 px-5 py-1.5 bg-violet-50/50 dark:bg-violet-950/10 border-b overflow-x-auto"
    >
      <Sparkles className="w-3 h-3 text-violet-500 shrink-0" />
      <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium shrink-0">Active Skills:</span>
      <AnimatePresence>
        {enabled.map((skill) => (
          <motion.div
            key={skill.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Badge className="text-[10px] h-5 px-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 flex items-center gap-1 cursor-pointer hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors">
              <Zap className="w-2.5 h-2.5" />
              {skill.name}
              <button onClick={() => onRemoveSkill(skill.id)} className="ml-0.5 hover:text-violet-900 dark:hover:text-white">
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-AGENT MODE TOGGLE & CHIP SELECTOR
// ═══════════════════════════════════════════════════════════════════

function MultiAgentSelector({
  mode,
  onModeChange,
  selectedAgents,
  onToggleAgent,
}: {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  selectedAgents: string[];
  onToggleAgent: (agentId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onModeChange(mode === 'single' ? 'multi' : 'single')}
            className={`h-7 text-[11px] gap-1.5 px-2 ${mode === 'multi' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
          >
            {mode === 'single' ? (
              <ToggleLeft className="w-3.5 h-3.5" />
            ) : (
              <ToggleRight className="w-3.5 h-3.5" />
            )}
            {mode === 'multi' ? 'Multi-Agent' : 'Single Agent'}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {mode === 'multi' ? 'Disable multi-agent' : 'Enable multi-agent mode'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function MultiAgentChips({
  selectedAgents,
  onToggleAgent,
  disabled,
}: {
  selectedAgents: string[];
  onToggleAgent: (agentId: string) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 px-5 py-2 bg-emerald-50/50 dark:bg-emerald-950/10 border-b overflow-x-auto"
    >
      <Network className="w-3 h-3 text-emerald-500 shrink-0" />
      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0">Selected Agents:</span>
      {AGENT_OPTIONS.map((agent) => {
        const isSelected = selectedAgents.includes(agent.id);
        return (
          <motion.button
            key={agent.id}
            onClick={() => !disabled && onToggleAgent(agent.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border shrink-0
              ${isSelected
                ? `${agent.bgColor} ${agent.borderColor} ${agent.textColor} shadow-sm`
                : 'bg-muted/50 border-transparent text-muted-foreground hover:border-border'
              }
              ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
            `}
            whileTap={!disabled ? { scale: 0.95 } : undefined}
          >
            <span className="text-xs">{agent.icon}</span>
            {agent.name}
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`w-2 h-2 rounded-full ${agent.color}`}
              />
            )}
          </motion.button>
        );
      })}
      {selectedAgents.length < 2 && (
        <span className="text-[10px] text-muted-foreground ml-1">
          Select 2+ agents for multi-agent mode
        </span>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COORDINATING LOADING STATE
// ═══════════════════════════════════════════════════════════════════

function CoordinatingState({ agents, phase, agentInfo }: { agents: string[]; phase?: CollaborativePhase | null; agentInfo?: { agentId: string; index: number; total: number } | null }) {
  if (phase === 'synthesizing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-6"
      >
        <div className="relative">
          <motion.div
            className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            <Wand2 className="w-5 h-5 text-violet-500" />
          </motion.div>
          <motion.div
            className="absolute w-2 h-2 rounded-full bg-violet-400"
            animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ top: -4, right: -4 }}
          />
        </div>
        <p className="text-xs text-violet-600 dark:text-violet-400 mt-3 font-medium">Synthesizing responses...</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Combining insights from all agents
        </p>
      </motion.div>
    );
  }

  if (phase === 'executing' && agentInfo) {
    const agentConf = getAgentConfig(agentInfo.agentId);
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-6"
      >
        <div className="relative">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${agentConf.color.replace('bg-', 'rgb(')}33)` }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-lg">{agentConf.icon}</span>
          </motion.div>
          <motion.div
            className="absolute w-2 h-2 rounded-full"
            style={{ backgroundColor: agentConf.color.replace('bg-', 'rgb(') }}
            animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>
        <p className="text-xs font-medium mt-3" style={{ color: `var(--${agentConf.textColor.replace('text-', '')})` }}>
          {agentConf.name} is working...
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Agent {agentInfo.index + 1} of {agentInfo.total}
          {agentInfo.index > 0 ? ' · Building on collaborators' : ' · Starting the workflow'}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-8"
    >
      <div className="relative">
        <motion.div
          className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          <Network className="w-6 h-6 text-emerald-500" />
        </motion.div>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`absolute w-2 h-2 rounded-full ${agents[i] ? getAgentConfig(agents[i]).color.replace('bg-', 'bg-') : 'bg-zinc-400'}`}
            animate={{
              x: [0, Math.cos((i * 2 * Math.PI) / 3) * 20, 0],
              y: [0, Math.sin((i * 2 * Math.PI) / 3) * 20, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 font-medium">Coordinating agents...</p>
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        Creating work plan for {agents.map((a) => getAgentConfig(a).name).join(', ')}
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONVERSATION LIST PANEL
// ═══════════════════════════════════════════════════════════════════

function ConversationListPanel({
  selectedAgent,
  onAgentChange,
  activeConvId,
  onConvSelect,
  conversations,
  onNewChat,
  onDeleteConv,
  isLoading,
}: {
  selectedAgent: string;
  onAgentChange: (id: string) => void;
  activeConvId: string;
  onConvSelect: (id: string) => void;
  conversations: ConversationItem[];
  onNewChat: () => void;
  onDeleteConv: (id: string) => void;
  isLoading?: boolean;
}) {
  const filteredConvs = conversations.filter((c) => c.agentId === selectedAgent);

  return (
    <div className="flex flex-col h-full border-r bg-muted/20">
      {/* Agent Selector */}
      <div className="p-3 border-b">
        <Select value={selectedAgent} onValueChange={onAgentChange}>
          <SelectTrigger className="w-full h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_OPTIONS.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${agent.color}`} />
                  <span>{agent.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* New Chat Button */}
      <div className="p-3 border-b">
        <Button
          variant="outline"
          onClick={onNewChat}
          className="w-full justify-start gap-2 text-sm h-9"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Conversation List - using ScrollArea for sidebar (less critical) */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col p-2 gap-1">
          {filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              <span>{isLoading ? 'Loading...' : 'No conversations yet'}</span>
              {!isLoading && <span className="text-[10px]">Start a new chat above</span>}
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const isActive = conv.id === activeConvId;
              const agent = getAgentConfig(conv.agentId);
              const msgCount = conv.messages.length;
              return (
                <div
                  key={conv.id}
                  className={`
                    group relative flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left w-full
                    transition-colors cursor-pointer
                    ${isActive
                      ? `${agent.bgColor} ${agent.borderColor} border`
                      : 'hover:bg-muted text-foreground/80 border border-transparent'
                    }
                  `}
                >
                  <button
                    onClick={() => onConvSelect(conv.id)}
                    className="flex flex-col gap-1 w-full text-left"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent.color}`} />
                      <span className="text-sm font-medium truncate flex-1">{conv.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pl-3.5">
                      <Clock className="w-3 h-3 text-muted-foreground/60" />
                      <span className="text-[11px] text-muted-foreground">{formatTime(conv.createdAt)}</span>
                      {conv.messages.length > 0 && (
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-muted-foreground ml-auto">
                          {conv.messages.length}
                        </Badge>
                      )}
                    </div>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConv(conv.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGENT LOOP STATUS BAR
// ═══════════════════════════════════════════════════════════════════

function AgentLoopStatusBar({
  status,
  tokenCount,
  messageCount,
  thinkingChars,
  activeToolCount,
}: {
  status: LoopStatus;
  tokenCount: number;
  messageCount: number;
  thinkingChars: number;
  activeToolCount?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
      {status === 'idle' && (
        <>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-muted-foreground font-medium">Ready</span>
          <span className="text-xs text-muted-foreground/60">— Awaiting input</span>
        </>
      )}
      {status === 'thinking' && (
        <>
          <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span className="text-xs text-amber-600 font-medium">Thinking</span>
          {thinkingChars > 0 && (
            <span className="text-xs text-muted-foreground/60">— {thinkingChars.toLocaleString()} chars reasoning</span>
          )}
        </>
      )}
      {status === 'tool_executing' && (
        <>
          <Terminal className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span className="text-xs text-amber-600 font-medium">Executing Tools</span>
          {(activeToolCount ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground/60">— {activeToolCount} active</span>
          )}
        </>
      )}
      {status === 'executing' && (
        <>
          <CircleDot className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
          <span className="text-xs text-cyan-600 font-medium">Streaming</span>
          <span className="text-xs text-muted-foreground/60">— Receiving response</span>
        </>
      )}
      {status === 'coordinating' && (
        <>
          <Network className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-600 font-medium">Coordinating</span>
          <span className="text-xs text-muted-foreground/60">— Creating collaborative plan</span>
        </>
      )}
      {status === 'synthesizing' && (
        <>
          <Wand2 className="w-3.5 h-3.5 text-violet-500 animate-pulse" />
          <span className="text-xs text-violet-600 font-medium">Synthesizing</span>
          <span className="text-xs text-muted-foreground/60">— Combining agent responses</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {thinkingChars > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 text-violet-500 border-violet-200 dark:border-violet-800">
            <Brain className="w-2.5 h-2.5 mr-0.5" />
            {thinkingChars.toLocaleString()}
          </Badge>
        )}
        {(activeToolCount ?? 0) > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-200 dark:border-amber-800">
            <Terminal className="w-2.5 h-2.5 mr-0.5" />
            {activeToolCount} tool{(activeToolCount ?? 0) > 1 ? 's' : ''}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] h-5 font-mono">
          {tokenCount.toLocaleString()} tokens
        </Badge>
        <Badge variant="outline" className="text-[10px] h-5">
          {messageCount} msgs
        </Badge>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PLAYGROUND PAGE
// ═══════════════════════════════════════════════════════════════════

export default function PlaygroundPage() {
  const [selectedAgent, setSelectedAgent] = useState('alpha');
  const [selectedModel, setSelectedModel] = useState('z-ai/glm4.7');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loopStatus, setLoopStatus] = useState<LoopStatus>('idle');
  const [collabPhase, setCollabPhase] = useState<CollaborativePhase | null>(null);
  const [collabAgentInfo, setCollabAgentInfo] = useState<{ agentId: string; index: number; total: number } | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [totalThinkingChars, setTotalThinkingChars] = useState(0);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Skills state
  const [availableSkills, setAvailableSkills] = useState<SkillData[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);

  // Multi-agent state
  const [agentMode, setAgentMode] = useState<AgentMode>('single');
  const [multiAgentIds, setMultiAgentIds] = useState<string[]>(['alpha', 'beta']);

  const currentModel = MODEL_OPTIONS.find((m) => m.id === selectedModel);
  const currentAgent = AGENT_OPTIONS.find((a) => a.id === selectedAgent);
  const activeConversation = conversations.find((c) => c.id === activeConvId);
  const messages = activeConversation?.messages ?? [];
  const isAnyStreaming = messages.some((m) => m.isStreaming);

  // Derive active tool count from streaming messages
  const activeToolCount = messages.reduce((count, m) => {
    if (m.isStreaming && m.toolCalls) {
      return count + m.toolCalls.filter((tc) => tc.status === 'running').length;
    }
    return count;
  }, 0);

  // Fetch available skills on mount
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch('/api/skills');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setAvailableSkills(data.data);
          }
        }
      } catch {
        // Skills fetch failed silently
      }
    };
    fetchSkills();
  }, []);

  // ── Agent ID mapping (frontend short ID → DB ID) ────────────
  const agentIdMap: Record<string, string> = { alpha: 'seed-alpha', beta: 'seed-beta', gamma: 'seed-gamma' };
  const reverseAgentIdMap: Record<string, string> = { 'seed-alpha': 'alpha', 'seed-beta': 'beta', 'seed-gamma': 'gamma' };

  // ── Load conversations from DB on mount ──────────────────────
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoadingConversations(true);
      try {
        const res = await fetch('/api/conversations?limit=100');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const loaded: ConversationItem[] = data.data.map((c: Record<string, unknown>) => ({
              id: c.id as string,
              title: (c.title as string) || 'Untitled',
              agentId: reverseAgentIdMap[(c.agentId as string)] || (c.agentId as string) || 'alpha',
              messages: [], // Messages loaded on demand
              createdAt: (c.createdAt as string) || new Date().toISOString(),
              _hasMessages: false as boolean, // Track if messages have been loaded
            }));
            setConversations(loaded);
            // Auto-select the most recent conversation for the selected agent
            const firstConv = loaded.find((c) => c.agentId === selectedAgent);
            if (firstConv) {
              setActiveConvId(firstConv.id);
            }
          }
        }
      } catch {
        // Failed to load conversations, start fresh
      } finally {
        setIsLoadingConversations(false);
      }
    };
    fetchConversations();
  }, []);

  // ── Load messages for a conversation from DB ─────────────────
  const loadConversationMessages = useCallback(async (convId: string) => {
    if (!convId) return;
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.messages) {
          const dbMessages: ChatMessage[] = data.data.messages.map((m: Record<string, unknown>, idx: number) => {
            const msg: ChatMessage = {
              id: (m.id as string) || `db-msg-${idx}`,
              role: (m.role as ChatMessage['role']) || 'assistant',
              content: (m.content as string) || '',
              timestamp: (m.createdAt as string) || undefined,
            };
            // Parse thinking
            if (m.thinking && typeof m.thinking === 'string' && m.thinking.length > 0) {
              msg.thinking = m.thinking;
            }
            // Parse tool calls
            if (m.toolCalls && typeof m.toolCalls === 'string') {
              try {
                const parsed = JSON.parse(m.toolCalls);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  msg.toolCalls = parsed.map((tc: Record<string, unknown>) => ({
                    id: tc.id as string | undefined,
                    tool: (tc.tool || tc.name || 'unknown') as string,
                    input: (tc.input || {}) as Record<string, unknown>,
                    result: tc.result as string | undefined,
                    status: (tc.status || 'success') as ToolCallInfo['status'],
                    duration: tc.duration as number | undefined,
                    iteration: tc.iteration as number | undefined,
                  }));
                }
              } catch { /* skip */ }
            }
            return msg;
          });
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, messages: dbMessages, _hasMessages: true } as ConversationItem & { _hasMessages?: boolean }
                : c
            )
          );
        }
      }
    } catch {
      // Failed to load messages
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0 || streamingMsgId) {
      scrollToBottom();
    }
  }, [messages.length, messages[messages.length - 1]?.content, messages[messages.length - 1]?.thinking, streamingMsgId, scrollToBottom]);

  // ── Auto-load messages when active conversation changes ─────────
  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith('conv-')) return;
    const conv = conversations.find((c) => c.id === activeConvId);
    if (conv && !(conv as Record<string, unknown>)._hasMessages && conv.messages.length === 0) {
      loadConversationMessages(activeConvId);
    }
  }, [activeConvId, conversations, loadConversationMessages]);

  // Track scroll position using native div ref
  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBtn(!isNearBottom);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeConvId]);

  // Toggle skill
  const toggleSkill = useCallback((skillId: string) => {
    setEnabledSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  }, []);

  // Toggle multi-agent selection
  const toggleMultiAgent = useCallback((agentId: string) => {
    setMultiAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
    );
  }, []);

  const createNewChat = useCallback(async () => {
    const newConv: ConversationItem = {
      id: `conv-${Date.now()}`,
      title: 'New Conversation',
      agentId: selectedAgent,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);

    try {
      const agentIdMap: Record<string, string> = {
        alpha: 'seed-alpha',
        beta: 'seed-beta',
        gamma: 'seed-gamma',
      };
      const dbAgentId = agentIdMap[selectedAgent] || 'seed-alpha';
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: dbAgentId, title: 'New Conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.id) {
          const dbId = data.data.id;
          setConversations((prev) =>
            prev.map((c) => (c.id === newConv.id ? { ...c, id: dbId } : c))
          );
          setActiveConvId(dbId);
          return dbId;
        }
      }
    } catch {
      // If DB creation fails, keep using the local ID
    }
    return newConv.id;
  }, [selectedAgent]);

  const deleteConversation = useCallback(
    (convId: string) => {
      // Skip deleting the default or empty conversations
      if (!convId || convId.startsWith('conv-') && convId !== activeConvId) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        return;
      }
      // Call API to delete from DB (fire and forget)
      if (convId && !convId.startsWith('conv-')) {
        fetch(`/api/conversations/${convId}`, { method: 'DELETE' }).catch(() => { /* ignore */ });
      }
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId && c.agentId === selectedAgent);
        setActiveConvId(remaining.length > 0 ? remaining[0].id : '');
      }
    },
    [activeConvId, conversations, selectedAgent]
  );

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsg(content.slice(0, 20));
      setTimeout(() => setCopiedMsg(null), 2000);
    } catch {
      // Clipboard not available
    }
  }, []);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setLoopStatus('idle');
    setCollabPhase(null);
    setCollabAgentInfo(null);
    if (streamingMsgId) {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === streamingMsgId ? { ...m, isStreaming: false } : m
          ),
        }))
      );
      setStreamingMsgId(null);
    }
  }, [streamingMsgId]);


  // Stream collaborative multi-agent response
  const streamCollaborativeResponse = useCallback(async (
    agentIds: string[],
    message: string,
    convId: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const res = await fetch('/api/agent/chat/collaborative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        agentIds,
        conversationId: convId,
        modelId: selectedModel,
        skillIds: enabledSkills,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    // Track the current active streaming message ID for each phase
    let currentMsgId: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          // ── Phase events ─────────────────────────────────
          if (json.type === 'phase') {
            setCollabPhase(json.phase);
            setLoopStatus(json.phase === 'coordinating' ? 'coordinating' : json.phase === 'synthesizing' ? 'synthesizing' : 'thinking');

            if (json.phase === 'coordinating') {
              // Add coordinator divider
              const divId = `collab-coord-${Date.now()}`;
              const coordMsg: ChatMessage = {
                id: divId,
                role: 'assistant',
                content: '',
                collaborativePhase: 'coordinating',
                isMultiAgentDivider: true,
                isStreaming: true,
              };
              setConversations((prev) =>
                prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, coordMsg] })
              );
              currentMsgId = divId;

              // Now add a content message for the coordinator plan
              const planMsgId = `collab-plan-${Date.now()}`;
              const planMsg: ChatMessage = {
                id: planMsgId,
                role: 'assistant',
                content: '',
                agentId: 'coordinator',
                model: json.model || currentModel?.name,
                timestamp: new Date().toISOString(),
                isStreaming: true,
              };
              setConversations((prev) =>
                prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, planMsg] })
              );
              currentMsgId = planMsgId;
              setStreamingMsgId(planMsgId);
            } else if (json.phase === 'executing') {
              // Finalize coordinator plan message
              if (currentMsgId) {
                setConversations((prev) =>
                  prev.map((c) => ({
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === currentMsgId ? { ...m, isStreaming: false } : m
                    ),
                  }))
                );
              }

              if (json.agentId) {
                setCollabAgentInfo({ agentId: json.agentId, index: json.agentIndex || 0, total: json.totalAgents || agentIds.length });

                // Add executing phase divider
                const execDivId = `collab-exec-${Date.now()}`;
                const execDivMsg: ChatMessage = {
                  id: execDivId,
                  role: 'assistant',
                  content: '',
                  collaborativePhase: 'executing',
                  agentId: json.agentId,
                  isMultiAgentDivider: true,
                };
                setConversations((prev) =>
                  prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, execDivMsg] })
                );

                // Add agent response message
                const agentMsgId = `collab-agent-${json.agentId}-${Date.now()}`;
                const agentMsg: ChatMessage = {
                  id: agentMsgId,
                  role: 'assistant',
                  content: '',
                  thinking: '',
                  agentId: json.agentId,
                  model: json.model || currentModel?.name,
                  timestamp: new Date().toISOString(),
                  isStreaming: true,
                  previousAgentContext: json.agentIndex > 0 ? 'previous' : undefined,
                };
                setConversations((prev) =>
                  prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, agentMsg] })
                );
                currentMsgId = agentMsgId;
                setStreamingMsgId(agentMsgId);
              }
            } else if (json.phase === 'synthesizing') {
              // Finalize current agent message
              if (currentMsgId) {
                setConversations((prev) =>
                  prev.map((c) => ({
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === currentMsgId ? { ...m, isStreaming: false } : m
                    ),
                  }))
                );
              }

              setCollabAgentInfo(null);

              // Add synthesis divider
              const synthDivId = `collab-synth-div-${Date.now()}`;
              const synthDivMsg: ChatMessage = {
                id: synthDivId,
                role: 'assistant',
                content: '',
                collaborativePhase: 'synthesizing',
                isMultiAgentDivider: true,
              };
              setConversations((prev) =>
                prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, synthDivMsg] })
              );

              // Add synthesis content message
              const synthMsgId = `collab-synth-${Date.now()}`;
              const synthMsg: ChatMessage = {
                id: synthMsgId,
                role: 'assistant',
                content: '',
                model: json.model || currentModel?.name,
                timestamp: new Date().toISOString(),
                isStreaming: true,
                isSynthesis: true,
              };
              setConversations((prev) =>
                prev.map((c) => c.id !== convId ? c : { ...c, messages: [...c.messages, synthMsg] })
              );
              currentMsgId = synthMsgId;
              setStreamingMsgId(synthMsgId);
            }
          }

          // ── Coordinator plan tokens ──────────────────────
          else if (json.type === 'coordinator_plan' && json.content) {
            setLoopStatus('coordinating');
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, content: m.content + json.content, isStreaming: true } : m
                  ),
                }))
              );
            }
          }

          // ── Agent thinking ───────────────────────────────
          else if (json.type === 'thinking' && json.content && json.agentId) {
            setLoopStatus('thinking');
            setTotalThinkingChars((prev) => prev + json.content.length);
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, thinking: (m.thinking || '') + json.content, isStreaming: true } : m
                  ),
                }))
              );
            }
          }

          // ── Agent tokens ─────────────────────────────────
          else if (json.type === 'token' && json.content && json.agentId) {
            setLoopStatus('executing');
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, content: m.content + json.content, isStreaming: true } : m
                  ),
                }))
              );
            }
          }

          // ── Tool calls ───────────────────────────────────
          else if (json.type === 'tool_call' && json.agentId) {
            setLoopStatus('tool_executing');
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== currentMsgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    const parsedInput = json.arguments
                      ? (() => { try { return JSON.parse(json.arguments); } catch { return { raw: json.arguments }; } })()
                      : {};
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = { ...existingCalls[existingIdx], input: parsedInput, status: 'running', iteration: json.iteration };
                    } else {
                      existingCalls.push({ id: json.toolCallId, tool: json.name || 'unknown', input: parsedInput, status: 'running', iteration: json.iteration });
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                }))
              );
            }
          }

          // ── Tool executing ───────────────────────────────
          else if (json.type === 'tool_executing' && json.agentId) {
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== currentMsgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = { ...existingCalls[existingIdx], status: 'running' };
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                }))
              );
            }
          }

          // ── Tool result ──────────────────────────────────
          else if (json.type === 'tool_result' && json.agentId) {
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== currentMsgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = { ...existingCalls[existingIdx], result: json.result, status: json.success ? 'success' : 'error', duration: json.duration, iteration: json.iteration };
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                }))
              );
            }
          }

          // ── Agent done ───────────────────────────────────
          else if (json.type === 'agent_done') {
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, isStreaming: false } : m
                  ),
                }))
              );
            }
          }

          // ── Synthesis tokens ─────────────────────────────
          else if (json.type === 'synthesis' && json.content) {
            setLoopStatus('synthesizing');
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, content: m.content + json.content, isStreaming: true } : m
                  ),
                }))
              );
            }
          }

          // ── Done ─────────────────────────────────────────
          else if (json.type === 'done') {
            // Finalize any streaming message
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== currentMsgId) return m;
                    if (json.error) {
                      return { ...m, content: m.content || `Error: ${json.error}`, isStreaming: false };
                    }
                    if (!m.content && !m.thinking) {
                      return { ...m, content: 'No response was received.', isStreaming: false };
                    }
                    return { ...m, isStreaming: false };
                  }),
                }))
              );
            }
            if (json.usage?.total_tokens) {
              setTokenCount((prev) => prev + json.usage.total_tokens);
            } else {
              setTokenCount((prev) => prev + Math.floor(Math.random() * 500 + 200));
            }
          }

        } catch {
          // Not valid JSON — skip
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.type === 'token' && json.content) {
            if (currentMsgId) {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentMsgId ? { ...m, content: m.content + json.content } : m
                  ),
                }))
              );
            }
          }
        } catch { /* ignore */ }
      }
    }

    // Ensure all streaming is done
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          isStreaming: false,
        })),
      }))
    );
  }, [selectedModel, currentModel, enabledSkills]);


  const streamAgentResponse = useCallback(async (
    agentId: string,
    message: string,
    convId: string,
    msgId: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const agentConf = getAgentConfig(agentId);
    const modelConf = currentModel;

    const res = await fetch('/api/agent/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        agentId,
        conversationId: convId,
        modelId: selectedModel,
        skillIds: enabledSkills,
        autonomous: false,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let hasReceivedTokens = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          if (json.type === 'thinking' && json.content) {
            setLoopStatus('thinking');
            setTotalThinkingChars((prev) => prev + json.content.length);
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    return { ...m, thinking: (m.thinking || '') + json.content, isStreaming: true };
                  }),
                };
              })
            );
          } else if (json.type === 'token' && json.content) {
            if (!hasReceivedTokens) {
              hasReceivedTokens = true;
              setLoopStatus('executing');
            }
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    return { ...m, content: m.content + json.content, isStreaming: true, isPlanning: false };
                  }),
                };
              })
            );
          } else if (json.type === 'planning') {
            // Agent is in planning mode
            setLoopStatus('planning');
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    return { ...m, isPlanning: true };
                  }),
                };
              })
            );
          } else if (json.type === 'task_plan') {
            // Structured task plan received
            setLoopStatus('planning');
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    return {
                      ...m,
                      isPlanning: false,
                      taskPlan: {
                        title: json.title || 'Task Plan',
                        steps: json.steps || [],
                        complexity: json.complexity || 'moderate',
                        completedSteps: json.completedSteps || [],
                      },
                    };
                  }),
                };
              })
            );
          } else if (json.type === 'tool_call') {
            setLoopStatus('tool_executing');
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    const parsedInput = json.arguments
                      ? (() => { try { return JSON.parse(json.arguments); } catch { return { raw: json.arguments }; } })()
                      : {};
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = {
                        ...existingCalls[existingIdx],
                        input: parsedInput,
                        status: 'running',
                        iteration: json.iteration,
                      };
                    } else {
                      existingCalls.push({
                        id: json.toolCallId,
                        tool: json.name || 'unknown',
                        input: parsedInput,
                        status: 'running',
                        iteration: json.iteration,
                      });
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                };
              })
            );
          } else if (json.type === 'tool_executing') {
            // Tool is now executing on backend
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = {
                        ...existingCalls[existingIdx],
                        status: 'running',
                      };
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                };
              })
            );
          } else if (json.type === 'tool_result') {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    const existingCalls = [...(m.toolCalls || [])];
                    const existingIdx = existingCalls.findIndex((tc) => tc.id === json.toolCallId);
                    if (existingIdx >= 0) {
                      existingCalls[existingIdx] = {
                        ...existingCalls[existingIdx],
                        result: json.result,
                        status: json.success ? 'success' : 'error',
                        duration: json.duration,
                        iteration: json.iteration,
                      };
                    }
                    return { ...m, toolCalls: existingCalls };
                  }),
                };
              })
            );
          } else if (json.type === 'loop_iteration') {
            // New loop iteration started
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id !== msgId) return m;
                    return { ...m, content: m.content + `\n\n---\n**Loop ${json.iteration}/${json.maxIterations}** — Processing tool results...\n` };
                  }),
                };
              })
            );
          } else if (json.type === 'done') {
            if (json.error) {
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== msgId) return m;
                      return { ...m, content: m.content || `Error: ${json.error}`, isStreaming: false };
                    }),
                  };
                })
              );
            } else {
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== msgId) return m;
                      return { ...m, isStreaming: false };
                    }),
                  };
                })
              );
              if (json.usage?.total_tokens) {
                setTokenCount((prev) => prev + json.usage.total_tokens);
              } else {
                setTokenCount((prev) => prev + Math.floor(Math.random() * 200 + 100));
              }
              if (json.thinkingLength) {
                setTotalThinkingChars(json.thinkingLength);
              }
            }
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.type === 'token' && json.content) {
            setConversations((prev) =>
              prev.map((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, content: m.content + json.content } : m
                ),
              }))
            );
          }
        } catch {
          // Ignore
        }
      }
    }

    // Ensure streaming is done
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== msgId) return m;
          if (!m.content && !m.thinking) {
            return { ...m, content: 'No response was received.', isStreaming: false };
          }
          return { ...m, isStreaming: false };
        }),
      }))
    );
  }, [selectedModel, currentModel]);

  const handleSend = async () => {
    if (!inputValue.trim() || loopStatus !== 'idle') return;

    const isMultiAgent = agentMode === 'multi' && multiAgentIds.length >= 2;
    const agentsToUse = isMultiAgent ? multiAgentIds : [selectedAgent];
    const trimmedInput = inputValue.trim();

    let convId = activeConvId;
    if (!convId) {
      convId = await createNewChat();
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString(),
    };

    // Generate title from first message and sync to DB
    const isFirstMessage = (conversations.find((c) => c.id === convId)?.messages.length ?? 0) <= 1;
    const newTitle = isFirstMessage
      ? trimmedInput.slice(0, 40) + (trimmedInput.length > 40 ? '...' : '')
      : conversations.find((c) => c.id === convId)?.title || 'Untitled';

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: [...c.messages, userMessage],
          title: newTitle,
        };
      })
    );

    // Sync title to DB if this is a DB-backed conversation
    if (isFirstMessage && convId && !convId.startsWith('conv-')) {
      fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      }).catch(() => { /* ignore */ });
    }

    setInputValue('');
    setTotalThinkingChars(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (isMultiAgent) {
        setLoopStatus('coordinating');
        setCollabPhase('coordinating');

        try {
          await streamCollaborativeResponse(agentsToUse, trimmedInput, convId, abortController.signal);
        } catch (err) {
          if (abortController.signal.aborted) return;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          setConversations((prev) =>
            prev.map((c) => ({
              ...c,
              messages: [...c.messages, {
                id: `collab-error-${Date.now()}`,
                role: 'assistant' as const,
                content: `Collaborative mode error: ${errorMsg}`,
                isStreaming: false,
              }],
            }))
          );
        }
      } else {
        // Single agent mode
        setLoopStatus('thinking');

        const assistantMsgId = `msg-${Date.now()}-resp`;
        const assistantMessage: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          thinking: '',
          agentId: selectedAgent,
          model: currentModel?.name,
          timestamp: new Date().toISOString(),
          isStreaming: true,
        };

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return { ...c, messages: [...c.messages, assistantMessage] };
          })
        );

        setStreamingMsgId(assistantMsgId);

        await streamAgentResponse(selectedAgent, trimmedInput, convId, assistantMsgId, abortController.signal);
        setStreamingMsgId(null);
      }
    } catch (err) {
      if (abortController.signal.aborted) return;
      // Outer error handling
    } finally {
      setLoopStatus('idle');
      setCollabPhase(null);
      setCollabAgentInfo(null);
      setStreamingMsgId(null);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt);
    textareaRef.current?.focus();
  };

  const isMultiSendable = agentMode !== 'multi' || multiAgentIds.length >= 2;
  const isDisabled = loopStatus !== 'idle' || !inputValue.trim() || !isMultiSendable;

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-57px)]">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* ── Left Panel: Conversations ──────────────────── */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <ConversationListPanel
              selectedAgent={selectedAgent}
              onAgentChange={(id) => {
                setSelectedAgent(id);
                const firstConv = conversations.find((c) => c.agentId === id);
                if (firstConv) {
                  setActiveConvId(firstConv.id);
                  // Load messages if not yet loaded
                  if (!(firstConv as Record<string, unknown>)._hasMessages) {
                    loadConversationMessages(firstConv.id);
                  }
                } else {
                  setActiveConvId('');
                }
              }}
              activeConvId={activeConvId}
              onConvSelect={(convId) => {
                setActiveConvId(convId);
                // Load messages from DB if not yet loaded
                const conv = conversations.find((c) => c.id === convId);
                if (conv && !(conv as Record<string, unknown>)._hasMessages) {
                  loadConversationMessages(convId);
                }
              }}
              conversations={conversations}
              onNewChat={createNewChat}
              onDeleteConv={deleteConversation}
              isLoading={isLoadingConversations}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Right Panel: Chat Area ─────────────────────── */}
          <ResizablePanel defaultSize={75} minSize={50}>
            <div className="flex flex-col h-full">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full ${currentAgent?.color} text-white text-sm shadow-sm`}
                    >
                      <span>{currentAgent?.icon}</span>
                    </div>
                    <div className={`absolute -inset-1 rounded-full ${currentAgent?.color} opacity-20 blur-sm`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">
                      {agentMode === 'multi' && multiAgentIds.length >= 2
                        ? `Multi-Agent (${multiAgentIds.length})`
                        : currentAgent?.label
                      }
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        {isAnyStreaming || loopStatus === 'coordinating' || loopStatus === 'synthesizing' ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                          </>
                        ) : (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {loopStatus === 'coordinating' ? 'Coordinating...'
                          : loopStatus === 'synthesizing' ? 'Synthesizing...'
                          : loopStatus === 'thinking' ? 'Thinking...'
                          : loopStatus === 'tool_executing' ? 'Executing Tools...'
                          : isAnyStreaming ? 'Streaming...'
                          : 'Online'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Skills Panel */}
                  <SkillsPanel
                    availableSkills={availableSkills}
                    enabledSkills={enabledSkills}
                    onToggleSkill={toggleSkill}
                  />

                  {/* Multi-Agent Mode Toggle */}
                  <MultiAgentSelector
                    mode={agentMode}
                    onModeChange={setAgentMode}
                    selectedAgents={multiAgentIds}
                    onToggleAgent={toggleMultiAgent}
                  />

                  {/* Model Selector */}
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-[150px] h-7 text-[11px] border-muted-foreground/30">
                      <Cpu className="w-3 h-3 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  model.provider === 'nvidia'
                                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {model.provider === 'nvidia' ? 'NVIDIA' : 'Default'}
                              </Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Enabled Skills Badges */}
              <AnimatePresence>
                {enabledSkills.length > 0 && (
                  <EnabledSkillsBadges
                    availableSkills={availableSkills}
                    enabledSkills={enabledSkills}
                    onRemoveSkill={toggleSkill}
                  />
                )}
              </AnimatePresence>

              {/* Multi-Agent Chips */}
              <AnimatePresence>
                {agentMode === 'multi' && (
                  <MultiAgentChips
                    selectedAgents={multiAgentIds}
                    onToggleAgent={toggleMultiAgent}
                    disabled={loopStatus !== 'idle'}
                  />
                )}
              </AnimatePresence>

              {/* Chat Messages — using native overflow-y-auto instead of ScrollArea */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto relative scroll-smooth">
                <div className="flex flex-col gap-4 p-5 max-w-3xl mx-auto w-full min-h-full">
                  {isLoadingMessages ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                      <span className="text-xs text-muted-foreground">Loading messages...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <WelcomeState agent={getAgentConfig(selectedAgent)} onQuickPrompt={handleQuickPrompt} />
                  ) : (
                    messages.map((msg) => (
                      <ChatBubble
                        key={msg.id}
                        message={msg}
                        onCopy={handleCopy}
                      />
                    ))
                  )}

                  {/* Coordinating state */}
                  {loopStatus === 'coordinating' && (
                    <CoordinatingState agents={multiAgentIds} phase={collabPhase} agentInfo={collabAgentInfo} />
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Scroll to bottom button */}
                <AnimatePresence>
                  {showScrollBtn && <ScrollToBottom onClick={scrollToBottom} />}
                </AnimatePresence>
              </div>

              {/* Input Area */}
              <div className="border-t bg-card/50 backdrop-blur-sm px-5 py-3">
                <div className="max-w-3xl mx-auto">
                  {/* Copied feedback */}
                  <AnimatePresence>
                    {copiedMsg && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="flex items-center gap-1.5 mb-2"
                      >
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-xs text-emerald-600">Copied to clipboard</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Warning for multi-agent without enough agents */}
                  {agentMode === 'multi' && multiAgentIds.length < 2 && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        Select at least 2 agents to use multi-agent mode, or switch back to Single Agent.
                      </span>
                    </motion.div>
                  )}

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        agentMode === 'multi' && multiAgentIds.length >= 2
                          ? `Message ${multiAgentIds.map((a) => getAgentConfig(a).name).join(', ')}...`
                          : `Message ${currentAgent?.name || 'Agent'}... (Shift+Enter for newline)`
                      }
                      className="min-h-[52px] max-h-[200px] resize-none pr-24 text-sm rounded-xl border-border/60 bg-background focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/40"
                      disabled={loopStatus !== 'idle'}
                    />
                    <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
                      {loopStatus !== 'idle' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={handleStop}
                            >
                              <StopCircle className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Stop generating</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            className={`w-7 h-7 rounded-lg transition-all ${
                              isDisabled
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm hover:shadow-md'
                            }`}
                            onClick={handleSend}
                            disabled={isDisabled}
                          >
                            {loopStatus === 'coordinating' ? (
                              <Network className="w-3.5 h-3.5 animate-pulse" />
                            ) : loopStatus === 'synthesizing' ? (
                              <Wand2 className="w-3.5 h-3.5 animate-pulse" />
                            ) : loopStatus === 'tool_executing' ? (
                              <Terminal className="w-3.5 h-3.5 animate-pulse" />
                            ) : loopStatus !== 'idle' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {isDisabled
                            ? agentMode === 'multi' && multiAgentIds.length < 2
                              ? 'Select 2+ agents'
                              : loopStatus === 'thinking'
                                ? 'Thinking...'
                                : loopStatus === 'tool_executing'
                                  ? 'Executing tools...'
                                  : loopStatus === 'coordinating'
                                    ? 'Coordinating agents...'
                                    : loopStatus === 'synthesizing'
                                      ? 'Synthesizing responses...'
                                      : loopStatus !== 'idle'
                                        ? 'Generating...'
                                        : 'Type a message'
                            : agentMode === 'multi'
                              ? 'Send to all agents collaboratively'
                              : 'Send message'
                          }
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground px-2">
                            <Paperclip className="w-3 h-3 mr-1" />
                            Attach
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Attach files (coming soon)</TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Powered by OpenHarness Agent System
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Bar */}
              <AgentLoopStatusBar
                status={loopStatus}
                tokenCount={tokenCount}
                messageCount={messages.length}
                thinkingChars={totalThinkingChars}
                activeToolCount={activeToolCount}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
