'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users,
  Wrench,
  Play,
  Brain,
  Cpu,
  Shield,
  ArrowRight,
  MessageSquare,
  UserPlus,
  Settings,
  ListTodo,
  TrendingUp,
  Clock,
  Zap,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Bot,
  AlertTriangle,
  Trash2,
  Pencil,
  Plus,
  Thermometer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAgentStore } from '@/stores/agent-store';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────

interface StatsData {
  activeAgents: number;
  totalAgents: number;
  availableTools: number;
  enabledTools: number;
  runningTasks: number;
  totalTasks: number;
  totalMemories: number;
  totalConversations: number;
  totalMessages: number;
  loadedSkills: number;
  totalSkills: number;
  totalTeams: number;
  activeTeams: number;
  taskSuccessRate: number;
  avgProgress: number;
  taskDistribution: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  agentDistribution: Record<string, number>;
  recentActivity: ActivityEntry[];
}

interface ActivityEntry {
  id: string;
  type: string;
  agentName: string;
  conversationTitle: string;
  content: string;
  timestamp: string;
}

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  provider: string;
  model: string;
  systemPrompt: string;
  config: string;
  _count: {
    conversations: number;
    tasks: number;
    memories: number;
  };
}

interface AgentFormData {
  name: string;
  description: string;
  type: string;
  systemPrompt: string;
  provider: string;
  model: string;
  status: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_FORM: AgentFormData = {
  name: '',
  description: '',
  type: 'react',
  systemPrompt: '',
  provider: 'openai',
  model: 'gpt-4',
  status: 'active',
  temperature: 0.7,
  maxTokens: 4096,
};

// ── Helpers ────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return then.toLocaleDateString();
}

function formatSecondsAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function getActivityMeta(type: string) {
  switch (type) {
    case 'message_sent':
      return { label: 'sent a message', icon: Users, dotColor: 'bg-emerald-500' };
    case 'agent_response':
      return { label: 'responded', icon: Bot, dotColor: 'bg-cyan-500' };
    case 'tool_call':
      return { label: 'executed a tool', icon: Wrench, dotColor: 'bg-amber-500' };
    default:
      return { label: 'system event', icon: Cpu, dotColor: 'bg-violet-500' };
  }
}

function getAgentTypeColor(type: string) {
  switch (type) {
    case 'react': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'planning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'coding': return 'bg-teal-500/10 text-teal-600 border-teal-500/20';
    default: return 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20';
  }
}

function getAgentStatus(status: string) {
  switch (status) {
    case 'active': return { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
    case 'inactive': return { label: 'Inactive', className: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' };
    case 'archived': return { label: 'Archived', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
    default: return { label: status, className: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' };
  }
}

function getAgentIcon(type: string) {
  switch (type) {
    case 'react': return Zap;
    case 'planning': return Shield;
    case 'coding': return Cpu;
    default: return Bot;
  }
}

function parseConfig(configStr: string): { temperature?: number; maxTokens?: number } {
  try {
    return JSON.parse(configStr);
  } catch {
    return {};
  }
}

// ── Architecture Subsystems ────────────────────────────────────

const SUBSYSTEMS = [
  {
    name: 'Engine Agent Loop',
    description: 'Core reasoning and decision-making engine with streaming capabilities',
    icon: Cpu,
    badge: 'Active',
  },
  {
    name: 'Tools',
    description: 'Integrated tools for code execution, web search, file operations',
    icon: Wrench,
    badge: 'Active',
  },
  {
    name: 'Memory Context',
    description: 'Persistent context system with short-term and long-term memory',
    icon: Brain,
    badge: 'Active',
  },
  {
    name: 'Governance Safety',
    description: 'Permission rules, sandboxing, and safety guardrails for all actions',
    icon: Shield,
    badge: 'Active',
  },
  {
    name: 'Swarm Multi Agent',
    description: 'Multi-agent coordination with team spawning and delegation',
    icon: Users,
    badge: 'Active',
  },
];

const LOOP_STEPS = [
  { label: 'User Prompt', icon: MessageSquare },
  { label: 'Stream Response', icon: Zap },
  { label: 'Tool Detection', icon: Wrench },
  { label: 'Permission Check', icon: Shield },
  { label: 'Execute Tool', icon: Play },
  { label: 'Loop Back', icon: RefreshCw },
];

// ── Stat Card Component ────────────────────────────────────────

interface StatItem {
  label: string;
  value: number;
  icon: React.ElementType;
  accentBg: string;
  accentText: string;
  trend: string;
}

function StatCard({ stat, loading }: { stat: StatItem; loading: boolean }) {
  const Icon = stat.icon;
  return (
    <Card className="gap-0 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </span>
            {loading ? (
              <Skeleton className="h-9 w-16 rounded-md" />
            ) : (
              <span className="text-3xl font-bold tracking-tight">{stat.value}</span>
            )}
          </div>
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-xl ${stat.accentBg}`}
          >
            <Icon className={`w-5 h-5 ${stat.accentText}`} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">{stat.trend}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Task Distribution Bar ──────────────────────────────────────

function TaskDistributionBar({
  distribution,
  loading,
}: {
  distribution: StatsData['taskDistribution'] | null;
  loading: boolean;
}) {
  if (loading || !distribution) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-6 w-full rounded-md" />
      </div>
    );
  }

  const total = distribution.pending + distribution.in_progress + distribution.completed + distribution.failed;
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No tasks recorded yet</p>
    );
  }

  const segments = [
    { key: 'pending' as const, label: 'Pending', count: distribution.pending, color: 'bg-amber-500' },
    { key: 'in_progress' as const, label: 'In Progress', count: distribution.in_progress, color: 'bg-emerald-500' },
    { key: 'completed' as const, label: 'Completed', count: distribution.completed, color: 'bg-green-500' },
    { key: 'failed' as const, label: 'Failed', count: distribution.failed, color: 'bg-red-500' },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-3">
      <div className="flex rounded-full h-3 overflow-hidden bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} transition-all duration-500`}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
            <span className="text-xs text-muted-foreground">
              {seg.label}
            </span>
            <span className="text-xs font-semibold">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent Form Dialog ──────────────────────────────────────────

function AgentFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialData: AgentFormData | null;
  onSubmit: (data: AgentFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<AgentFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setForm(initialData);
      } else {
        setForm(DEFAULT_FORM);
      }
    }
  }, [open, mode, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error('Name and System Prompt are required');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch {
      // error handled by caller
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create New Agent' : 'Edit Agent'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Configure a new agent with its capabilities and behavior settings.'
              : 'Update the agent configuration and behavior settings.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Row: Name + Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="agent-name"
                placeholder="e.g., Alpha - Code Assistant"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-desc">Description</Label>
              <Input
                id="agent-desc"
                placeholder="Brief description of the agent"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Row: Type + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((prev) => ({ ...prev, type: val }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="react">React</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="coding">Coding</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(val) => setForm((prev) => ({ ...prev, status: val }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Provider + Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.provider}
                onValueChange={(val) => setForm((prev) => ({ ...prev, provider: val }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-model">Model</Label>
              <Input
                id="agent-model"
                placeholder="gpt-4"
                value={form.model}
                onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              />
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="agent-prompt">
              System Prompt <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="agent-prompt"
              placeholder="You are a helpful assistant..."
              value={form.systemPrompt}
              onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              rows={4}
              className="min-h-[100px]"
            />
          </div>

          {/* Temperature Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-muted-foreground" />
                Temperature
              </Label>
              <span className="text-sm font-mono font-medium text-emerald-600">
                {form.temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[form.temperature]}
              onValueChange={(val) => setForm((prev) => ({ ...prev, temperature: val[0] }))}
              min={0}
              max={1}
              step={0.1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise (0)</span>
              <span>Creative (1)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="agent-tokens">Max Tokens</Label>
            <Input
              id="agent-tokens"
              type="number"
              min={256}
              max={128000}
              step={256}
              value={form.maxTokens}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  maxTokens: parseInt(e.target.value) || 4096,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens the agent can generate per response.
            </p>
          </div>

          {/* Submit */}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[120px]">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : mode === 'create' ? (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Agent
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Agent AlertDialog ───────────────────────────────────

function DeleteAgentDialog({
  open,
  onOpenChange,
  agentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // error handled by caller
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Agent</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <span className="font-semibold text-foreground">{agentName}</span>?
            This will permanently remove the agent and all associated data including conversations,
            tasks, and memories. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="min-w-[100px]"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Loading Skeleton Layout ────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-4 w-80 mt-2 rounded-md" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="gap-0 overflow-hidden">
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24 rounded-md mb-3" />
              <Skeleton className="h-9 w-16 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Architecture */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-4 w-72 mt-1 rounded-md" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="min-w-[200px] max-w-[220px] p-4 rounded-xl border bg-muted/30 shrink-0 space-y-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-44 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent Loop */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-64 mt-1 rounded-md" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 min-w-[110px] shrink-0">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-36 rounded-md" />
            <Skeleton className="h-4 w-64 mt-1 rounded-md" />
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                  <Skeleton className="h-3 w-1/3 rounded-md" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 rounded-md" />
          </CardHeader>
          <CardContent className="pt-0">
            <Skeleton className="h-6 w-full rounded-md" />
            <div className="flex gap-4 mt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="h-3 w-16 rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent List */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-4 w-64 mt-1 rounded-md" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 rounded-xl border bg-muted/30 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-3 w-16 rounded-md" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full rounded-md" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Error State ────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          System overview with agent health monitoring, real-time metrics, and activity feeds.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold">Failed to load dashboard data</h3>
            <p className="text-sm text-muted-foreground max-w-md">{message}</p>
          </div>
          <Button variant="outline" onClick={onRetry} className="mt-2">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Dashboard Page ────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setActivePage } = useAgentStore();

  // Auto-refresh state
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const lastUpdatedRef = useRef<number>(0);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<AgentFormData | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentData | null>(null);

  // ── Fetch functions ─────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Stats request failed');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load stats');
      setStats(json.data);
      const now = Date.now();
      setLastUpdated(now);
      lastUpdatedRef.current = now;
    } catch (err) {
      console.error('Stats fetch error:', err);
      // Don't overwrite error if main fetch already set it
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Agents request failed');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load agents');
      setAgents(json.data);
    } catch (err) {
      console.error('Agents fetch error:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsRes, agentsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/agents'),
      ]);

      if (!statsRes.ok || !agentsRes.ok) {
        throw new Error('One or more API requests failed');
      }

      const statsJson = await statsRes.json();
      const agentsJson = await agentsRes.json();

      if (!statsJson.success) throw new Error(statsJson.error || 'Failed to load stats');
      if (!agentsJson.success) throw new Error(agentsJson.error || 'Failed to load agents');

      setStats(statsJson.data);
      setAgents(agentsJson.data);
      const now = Date.now();
      setLastUpdated(now);
      lastUpdatedRef.current = now;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Update "last updated" text every second
  const [refreshLabel, setRefreshLabel] = useState('');
  useEffect(() => {
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastUpdatedRef.current) / 1000);
      if (elapsed < 2) {
        setRefreshLabel('just now');
      } else {
        setRefreshLabel(formatSecondsAgo(elapsed));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Agent CRUD Handlers ────────────────────────────────────
  const handleCreateAgent = async (data: AgentFormData) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description || null,
        type: data.type,
        systemPrompt: data.systemPrompt,
        provider: data.provider,
        model: data.model,
        status: data.status,
        config: {
          temperature: data.temperature,
          maxTokens: data.maxTokens,
        },
      }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || 'Failed to create agent');
      throw new Error(json.error);
    }
    toast.success(`Agent "${data.name}" created successfully`);
    await fetchAgents();
    await fetchStats();
  };

  const handleEditAgent = async (data: AgentFormData) => {
    if (!editFormData) return;
    if (!editingAgentId) {
      toast.error('No agent selected for editing');
      throw new Error('No agent selected');
    }
    const res = await fetch(`/api/agents/${editingAgentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description || null,
        type: data.type,
        systemPrompt: data.systemPrompt,
        provider: data.provider,
        model: data.model,
        status: data.status,
        config: {
          temperature: data.temperature,
          maxTokens: data.maxTokens,
        },
      }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || 'Failed to update agent');
      throw new Error(json.error);
    }
    toast.success(`Agent "${data.name}" updated successfully`);
    await fetchAgents();
    await fetchStats();
  };

  const handleDeleteAgent = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/agents/${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || 'Failed to delete agent');
      throw new Error(json.error);
    }
    toast.success(`Agent "${deleteTarget.name}" deleted`);
    await fetchAgents();
    await fetchStats();
  };

  const openEditDialog = (agent: AgentData) => {
    const cfg = parseConfig(agent.config || '{}');
    const formData: AgentFormData = {
      name: agent.name,
      description: agent.description || '',
      type: agent.type,
      systemPrompt: agent.systemPrompt || '',
      provider: agent.provider,
      model: agent.model,
      status: agent.status,
      temperature: cfg.temperature ?? 0.7,
      maxTokens: cfg.maxTokens ?? 4096,
    };
    setEditFormData(formData);
    setEditingAgentId(agent.id);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (agent: AgentData) => {
    setDeleteTarget(agent);
    setDeleteDialogOpen(true);
  };

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!stats) return null;

  // ── Build stat items from live data ────────────────────────
  const statItems: StatItem[] = [
    {
      label: 'Active Agents',
      value: stats.activeAgents,
      icon: Users,
      accentBg: 'bg-emerald-500/10',
      accentText: 'text-emerald-600',
      trend: `${stats.totalAgents} total agents`,
    },
    {
      label: 'Available Tools',
      value: stats.availableTools,
      icon: Wrench,
      accentBg: 'bg-amber-500/10',
      accentText: 'text-amber-600',
      trend: `${stats.enabledTools} enabled`,
    },
    {
      label: 'Running Tasks',
      value: stats.runningTasks,
      icon: Play,
      accentBg: 'bg-cyan-500/10',
      accentText: 'text-cyan-600',
      trend: `${stats.totalTasks} total tasks`,
    },
    {
      label: 'Memory Entries',
      value: stats.totalMemories,
      icon: Brain,
      accentBg: 'bg-violet-500/10',
      accentText: 'text-violet-600',
      trend: `${stats.totalConversations} conversations`,
    },
  ];

  // ── Quick Actions ──────────────────────────────────────────
  const QUICK_ACTIONS = [
    { label: 'New Conversation', icon: MessageSquare, page: 'playground' as const },
    { label: 'Create Agent', icon: UserPlus, action: 'create-agent' as const },
    { label: 'Manage Tools', icon: Settings, page: 'tools' as const },
    { label: 'View Tasks', icon: ListTodo, page: 'tasks' as const },
    { label: 'Permissions', icon: Shield, page: 'permissions' as const },
  ];

  const handleQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
    if (action.page) {
      setActivePage(action.page);
    }
    if (action.action === 'create-agent') {
      setCreateDialogOpen(true);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* ── Agent Form Dialogs ───────────────────────────── */}
      <AgentFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
        initialData={null}
        onSubmit={handleCreateAgent}
      />
      <AgentFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode="edit"
        initialData={editFormData}
        onSubmit={handleEditAgent}
      />
      <DeleteAgentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        agentName={deleteTarget?.name || ''}
        onConfirm={handleDeleteAgent}
      />

      {/* ── Page Header ──────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            System overview with agent health monitoring, real-time metrics, and activity feeds.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {refreshLabel && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated {refreshLabel}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchData(); }}
            className="shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Top Stats Row ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((stat) => (
          <StatCard key={stat.label} stat={stat} loading={false} />
        ))}
      </div>

      {/* ── Architecture Overview ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Architecture Overview</CardTitle>
          <CardDescription>
            OpenHarness agent loop architecture — interconnected subsystems powering the agent system
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-4 pb-3">
              {SUBSYSTEMS.map((sub, idx) => {
                const Icon = sub.icon;
                return (
                  <React.Fragment key={sub.name}>
                    <div className="flex flex-col gap-3 min-w-[200px] max-w-[220px] p-4 rounded-xl border bg-muted/30 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10">
                          <Icon className="w-4.5 h-4.5 text-emerald-600" />
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          {sub.badge}
                        </Badge>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold leading-tight">{sub.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {sub.description}
                        </p>
                      </div>
                    </div>
                    {idx < SUBSYSTEMS.length - 1 && (
                      <div className="flex items-center shrink-0">
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ── Agent Loop Visualization ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Loop Flow</CardTitle>
          <CardDescription>
            Step-by-step execution flow of the agent reasoning and tool-use loop
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex items-center gap-2 pb-3">
              {LOOP_STEPS.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <React.Fragment key={step.label}>
                    <div className="flex flex-col items-center gap-2 min-w-[110px] shrink-0">
                      <div
                        className={`
                          flex items-center justify-center w-11 h-11 rounded-xl border
                          ${idx === 0
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-500/30 text-white shadow-md shadow-emerald-500/20'
                            : idx === LOOP_STEPS.length - 1
                              ? 'bg-gradient-to-br from-teal-600 to-emerald-500 border-teal-500/30 text-white shadow-md shadow-teal-500/20'
                              : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700'
                          }
                        `}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-xs font-medium text-center leading-tight ${
                          idx === 0 || idx === LOOP_STEPS.length - 1
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < LOOP_STEPS.length - 1 && (
                      <div className="flex items-center shrink-0 px-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <ArrowRight className="w-4 h-4 text-emerald-400/60" />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ── Agent List Section ───────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Registered Agents</CardTitle>
              <CardDescription>
                {agents.length} agent{agents.length !== 1 ? 's' : ''} configured in the system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setActivePage('playground')}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Open Playground
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No agents configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first agent to get started
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Agent
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const TypeIcon = getAgentIcon(agent.type);
                const statusInfo = getAgentStatus(agent.status);
                return (
                  <div
                    key={agent.id}
                    className="p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => openEditDialog(agent)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 shrink-0">
                        <TypeIcon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold">{agent.name}</h4>
                          <Badge className={`text-[10px] border ${getAgentTypeColor(agent.type)}`}>
                            {agent.type}
                          </Badge>
                          <Badge className={`text-[10px] border ${statusInfo.className}`}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {agent.description || 'No description provided'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(agent);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(agent);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="w-3 h-3" />
                        <span>{agent._count.conversations} chats</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ListTodo className="w-3 h-3" />
                        <span>{agent._count.tasks} tasks</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Brain className="w-3 h-3" />
                        <span>{agent._count.memories} memories</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom Row: Recent Activity + Task Distribution + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>
                  Latest messages and events across all agents
                </CardDescription>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {stats.totalMessages} messages total
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {stats.recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start a conversation to see activity here
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-0 max-h-96 overflow-y-auto custom-scrollbar">
                {stats.recentActivity.map((activity, idx) => {
                  const meta = getActivityMeta(activity.type);
                  const ActivityIcon = meta.icon;
                  return (
                    <React.Fragment key={activity.id}>
                      <div className="flex items-center gap-3 py-3">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${meta.dotColor}`}
                        />
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                          <ActivityIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between flex-1 gap-1 min-w-0">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm truncate">
                              <span className="font-medium">{activity.agentName}</span>
                              {' '}{meta.label}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {activity.content.length > 80
                                ? activity.content.substring(0, 80) + '...'
                                : activity.content}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            {formatRelativeTime(activity.timestamp)}
                          </span>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/60 shrink-0" />
                      </div>
                      {idx < stats.recentActivity.length - 1 && <Separator />}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Task Distribution + Quick Actions */}
        <div className="flex flex-col gap-4">
          {/* Task Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Distribution</CardTitle>
              <CardDescription>
                {stats.totalTasks} task{stats.totalTasks !== 1 ? 's' : ''} across all statuses
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <TaskDistributionBar
                distribution={stats.taskDistribution}
                loading={false}
              />
              {stats.taskSuccessRate > 0 && (
                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Success Rate</span>
                  <span className="text-sm font-semibold text-emerald-600">
                    {stats.taskSuccessRate}%
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription>
                Common tasks and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.label}
                      variant="outline"
                      className="h-auto flex-col gap-2 py-4 px-3 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors cursor-pointer"
                      onClick={() => handleQuickAction(action)}
                    >
                      <Icon className="w-5 h-5 text-muted-foreground group-hover:text-emerald-600" />
                      <span className="text-xs font-medium">{action.label}</span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── System Stats Footer ───────────────────────────── */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span><span className="font-medium text-foreground">{stats.totalTeams}</span> teams</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span><span className="font-medium text-foreground">{stats.loadedSkills}</span>/{stats.totalSkills} skills loaded</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span><span className="font-medium text-foreground">{stats.totalConversations}</span> active conversations</span>
            </div>
            {stats.runningTasks > 0 && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                <span><span className="font-medium text-foreground">{stats.runningTasks}</span> running tasks</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
