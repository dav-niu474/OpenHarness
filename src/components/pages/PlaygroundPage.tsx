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
        {message.content.split('\n').map((line, i) => {
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          return (
            <React.Fragment key={i}>
              {parts.map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={j}>{part.slice(2, -2)}</strong>
                  );
                }
                return <span key={j}>{part}</span>;
              })}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          );
        })}
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.id]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

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

    // Add user message
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const updatedMessages = [...c.messages, userMessage];
        return {
          ...c,
          messages: updatedMessages,
          title: c.messages.length <= 1 ? trimmedInput.slice(0, 40) + (trimmedInput.length > 40 ? '...' : '') : c.title,
        };
      })
    );

    setInputValue('');
    setLoopStatus('thinking');

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          agentId: selectedAgent,
          conversationId: convId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setLoopStatus('executing');
        setTimeout(() => {
          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}-resp`,
            role: 'assistant',
            content: data.reply,
            timestamp: new Date().toISOString(),
          };

          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return { ...c, messages: [...c.messages, assistantMessage] };
            })
          );

          setTokenCount(data.usage?.total_tokens ?? tokenCount + Math.floor(Math.random() * 200 + 100));
          setLoopStatus('idle');
        }, 500);
      } else {
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          content: `Sorry, an error occurred: ${data.error || 'Unknown error'}. Please try again.`,
          timestamp: new Date().toISOString(),
        };
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return { ...c, messages: [...c.messages, errorMessage] };
          })
        );
        setLoopStatus('idle');
      }
    } catch {
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
        timestamp: new Date().toISOString(),
      };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, errorMessage] };
        })
      );
      setLoopStatus('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
                    <span className="text-[11px] text-muted-foreground">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                    <div className={`w-16 h-16 rounded-2xl ${currentAgent?.color ?? 'bg-emerald-500'} flex items-center justify-center mb-4`}>
                      <Bot className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">{currentAgent?.name ?? 'Agent'}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {currentAgent?.description ?? 'AI assistant ready to help'}
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                {loopStatus === 'thinking' && (
                  <div className="flex gap-2.5 max-w-[85%]">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 bg-muted text-muted-foreground">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-muted px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                {loopStatus === 'executing' && (
                  <div className="flex gap-2.5 max-w-[85%]">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 bg-muted text-muted-foreground">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="rounded-xl rounded-tl-sm bg-muted px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CircleDot className="w-4 h-4 animate-pulse text-cyan-500" />
                        <span className="text-sm text-muted-foreground">Processing response...</span>
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
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                  Press Enter to send, Shift+Enter for new line. Use / for commands.
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
