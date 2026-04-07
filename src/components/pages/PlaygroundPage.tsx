'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Send,
  Paperclip,
  Wrench,
  CheckCircle2,
  Clock,
  Bot,
  User,
  CircleDot,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Cpu,
  Brain,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Zap,
  BookOpen,
  RotateCcw,
  Terminal,
  ArrowDown,
  MessageSquare,
  X,
  StopCircle,
  Eye,
  EyeOff,
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
}

type MessageRole = 'user' | 'assistant' | 'tool' | 'skill';

interface ToolCallInfo {
  id?: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  status?: 'running' | 'success' | 'error';
  duration?: number;
}

interface SkillCallInfo {
  name: string;
  description: string;
  status?: 'loading' | 'loaded' | 'error';
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
}

interface ConversationItem {
  id: string;
  title: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: string;
}

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
  },
];

const QUICK_PROMPTS = [
  { label: 'Explain this code', prompt: 'Explain the following code and suggest improvements:\n\n```python\ndef quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)\n```' },
  { label: 'Write a React hook', prompt: 'Write a custom React hook called useDebounce that debounces a value with a configurable delay.' },
  { label: 'Compare technologies', prompt: 'Compare React, Vue, and Svelte. Use a markdown table to show their key differences in terms of performance, learning curve, and ecosystem.' },
  { label: 'Debug an issue', prompt: 'I have a React component that re-renders infinitely. Here is the code:\n\n```tsx\nuseEffect(() => {\n  const data = fetchData();\n  setData(data);\n}, [data]);\n```\n\nWhat\'s wrong and how do I fix it?' },
];

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
// THINKING BLOCK COMPONENT
// ═══════════════════════════════════════════════════════════════════

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!thinking) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-violet-200/60 bg-violet-50/40 overflow-hidden mb-2">
        <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 hover:bg-violet-50/80 transition-colors">
          <Brain className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 flex-1 text-left">
            {isStreaming ? 'Thinking...' : `Thought Process (${thinking.length} chars)`}
          </span>
          {isStreaming && (
            <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
          )}
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-violet-500 border-violet-200">
            {isOpen ? 'Hide' : 'Show'}
          </Badge>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-violet-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-violet-400" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1">
            <div className="text-[13px] text-violet-800/80 leading-relaxed whitespace-pre-wrap italic border-t border-violet-200/40 pt-2">
              {thinking}
              {isStreaming && (
                <span className="inline-block w-[6px] h-[14px] bg-violet-400/60 ml-0.5 align-text-bottom animate-pulse rounded-full" />
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOOL CALL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [isOpen, setIsOpen] = useState(false);
  const statusConfig = {
    running: { icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Running', animate: true },
    success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50/50', border: 'border-emerald-200/60', label: 'Done', animate: false },
    error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', label: 'Error', animate: false },
  };
  const status = toolCall.status || 'success';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.success;
  const StatusIcon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden my-1.5`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/[0.02] transition-colors text-left"
      >
        <StatusIcon className={`w-3.5 h-3.5 ${config.color} shrink-0 ${config.animate ? 'animate-spin' : ''}`} />
        <Terminal className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="text-xs font-semibold text-amber-800 flex-1">
          {toolCall.tool}
        </span>
        {toolCall.duration && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
            {toolCall.duration}ms
          </Badge>
        )}
        <span className="text-[10px] font-medium text-amber-600 bg-amber-100/80 px-1.5 py-0.5 rounded">
          {config.label}
        </span>
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-amber-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-amber-400" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-amber-200/40 pt-2">
              {/* Input */}
              {Object.keys(toolCall.input).length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Input</span>
                  <div className="mt-1 bg-white/60 rounded-md p-2 border border-amber-100">
                    <pre className="text-[12px] text-amber-900 font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(toolCall.input, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {/* Result */}
              {toolCall.result && (
                <div>
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Result</span>
                  <div className="mt-1 bg-white/60 rounded-md p-2 border border-emerald-100 max-h-48 overflow-y-auto">
                    <pre className="text-[12px] text-emerald-900 font-mono whitespace-pre-wrap break-all">
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
// SKILL CALL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════

function SkillCallCard({ skillCall }: { skillCall: SkillCallInfo }) {
  const statusConfig = {
    loading: { icon: Loader2, color: 'text-blue-500', label: 'Loading', animate: true },
    loaded: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Loaded', animate: false },
    error: { icon: AlertTriangle, color: 'text-red-500', label: 'Error', animate: false },
  };
  const status = skillCall.status || 'loaded';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.loaded;
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200/60 bg-blue-50/40 px-3 py-2 my-1.5">
      <StatusIcon className={`w-3.5 h-3.5 ${config.color} shrink-0 ${config.animate ? 'animate-spin' : ''}`} />
      <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-blue-800">{skillCall.name}</span>
        {skillCall.description && (
          <p className="text-[11px] text-blue-600/70 truncate">{skillCall.description}</p>
        )}
      </div>
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-blue-500 border-blue-200 shrink-0">
        Skill
      </Badge>
    </div>
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
// CODE BLOCK COMPONENT (with syntax highlighting)
// ═══════════════════════════════════════════════════════════════════

function CodeBlockWrapper({
  language,
  children,
}: {
  language: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  if (!language) {
    return (
      <div className="my-2 rounded-lg overflow-hidden border border-border">
        <div className="flex items-center justify-between px-4 py-1.5 bg-muted/80 border-b border-border">
          <span className="text-[11px] font-medium text-muted-foreground">code</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-muted"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto">
          <code className="text-[13px] leading-relaxed font-mono">{children}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border/50">
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-800 border-b border-zinc-700/50">
        <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5 rounded hover:bg-zinc-700/50"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '13px',
          lineHeight: '1.6',
          background: '#18181b',
        }}
        showLineNumbers={codeString.split('\n').length > 3}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RICH MARKDOWN RENDERER
// ═══════════════════════════════════════════════════════════════════

function RichMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-3 prose-headings:text-foreground prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-blockquote:my-2 prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:rounded-r-md prose-blockquote:not-italic prose-table:text-xs prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-border prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline prose-code:text-[13px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-img:rounded-md prose-img:border prose-hr:border-border">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono text-foreground" {...props}>
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
              <div className="my-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full">{children}</table>
              </div>
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
            flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 text-xs
            ${isUser
              ? 'bg-emerald-100 text-emerald-600'
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
        {/* Agent info header for assistant */}
        {!isUser && message.agentId && showAvatar && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-semibold text-foreground">{agent.name}</span>
            {message.timestamp && (
              <span className="text-[10px] text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`
            rounded-xl px-4 py-2.5 text-sm leading-relaxed relative
            ${isUser
              ? 'bg-emerald-600 text-white rounded-tr-sm'
              : 'bg-muted rounded-tl-sm text-foreground'
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
              {/* Thinking Block */}
              {message.thinking && (
                <ThinkingBlock thinking={message.thinking} isStreaming={message.isStreaming} />
              )}
              {/* Tool Calls */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mb-2">
                  {message.toolCalls.map((tc, idx) => (
                    <ToolCallCard key={`tc-${idx}`} toolCall={tc} />
                  ))}
                </div>
              )}
              {/* Skill Calls */}
              {message.skillCalls && message.skillCalls.length > 0 && (
                <div className="mb-2">
                  {message.skillCalls.map((sc) => (
                    <SkillCallCard key={sc.name} skillCall={sc} />
                  ))}
                </div>
              )}
              {/* Main content */}
              {message.content ? (
                <RichMarkdown content={message.content} />
              ) : !message.isStreaming ? null : (
                <div className="flex items-center gap-2 py-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Generating...</span>
                </div>
              )}
              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <span className="inline-block w-[2px] h-[16px] bg-emerald-500 ml-0.5 align-text-bottom animate-pulse rounded-full" />
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
        <div
          className={`w-16 h-16 rounded-2xl ${agent.color} flex items-center justify-center mb-5 shadow-lg`}
        >
          <span className="text-2xl">{agent.icon}</span>
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
          43+ Tools
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <BookOpen className="w-2.5 h-2.5 mr-1 text-blue-500" />
          Skills System
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <Brain className="w-2.5 h-2.5 mr-1 text-violet-500" />
          Deep Thinking
        </Badge>
        <Badge variant="outline" className="text-[10px] h-6">
          <Sparkles className="w-2.5 h-2.5 mr-1 text-emerald-500" />
          Multi-Model
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
}: {
  selectedAgent: string;
  onAgentChange: (id: string) => void;
  activeConvId: string;
  onConvSelect: (id: string) => void;
  conversations: ConversationItem[];
  onNewChat: () => void;
  onDeleteConv: (id: string) => void;
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

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col p-2 gap-1">
          {filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              <span>No conversations yet</span>
              <span className="text-[10px]">Start a new chat above</span>
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const isActive = conv.id === activeConvId;
              const agent = getAgentConfig(conv.agentId);
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
}: {
  status: 'idle' | 'thinking' | 'executing';
  tokenCount: number;
  messageCount: number;
  thinkingChars: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
      {status === 'idle' && (
        <>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-muted-foreground font-medium">Idle</span>
          <span className="text-xs text-muted-foreground/60">— Ready for input</span>
        </>
      )}
      {status === 'thinking' && (
        <>
          <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span className="text-xs text-amber-600 font-medium">Thinking...</span>
          {thinkingChars > 0 && (
            <span className="text-xs text-muted-foreground/60">— {thinkingChars} chars reasoning</span>
          )}
        </>
      )}
      {status === 'executing' && (
        <>
          <CircleDot className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
          <span className="text-xs text-cyan-600 font-medium">Streaming...</span>
          <span className="text-xs text-muted-foreground/60">— Receiving response</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {thinkingChars > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 text-violet-500 border-violet-200">
            <Brain className="w-2.5 h-2.5 mr-0.5" />
            {thinkingChars}
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
  const [conversations, setConversations] = useState<ConversationItem[]>(() => [
    {
      id: 'conv-default',
      title: 'Welcome Chat',
      agentId: 'alpha',
      messages: [
        {
          id: 'msg-welcome',
          role: 'assistant',
          content: 'Hello! I am your **OpenHarness AI Agent**. I have access to 43+ tools for file operations, web search, code analysis, and more.\n\nI support:\n- 🧠 **Deep Thinking** — Reasoning process visualization\n- 🔧 **Tool Calls** — Structured input/output display\n- 📚 **Skills** — Knowledge module loading\n- 🤖 **Multi-Agent** — Switch between specialized agents\n\nTry asking me to explain code, write functions, or analyze data!',
          agentId: 'alpha',
          model: 'GLM 4.7',
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ]);
  const [activeConvId, setActiveConvId] = useState('conv-default');
  const [inputValue, setInputValue] = useState('');
  const [loopStatus, setLoopStatus] = useState<'idle' | 'thinking' | 'executing'>('idle');
  const [tokenCount, setTokenCount] = useState(0);
  const [totalThinkingChars, setTotalThinkingChars] = useState(0);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentModel = MODEL_OPTIONS.find((m) => m.id === selectedModel);
  const currentAgent = AGENT_OPTIONS.find((a) => a.id === selectedAgent);
  const activeConversation = conversations.find((c) => c.id === activeConvId);
  const messages = activeConversation?.messages ?? [];
  const isAnyStreaming = messages.some((m) => m.isStreaming);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0 || streamingMsgId) {
      scrollToBottom();
    }
  }, [messages.length, messages[messages.length - 1]?.content, streamingMsgId, scrollToBottom]);

  // Track scroll position for "scroll to bottom" button
  useEffect(() => {
    const container = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBtn(!isNearBottom);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeConvId]);

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
    // Mark current streaming message as done
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

  const handleSend = async () => {
    if (!inputValue.trim() || loopStatus !== 'idle') return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    let convId = activeConvId;
    if (!convId) {
      convId = await createNewChat();
    }

    const trimmedInput = inputValue.trim();

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const updatedMessages = [...c.messages, userMessage];
        return {
          ...c,
          messages: updatedMessages,
          title:
            c.messages.length <= 1
              ? trimmedInput.slice(0, 40) + (trimmedInput.length > 40 ? '...' : '')
              : c.title,
        };
      }),
    );

    setInputValue('');
    setLoopStatus('thinking');
    setTotalThinkingChars(0);

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
      }),
    );

    setStreamingMsgId(assistantMsgId);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          agentId: selectedAgent,
          conversationId: convId,
          modelId: selectedModel,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      setLoopStatus('executing');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

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
              setTotalThinkingChars((prev) => prev + json.content.length);
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;
                      return {
                        ...m,
                        thinking: (m.thinking || '') + json.content,
                        isStreaming: true,
                      };
                    }),
                  };
                }),
              );
            } else if (json.type === 'token' && json.content) {
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;
                      return {
                        ...m,
                        content: m.content + json.content,
                        isStreaming: true,
                      };
                    }),
                  };
                }),
              );
            } else if (json.type === 'tool_call') {
              // Accumulate tool call info
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;
                      const existingCalls = [...(m.toolCalls || [])];
                      // Find or create tool call entry
                      const existingIdx = existingCalls.findIndex(
                        (tc) => tc.id === json.toolCallId
                      );
                      if (existingIdx >= 0) {
                        existingCalls[existingIdx] = {
                          ...existingCalls[existingIdx],
                          input: json.arguments
                            ? (() => { try { return JSON.parse(json.arguments); } catch { return { raw: json.arguments }; } })()
                            : existingCalls[existingIdx].input,
                          status: json.done ? 'success' : 'running',
                        };
                      } else {
                        existingCalls.push({
                          id: json.toolCallId,
                          tool: json.name || 'unknown',
                          input: json.arguments
                            ? (() => { try { return JSON.parse(json.arguments); } catch { return { raw: json.arguments }; } })()
                            : {},
                          status: json.done ? 'success' : 'running',
                        });
                      }
                      return { ...m, toolCalls: existingCalls };
                    }),
                  };
                }),
              );
            } else if (json.type === 'done') {
              if (json.error) {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMsgId) return m;
                        return {
                          ...m,
                          content:
                            m.content ||
                            `Sorry, an error occurred: ${json.error}. Please try again.`,
                          isStreaming: false,
                        };
                      }),
                    };
                  }),
                );
              } else {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMsgId) return m;
                        return { ...m, isStreaming: false };
                      }),
                    };
                  }),
                );

                if (json.usage?.total_tokens) {
                  setTokenCount(json.usage.total_tokens);
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
                    m.id === assistantMsgId ? { ...m, content: m.content + json.content } : m
                  ),
                }))
              );
            }
            if (json.type === 'done') {
              setConversations((prev) =>
                prev.map((c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, isStreaming: false } : m
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
            if (m.id !== assistantMsgId) return m;
            if (!m.content && !m.thinking) {
              return {
                ...m,
                content: 'No response was received. Please try again.',
                isStreaming: false,
              };
            }
            return { ...m, isStreaming: false };
          }),
        }))
      );
    } catch (err) {
      if (abortController.signal.aborted) return;

      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== assistantMsgId) return m;
            return {
              ...m,
              content: m.content || `Network error: ${errorMsg}. Please try again.`,
              isStreaming: false,
            };
          }),
        }))
      );
    } finally {
      setLoopStatus('idle');
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
                setActiveConvId(firstConv?.id ?? '');
              }}
              activeConvId={activeConvId}
              onConvSelect={setActiveConvId}
              conversations={conversations}
              onNewChat={createNewChat}
              onDeleteConv={deleteConversation}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Right Panel: Chat Area ─────────────────────── */}
          <ResizablePanel defaultSize={75} minSize={50}>
            <div className="flex flex-col h-full">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${currentAgent?.color} text-white text-sm`}
                  >
                    <span>{currentAgent?.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{currentAgent?.label}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        {isAnyStreaming ? (
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
                        {isAnyStreaming ? 'Streaming...' : 'Online'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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

              {/* Chat Messages */}
              <ScrollArea className="flex-1 relative" ref={scrollContainerRef as React.Ref<never>}>
                <div className="flex flex-col gap-4 p-5 max-w-3xl mx-auto w-full min-h-full">
                  {messages.length === 0 ? (
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
                  <div ref={messagesEndRef} />
                </div>

                {/* Scroll to bottom button */}
                <AnimatePresence>
                  {showScrollBtn && <ScrollToBottom onClick={scrollToBottom} />}
                </AnimatePresence>
              </ScrollArea>

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

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${currentAgent?.name || 'Agent'}... (Shift+Enter for newline)`}
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
                            className={`w-7 h-7 rounded-lg ${
                              loopStatus !== 'idle' || !inputValue.trim()
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            }`}
                            onClick={handleSend}
                            disabled={loopStatus !== 'idle' || !inputValue.trim()}
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {loopStatus !== 'idle' ? 'Generating...' : 'Send message'}
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
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
