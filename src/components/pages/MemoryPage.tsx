'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  FileText,
  MessageSquare,
  Database,
  Clock,
  Cpu,
  ArrowRight,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';

// ── Types ──────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  agent: string;
  agentColor: string;
  key: string;
  value: string;
  category: string;
  updated: string;
}

interface Conversation {
  id: string;
  title: string;
  agent: string;
  agentColor: string;
  messages: number;
  lastActivity: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const MEMORY_ENTRIES: MemoryEntry[] = [
  { id: '1', agent: 'Alpha', agentColor: 'bg-emerald-500', key: 'user_preference', value: 'Prefers TypeScript over JavaScript for all new projects', category: 'preference', updated: '2h ago' },
  { id: '2', agent: 'Alpha', agentColor: 'bg-emerald-500', key: 'project_context', value: 'Next.js 16 project with Tailwind CSS 4, Prisma ORM, SQLite database', category: 'context', updated: '5h ago' },
  { id: '3', agent: 'Alpha', agentColor: 'bg-emerald-500', key: 'coding_style', value: 'Uses functional components, prefers composition over inheritance', category: 'preference', updated: '1d ago' },
  { id: '4', agent: 'Beta', agentColor: 'bg-violet-500', key: 'search_history', value: 'Last 10 search queries stored for context continuity', category: 'history', updated: '1h ago' },
  { id: '5', agent: 'Beta', agentColor: 'bg-violet-500', key: 'research_topics', value: 'React Server Components, Edge Runtime, WASM integration patterns', category: 'context', updated: '3h ago' },
  { id: '6', agent: 'Gamma', agentColor: 'bg-teal-500', key: 'deployment_config', value: 'Production env: AWS ECS, staging: Vercel, CI/CD: GitHub Actions', category: 'config', updated: '3h ago' },
  { id: '7', agent: 'Gamma', agentColor: 'bg-teal-500', key: 'env_variables', value: 'DATABASE_URL, NEXTAUTH_SECRET, S3_BUCKET, REDIS_URL configured', category: 'config', updated: '6h ago' },
  { id: '8', agent: 'Delta', agentColor: 'bg-amber-500', key: 'test_coverage', value: 'Current coverage: 87%, target: 95%, focus on integration tests', category: 'history', updated: '30m ago' },
];

const CONVERSATIONS: Conversation[] = [
  { id: 'c1', title: 'API Endpoint Design Discussion', agent: 'Alpha', agentColor: 'bg-emerald-500', messages: 24, lastActivity: '15 min ago' },
  { id: 'c2', title: 'Database Schema Optimization', agent: 'Alpha', agentColor: 'bg-emerald-500', messages: 18, lastActivity: '2h ago' },
  { id: 'c3', title: 'React Framework Comparison', agent: 'Beta', agentColor: 'bg-violet-500', messages: 32, lastActivity: '4h ago' },
  { id: 'c4', title: 'CI/CD Pipeline Configuration', agent: 'Gamma', agentColor: 'bg-teal-500', messages: 15, lastActivity: '1d ago' },
  { id: 'c5', title: 'Performance Testing Results', agent: 'Delta', agentColor: 'bg-amber-500', messages: 21, lastActivity: '1d ago' },
  { id: 'c6', title: 'Authentication Flow Review', agent: 'Alpha', agentColor: 'bg-emerald-500', messages: 12, lastActivity: '2d ago' },
];

const CLAUDE_MD_CONTENT = `# Project: OpenHarness Agent System

## Tech Stack
- Next.js 16, TypeScript, Tailwind CSS 4
- Prisma ORM with SQLite
- Zustand for state management
- shadcn/ui component library
- Framer Motion for animations

## Conventions
- Use shadcn/ui components over custom implementations
- API routes for all backend operations
- Responsive design mandatory
- Emerald accent color, no blue/indigo
- 'use client' for interactive components

## Architecture
- App Router with single page navigation
- Zustand store for global state
- Prisma for database operations
- Socket.io for real-time features

## Current Tasks
- Building dashboard and monitoring pages
- Implementing tool registry UI
- Setting up memory persistence layer`;

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  context: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  history: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  config: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
};

// ── Memory Entry Row ───────────────────────────────────────────

function MemoryEntryRow({ entry, index }: { entry: MemoryEntry; index: number }) {
  return (
    <motion.div
      className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      {/* Agent badge */}
      <div className="flex items-center gap-2 shrink-0 w-24">
        <div className={`w-7 h-7 rounded-full ${entry.agentColor} flex items-center justify-center text-white text-[10px] font-bold`}>
          {entry.agent.charAt(0)}
        </div>
        <span className="text-sm font-medium">{entry.agent}</span>
      </div>

      {/* Key */}
      <div className="shrink-0 w-40">
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
          {entry.key}
        </code>
      </div>

      {/* Value (truncated) */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-muted-foreground truncate block">
          {entry.value}
        </span>
      </div>

      {/* Category */}
      <Badge variant="outline" className={`shrink-0 ${CATEGORY_COLORS[entry.category] || ''}`}>
        {entry.category}
      </Badge>

      {/* Updated */}
      <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
        {entry.updated}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="w-7 h-7">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

// ── Conversation Row ───────────────────────────────────────────

function ConversationRow({ conv, index }: { conv: Conversation; index: number }) {
  return (
    <motion.div
      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block">{conv.title}</span>
        <div className="flex items-center gap-2 mt-0.5">
          <div className={`w-4 h-4 rounded-full ${conv.agentColor} flex items-center justify-center text-white text-[8px] font-bold`}>
            {conv.agent.charAt(0)}
          </div>
          <span className="text-xs text-muted-foreground">{conv.agent}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{conv.messages} messages</span>
        </div>
      </div>

      <span className="text-xs text-muted-foreground shrink-0">{conv.lastActivity}</span>

      <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
        <ArrowRight className="w-3.5 h-3.5" />
        Resume
      </Button>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
            <Brain className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Memory System</h1>
            <p className="text-sm text-muted-foreground">
              156 Memory Entries · 3 Agents
            </p>
          </div>
        </div>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4" />
          Add Memory
        </Button>
      </motion.div>

      {/* Stats cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="py-4">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="w-4 h-4" />
              <span className="text-xs font-medium">Total Entries</span>
            </div>
            <span className="text-2xl font-bold">156</span>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-medium">Context Utilization</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-bold">67%</span>
              <Progress value={67} className="h-1.5" />
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span className="text-xs font-medium">Avg Tokens/Session</span>
            </div>
            <span className="text-2xl font-bold">2,450</span>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Sessions Resumed</span>
            </div>
            <span className="text-2xl font-bold">23</span>
          </CardContent>
        </Card>
      </motion.div>

      {/* Memory Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Tabs defaultValue="persistent" className="space-y-4">
          <TabsList>
            <TabsTrigger value="persistent" className="gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Persistent Memory
            </TabsTrigger>
            <TabsTrigger value="session" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Session Context
            </TabsTrigger>
            <TabsTrigger value="conversation" className="gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Conversation History
            </TabsTrigger>
          </TabsList>

          {/* Persistent Memory Tab */}
          <TabsContent value="persistent">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Persistent Memory</CardTitle>
                    <CardDescription>
                      Long-term knowledge stored across sessions (MEMORY.md)
                    </CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search memories..."
                      className="pl-8 h-9 text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="flex items-center gap-4 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    <span className="w-24 shrink-0">Agent</span>
                    <span className="w-40 shrink-0">Key</span>
                    <span className="flex-1">Value</span>
                    <span className="shrink-0">Category</span>
                    <span className="w-16 text-right shrink-0">Updated</span>
                    <span className="w-16 shrink-0" />
                  </div>
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2 pr-2">
                      {MEMORY_ENTRIES
                        .filter((e) =>
                          !searchQuery ||
                          e.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          e.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          e.agent.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((entry, i) => (
                          <MemoryEntryRow key={entry.id} entry={entry} index={i} />
                        ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Session Context Tab */}
          <TabsContent value="session">
            <Card>
              <CardHeader className="pb-3">
                <div>
                  <CardTitle className="text-base">Session Context (CLAUDE.md)</CardTitle>
                  <CardDescription>
                    Project context and conventions for the current session
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border bg-muted/30">
                  <ScrollArea className="max-h-[500px]">
                    <pre className="p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {CLAUDE_MD_CONTENT}
                    </pre>
                  </ScrollArea>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Last updated 30 minutes ago
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit Context
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conversation History Tab */}
          <TabsContent value="conversation">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Conversation History</CardTitle>
                    <CardDescription>
                      Recent conversations across all agents
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    {CONVERSATIONS.length} conversations
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2 pr-2">
                    {CONVERSATIONS.map((conv, i) => (
                      <ConversationRow key={conv.id} conv={conv} index={i} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
