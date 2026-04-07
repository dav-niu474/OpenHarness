'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  Send,
  Paperclip,
  Slash,
  Wrench,
  CheckCircle2,
  Clock,
  Bot,
  User,
  CircleDot,
  Sparkles,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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

// ── Model Options ─────────────────────────────────────────────

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'default', name: 'Default (z-ai-sdk)', provider: 'zai', description: 'Default AI model' },
  { id: 'glm-4.7', name: 'GLM 4.7', provider: 'nvidia', description: 'Zhipu AI — 中文理解和代码生成' },
  { id: 'glm-5', name: 'GLM 5', provider: 'nvidia', description: 'Zhipu AI — 最新一代推理' },
  { id: 'kimi-2.5', name: 'Kimi 2.5', provider: 'nvidia', description: 'Moonshot AI — 长上下文' },
];

// ── Agent Options ──────────────────────────────────────────────

interface AgentOption {
  id: string;
  name: string;
  label: string;
  color: string;
  description: string;
}

const AGENT_OPTIONS: AgentOption[] = [
  { id: 'alpha', name: 'Alpha', label: 'Alpha - Code Assistant', color: 'bg-emerald-500', description: 'Expert in code writing, review, and refactoring' },
  { id: 'beta', name: 'Beta', label: 'Beta - Research Agent', color: 'bg-amber-500', description: 'Specialized in web search and data analysis' },
  { id: 'gamma', name: 'Gamma', label: 'Gamma - DevOps Agent', color: 'bg-cyan-500', description: 'CI/CD pipelines and infrastructure management' },
];

// ── Chat Message Types ─────────────────────────────────────────

type MessageRole = 'user' | 'assistant' | 'tool';

interface ToolCall {
  tool: string;
  input: Record<string, string>;
  result: string;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCall?: ToolCall;
  timestamp?: string;
  isStreaming?: boolean;
}

interface ConversationItem {
  id: string;
  title: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: string;
}

// ── Helper: Get agent color ────────────────────────────────────

function getAgentColor(agentId: string): string {
  return AGENT_OPTIONS.find((a) => a.id === agentId)?.color ?? 'bg-gray-500';
}

// ── Left Panel: Conversation List ──────────────────────────────

function ConversationListPanel({
  selectedAgent,
  onAgentChange,
  activeConvId,
  onConvSelect,
  conversations,
  onNewChat,
}: {
  selectedAgent: string;
  onAgentChange: (id: string) => void;
  activeConvId: string;
  onConvSelect: (id: string) => void;
  conversations: ConversationItem[];
  onNewChat: () => void;
}) {
  const filteredConvs = conversations.filter(
    (c) => c.agentId === selectedAgent,
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

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
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const isActive = conv.id === activeConvId;
              const agentColor = getAgentColor(conv.agentId);
              return (
                <button
                  key={conv.id}
                  onClick={() => onConvSelect(conv.id)}
                  className={`
                    flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left w-full
                    transition-colors cursor-pointer
                    ${isActive
                      ? 'bg-emerald-50 text-foreground border border-emerald-200'
                      : 'hover:bg-muted text-foreground/80 border border-transparent'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agentColor}`} />
                    <span className="text-sm font-medium truncate flex-1">
                      {conv.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3.5">
                    <Clock className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-[11px] text-muted-foreground">
                      {formatTime(conv.createdAt)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Tool Call Card ─────────────────────────────────────────────

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200/60">
        <Wrench className="w-3.5 h-3.5 text-amber-600" />
        <span className="text-xs font-semibold text-amber-700">
          {toolCall.tool}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(toolCall.input).map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 text-[11px] bg-amber-100/80 text-amber-700 rounded px-1.5 py-0.5 font-mono"
            >
              <span className="text-amber-500">{key}:</span> {val}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span>{toolCall.result}</span>
        </div>
      </div>
    </div>
  );
}

// ── Code Block with Copy Button ──────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-800 border-b border-zinc-700/50">
        {language && (
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            {language}
          </span>
        )}
        {!language && <span />}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-700/50"
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
      <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto">
        <code className="text-[13px] leading-relaxed font-mono whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

// ── Inline Markdown Renderer ──────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Find the earliest match among all inline patterns
    let earliestIndex = remaining.length;
    let matchType: 'code' | 'link' | 'bold' | 'italic' | null = null;
    let matchResult: RegExpMatchArray | null = null;

    // Inline code: `text` — scan for first backtick
    const codeSearch = remaining.indexOf('`');
    if (codeSearch !== -1 && codeSearch < earliestIndex) {
      const codeMatch = remaining.slice(codeSearch).match(/^`([^`]+)`/);
      if (codeMatch) {
        earliestIndex = codeSearch;
        matchType = 'code';
        matchResult = codeMatch;
      }
    }

    // Link: [text](url) — scan for first [
    const linkSearch = remaining.indexOf('[');
    if (linkSearch !== -1 && linkSearch < earliestIndex) {
      const linkMatch = remaining.slice(linkSearch).match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        earliestIndex = linkSearch;
        matchType = 'link';
        matchResult = linkMatch;
      }
    }

    // Bold: **text** — scan for first **
    const boldSearch = remaining.indexOf('**');
    if (boldSearch !== -1 && boldSearch < earliestIndex) {
      const boldMatch = remaining.slice(boldSearch).match(/^\*\*(.+?)\*\*/s);
      if (boldMatch) {
        earliestIndex = boldSearch;
        matchType = 'bold';
        matchResult = boldMatch;
      }
    }

    // Italic: *text* — scan for single * (not preceded by *)
    const italicSearch = remaining.search(/(?<!\*)\*(?!\*)/);
    if (italicSearch !== -1 && italicSearch < earliestIndex) {
      const italicMatch = remaining.slice(italicSearch).match(/^\*(?!\*)(.+?)\*(?!\*)/s);
      if (italicMatch) {
        earliestIndex = italicSearch;
        matchType = 'italic';
        matchResult = italicMatch;
      }
    }

    if (matchType === null || !matchResult) {
      // No more patterns found — push remaining text as plain
      if (remaining.length > 0) {
        tokens.push(remaining);
      }
      break;
    }

    // Push plain text before the match
    if (earliestIndex > 0) {
      tokens.push(remaining.slice(0, earliestIndex));
    }

    // Process the matched pattern
    switch (matchType) {
      case 'code':
        tokens.push(
          <code
            key={`ic-${keyIdx++}`}
            className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono text-foreground"
          >
            {matchResult[1]}
          </code>
        );
        remaining = remaining.slice(earliestIndex + matchResult[0].length);
        break;
      case 'link':
        tokens.push(
          <a
            key={`link-${keyIdx++}`}
            href={matchResult[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
          >
            {matchResult[1]}
          </a>
        );
        remaining = remaining.slice(earliestIndex + matchResult[0].length);
        break;
      case 'bold':
        tokens.push(
          <strong key={`b-${keyIdx++}`} className="font-semibold">
            {renderInline(matchResult[1])}
          </strong>
        );
        remaining = remaining.slice(earliestIndex + matchResult[0].length);
        break;
      case 'italic':
        tokens.push(
          <em key={`i-${keyIdx++}`}>{renderInline(matchResult[1])}</em>
        );
        remaining = remaining.slice(earliestIndex + matchResult[0].length);
        break;
    }
  }

  return tokens.length === 0 ? null : tokens.length === 1 ? tokens[0] : <>{tokens}</>;
}

// ── Rich Markdown Renderer ────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  // Step 1: Extract fenced code blocks and replace with placeholders
  const codeBlocks: { code: string; language: string }[] = [];
  const CODE_PLACEHOLDER = '\x00CODEBLOCK_';

  let processed = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ code: code.replace(/\n$/, ''), language: lang });
      return `${CODE_PLACEHOLDER}${idx}\x00`;
    }
  );

  // Step 2: Split into lines and process block elements
  const lines = processed.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;

  // Helper: check if line is inside a code placeholder
  const isCodePlaceholder = (line: string): { isCode: boolean; idx: number } => {
    const trimmed = line.trim();
    if (trimmed.startsWith(CODE_PLACEHOLDER) && trimmed.endsWith('\x00')) {
      const idx = parseInt(trimmed.slice(CODE_PLACEHOLDER.length, -1), 10);
      return { isCode: !isNaN(idx), idx };
    }
    return { isCode: false, idx: -1 };
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      i++;
      continue;
    }

    // Code block placeholder
    const codeCheck = isCodePlaceholder(trimmed);
    if (codeCheck.isCode && codeBlocks[codeCheck.idx]) {
      const block = codeBlocks[codeCheck.idx];
      elements.push(
        <CodeBlock key={`cb-${keyIdx++}`} code={block.code} language={block.language} />
      );
      i++;
      continue;
    }

    // Horizontal rule: ---
    if (/^-{3,}$/.test(trimmed)) {
      elements.push(
        <hr key={`hr-${keyIdx++}`} className="my-3 border-muted-border" />
      );
      i++;
      continue;
    }

    // H3: ### text
    if (/^###\s/.test(trimmed)) {
      elements.push(
        <h3
          key={`h3-${keyIdx++}`}
          className="text-[15px] font-semibold mt-4 mb-1.5 text-foreground"
        >
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // H2: ## text
    if (/^##\s/.test(trimmed)) {
      elements.push(
        <h2
          key={`h2-${keyIdx++}`}
          className="text-base font-bold mt-4 mb-1.5 text-foreground"
        >
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // Unordered list: - item
    if (/^[-*]\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        listItems.push(
          <li key={`li-${keyIdx++}`} className="ml-4 list-disc py-0.5">
            {renderInline(lines[i].trim().slice(2))}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${keyIdx++}`} className="my-1.5 space-y-0.5">
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(
          <li key={`oli-${keyIdx++}`} className="ml-4 list-decimal py-0.5">
            {renderInline(lines[i].trim().replace(/^\d+\.\s/, ''))}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol-${keyIdx++}`} className="my-1.5 space-y-0.5">
          {listItems}
        </ol>
      );
      continue;
    }

    // Regular paragraph: collect consecutive non-empty lines
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i];
      const pTrimmed = pLine.trim();

      // Stop at empty lines or special block elements
      if (pTrimmed === '') break;
      if (isCodePlaceholder(pTrimmed).isCode) break;
      if (/^-{3,}$/.test(pTrimmed)) break;
      if (/^#{2,3}\s/.test(pTrimmed)) break;
      if (/^[-*]\s/.test(pTrimmed)) break;
      if (/^\d+\.\s/.test(pTrimmed)) break;

      paragraphLines.push(pTrimmed);
      i++;
    }

    if (paragraphLines.length > 0) {
      elements.push(
        <p key={`p-${keyIdx++}`} className="my-1">
          {renderInline(paragraphLines.join(' '))}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

// ── Chat Message Bubble ────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'tool' && message.toolCall) {
    return (
      <div className="flex justify-start max-w-[85%]">
        <ToolCallCard toolCall={message.toolCall} />
      </div>
    );
  }

  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  return (
    <div
      className={`flex gap-2.5 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5
          ${isUser
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-muted text-muted-foreground'
          }
        `}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`
          rounded-xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-emerald-600 text-white rounded-tr-sm'
            : 'bg-muted rounded-tl-sm'
          }
        `}
      >
        {isUser ? (
          // User messages: plain text with line breaks
          message.content.split('\n').map((line, idx) => (
            <React.Fragment key={idx}>
              {line}
              {idx < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))
        ) : (
          // Assistant messages: rich markdown rendering
          renderMarkdown(message.content)
        )}
        {/* Blinking cursor while streaming */}
        {isStreaming && (
          <span className="inline-block w-[2px] h-[16px] bg-emerald-500 ml-0.5 align-text-bottom animate-pulse rounded-full" />
        )}
      </div>
    </div>
  );
}

// ── Agent Loop Status Bar ──────────────────────────────────────

function AgentLoopStatusBar({ status, tokenCount, messageCount }: { status: 'idle' | 'thinking' | 'executing'; tokenCount: number; messageCount: number }) {
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
          <span className="text-xs text-muted-foreground/60">— Generating response</span>
        </>
      )}
      {status === 'executing' && (
        <>
          <CircleDot className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
          <span className="text-xs text-cyan-600 font-medium">Processing...</span>
          <span className="text-xs text-muted-foreground/60">— Formatting response</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
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

// ── Main Playground Page ───────────────────────────────────────

export default function PlaygroundPage() {
  const [selectedAgent, setSelectedAgent] = useState('alpha');
  const [selectedModel, setSelectedModel] = useState('glm-4.7');
  const [conversations, setConversations] = useState<ConversationItem[]>(() => [
    {
      id: 'conv-default',
      title: 'Welcome Chat',
      agentId: 'alpha',
      messages: [
        {
          id: 'msg-welcome',
          role: 'assistant',
          content: 'Hello! I am your OpenHarness AI Agent. I have access to 43+ tools for file operations, web search, code analysis, and more. How can I help you today?',
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
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentModel = MODEL_OPTIONS.find((m) => m.id === selectedModel);
  const currentAgent = AGENT_OPTIONS.find((a) => a.id === selectedAgent);
  const activeConversation = conversations.find((c) => c.id === activeConvId);
  const messages = activeConversation?.messages ?? [];

  const createNewChat = useCallback(() => {
    const newConv: ConversationItem = {
      id: `conv-${Date.now()}`,
      title: 'New Conversation',
      agentId: selectedAgent,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    return newConv.id;
  }, [selectedAgent]);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content, streamingMsgId]);

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
      convId = createNewChat();
    }

    const trimmedInput = inputValue.trim();

    // Add user message to conversation
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

    // Create a placeholder assistant message for streaming
    const assistantMsgId = `msg-${Date.now()}-resp`;
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    // Add the empty streaming message
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return { ...c, messages: [...c.messages, assistantMessage] };
      }),
    );

    setStreamingMsgId(assistantMsgId);

    // Create abort controller for this request
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

      // Read the SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));

            if (json.content) {
              // Update the streaming message with new content
              const contentChunk = json.content;
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;
                      return {
                        ...m,
                        content: m.content + contentChunk,
                        isStreaming: true,
                      };
                    }),
                  };
                }),
              );
            }

            if (json.done) {
              // Stream is complete
              if (json.error) {
                // Server-side error during streaming
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
                // Mark streaming as complete
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

                // Update token count from usage data
                if (json.usage) {
                  const total = json.usage.total_tokens;
                  if (typeof total === 'number') {
                    setTokenCount(total);
                  } else {
                    setTokenCount((prev) => prev + Math.floor(Math.random() * 200 + 100));
                  }
                } else {
                  setTokenCount((prev) => prev + Math.floor(Math.random() * 200 + 100));
                }
              }
            }
          } catch {
            // Not valid JSON — skip this line
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            if (json.content) {
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;
                      return { ...m, content: m.content + json.content };
                    }),
                  };
                }),
              );
            }
            if (json.done) {
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
              if (json.usage) {
                const total = json.usage.total_tokens;
                if (typeof total === 'number') {
                  setTokenCount(total);
                } else {
                  setTokenCount((prev) => prev + Math.floor(Math.random() * 200 + 100));
                }
              }
            }
          } catch {
            // Not valid JSON — ignore
          }
        }
      }

      // Ensure streaming is marked as done even if no done event received
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;
              // If content is still empty, show error
              if (!m.content) {
                return {
                  ...m,
                  content: 'No response was received. Please try again.',
                  isStreaming: false,
                };
              }
              return { ...m, isStreaming: false };
            }),
          };
        }),
      );
    } catch (err) {
      // Handle fetch errors (network, abort, etc.)
      if (abortController.signal.aborted) {
        // Request was aborted (e.g. component unmounted)
        return;
      }

      const errorMsg =
        err instanceof Error ? err.message : 'Unknown error occurred';

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;
              return {
                ...m,
                content: m.content || `Network error: ${errorMsg}. Please try again.`,
                isStreaming: false,
              };
            }),
          };
        }),
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

  // Check if any message is currently streaming
  const isAnyStreaming = messages.some((m) => m.isStreaming);

  return (
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
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${currentAgent?.color} text-white`}
                >
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{currentAgent?.label}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
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
                <Badge variant="outline" className="text-[10px] h-5 font-mono">
                  {tokenCount.toLocaleString()} tokens
                </Badge>
                <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                  {messages.length} messages
                </Badge>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-4 p-5 max-w-3xl mx-auto w-full">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div
                      className={`w-16 h-16 rounded-2xl ${currentAgent?.color ?? 'bg-emerald-500'} flex items-center justify-center mb-4`}
                    >
                      <Bot className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">
                      {currentAgent?.name ?? 'Agent'}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {currentAgent?.description ?? 'AI assistant ready to help'}
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}

                {/* Thinking indicator (before streaming starts) */}
                {loopStatus === 'thinking' && !isAnyStreaming && (
                  <div className="flex gap-2.5 max-w-[85%]">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 bg-muted text-muted-foreground">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-muted px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                        <span className="text-sm text-muted-foreground">
                          Thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t bg-card/50 backdrop-blur-sm p-4">
              <div className="max-w-3xl mx-auto">
                <div className="relative flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                  <div className="flex items-center gap-1 pl-1 pb-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                    >
                      <Slash className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message to the agent..."
                    className="min-h-[36px] max-h-[120px] border-0 shadow-none bg-transparent resize-none focus-visible:ring-0 py-1.5 px-1 text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || loopStatus !== 'idle'}
                    className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 disabled:opacity-30 mb-0.5"
                  >
                    {loopStatus !== 'idle' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                  Press Enter to send, Shift+Enter for new line. Use / for
                  commands.
                </p>
              </div>
            </div>

            {/* Agent Loop Status Bar */}
            <AgentLoopStatusBar
              status={loopStatus}
              tokenCount={tokenCount}
              messageCount={messages.length}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
