'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListTodo,
  Plus,
  Eye,
  Square,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  Loader2,
  Circle,
  AlertTriangle,
  User,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────

type ApiTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
type UiStatus = 'running' | 'completed' | 'failed' | 'queued';
type UiFilter = 'all' | UiStatus;
type TaskPriority = 'high' | 'medium' | 'low';

interface AgentData {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
}

interface TaskData {
  id: string;
  agentId: string | null;
  teamId: string | null;
  title: string;
  description: string | null;
  status: ApiTaskStatus;
  priority: TaskPriority;
  progress: number;
  result: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
}

// ── Status mapping (API ↔ UI) ─────────────────────────────────

const API_TO_UI: Record<ApiTaskStatus, UiStatus> = {
  pending: 'queued',
  in_progress: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
};

const UI_TO_API: Record<UiFilter, ApiTaskStatus | undefined> = {
  all: undefined,
  running: 'in_progress',
  completed: 'completed',
  failed: 'failed',
  queued: 'pending',
};

const UI_STATUS_LABELS: Record<UiStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  queued: 'Queued',
};

const AGENT_COLORS: Record<string, string> = {
  alpha: 'bg-emerald-500',
  beta: 'bg-violet-500',
  gamma: 'bg-teal-500',
};

function getAgentMeta(agent: { id: string; name: string } | null | undefined) {
  if (!agent) return { name: 'Unassigned', color: 'bg-zinc-400', initials: '?' };
  const key = agent.name.toLowerCase();
  const color = AGENT_COLORS[key] || 'bg-zinc-500';
  const initials = agent.name.slice(0, 2).toUpperCase();
  return { name: agent.name, color, initials };
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ── Badge Helpers ──────────────────────────────────────────────

function getStatusBadge(uiStatus: UiStatus) {
  switch (uiStatus) {
    case 'running':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {UI_STATUS_LABELS.running}
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {UI_STATUS_LABELS.completed}
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <XCircle className="w-3 h-3" />
          {UI_STATUS_LABELS.failed}
        </Badge>
      );
    case 'queued':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
          <Timer className="w-3 h-3" />
          {UI_STATUS_LABELS.queued}
        </Badge>
      );
  }
}

function getPriorityBadge(priority: TaskPriority) {
  switch (priority) {
    case 'high':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
          High
        </Badge>
      );
    case 'medium':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          Medium
        </Badge>
      );
    case 'low':
      return (
        <Badge variant="outline" className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20">
          Low
        </Badge>
      );
  }
}

// ── Skeleton Loaders ───────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="py-4">
          <CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaskCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-14" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Task Detail Dialog ─────────────────────────────────────────

function TaskDetailDialog({ task, open, onClose }: { task: TaskData | null; open: boolean; onClose: () => void }) {
  if (!task) return null;

  const uiStatus = API_TO_UI[task.status];
  const agentMeta = getAgentMeta(task.agent);
  const result = task.result ? (typeof task.result === 'string' ? JSON.parse(task.result) : task.result) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-lg">{task.title}</DialogTitle>
            {getStatusBadge(uiStatus)}
            {getPriorityBadge(task.priority)}
          </div>
          <DialogDescription>{task.description || 'No description provided.'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Agent & time */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full ${agentMeta.color} flex items-center justify-center text-white text-[10px] font-bold`}>
                {agentMeta.initials}
              </div>
              <span className="text-sm font-medium">{agentMeta.name}</span>
            </div>
            {task.team && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-xs text-muted-foreground">{task.team.name}</span>
              </>
            )}
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {formatTimeAgo(task.createdAt)}
            </div>
          </div>

          {/* Progress */}
          {uiStatus !== 'queued' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span className="text-muted-foreground">{task.progress}%</span>
              </div>
              <Progress value={task.progress} className={uiStatus === 'failed' ? '[&_div]:bg-destructive' : ''} />
            </div>
          )}

          {/* Result / Output */}
          {result && typeof result === 'object' && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Result</span>
              <div className="rounded-lg bg-muted p-3">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {task.description && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Description</span>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-muted-foreground">{task.description}</p>
              </div>
            </div>
          )}

          {/* Timeline events */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Activity</span>
            <div className="space-y-2">
              <div className="flex gap-3 items-start">
                <div className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    task.status === 'completed' ? 'bg-emerald-500' :
                    task.status === 'failed' ? 'bg-destructive' :
                    'bg-emerald-500'
                  }`} />
                </div>
                <div className="flex-1 pb-2">
                  <span className="text-xs text-muted-foreground">{formatTimeAgo(task.createdAt)}</span>
                  <p className="text-sm">Task created</p>
                </div>
              </div>
              {task.updatedAt !== task.createdAt && (
                <div className="flex gap-3 items-start">
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      task.status === 'completed' ? 'bg-emerald-500' : 'bg-destructive'
                    }`} />
                  </div>
                  <div className="flex-1 pb-2">
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(task.updatedAt)}</span>
                    <p className="text-sm">
                      {task.status === 'completed' ? 'Task completed successfully' :
                       task.status === 'failed' ? 'Task failed' :
                       task.status === 'cancelled' ? 'Task cancelled' :
                       `Progress updated to ${task.progress}%`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Task Dialog ─────────────────────────────────────────

function CreateTaskDialog({
  open,
  onClose,
  agents,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  agents: AgentData[];
  onSubmit: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [agentId, setAgentId] = useState<string>('none');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
      };
      if (agentId && agentId !== 'none') {
        body.agentId = agentId;
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create task');
      }

      toast.success(`Task "${title.trim()}" created`);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAgentId('none');
      onClose();
      onSubmit();
    } catch (err) {
      console.error('Create task error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Add a new background task for execution.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              placeholder="Enter task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              placeholder="Describe the task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assign Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {agents.filter((a) => a.status === 'active').map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [filter, setFilter] = useState<UiFilter>('all');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async (statusFilter?: ApiTaskStatus) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const [tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/tasks?${params.toString()}`),
        fetch('/api/agents'),
      ]);

      if (!tasksRes.ok || !agentsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const tasksJson = await tasksRes.json();
      const agentsJson = await agentsRes.json();

      setTasks(tasksJson.data || []);
      setAgents(agentsJson.data || []);
    } catch (err) {
      console.error('TasksPage fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Map API tasks to UI status
  const tasksWithUiStatus = useMemo(() => {
    return tasks.map((t) => ({ ...t, uiStatus: API_TO_UI[t.status] }));
  }, [tasks]);

  // Filter tasks by current UI filter
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasksWithUiStatus;
    return tasksWithUiStatus.filter((t) => t.uiStatus === filter);
  }, [tasksWithUiStatus, filter]);

  // Count tasks by UI status
  const counts = useMemo(() => {
    const c: Record<UiStatus, number> = { running: 0, completed: 0, failed: 0, queued: 0 };
    for (const t of tasksWithUiStatus) {
      c[t.uiStatus]++;
    }
    return c;
  }, [tasksWithUiStatus]);

  // When filter changes, re-fetch with API status param
  const handleFilterChange = useCallback((newFilter: UiFilter) => {
    setFilter(newFilter);
    const apiStatus = UI_TO_API[newFilter];
    fetchTasks(apiStatus);
  }, [fetchTasks]);

  // Stop a running task
  const handleStop = useCallback(async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed to stop task');
      toast.success('Task stopped');
      fetchTasks(UI_TO_API[filter]);
    } catch (err) {
      console.error('Stop task error:', err);
      toast.error('Failed to stop task');
    } finally {
      setActionLoading(null);
    }
  }, [fetchTasks, filter]);

  // Retry a failed task
  const handleRetry = useCallback(async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', progress: 0 }),
      });
      if (!res.ok) throw new Error('Failed to retry task');
      toast.success('Task restarted');
      fetchTasks(UI_TO_API[filter]);
    } catch (err) {
      console.error('Retry task error:', err);
      toast.error('Failed to retry task');
    } finally {
      setActionLoading(null);
    }
  }, [fetchTasks, filter]);

  const filterButtons: { key: UiFilter; label: string; count: number; color?: string }[] = [
    { key: 'all', label: 'All', count: tasksWithUiStatus.length },
    { key: 'running', label: 'Running', count: counts.running, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'completed', label: 'Completed', count: counts.completed, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'failed', label: 'Failed', count: counts.failed, color: 'text-destructive' },
    { key: 'queued', label: 'Queued', count: counts.queued, color: 'text-amber-600 dark:text-amber-400' },
  ];

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
            <ListTodo className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Task Manager</h1>
            <p className="text-sm text-muted-foreground">
              Background task execution, monitoring, and lifecycle management
            </p>
          </div>
        </div>
        <Button
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </motion.div>

      {/* Task stats row */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="py-4">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 shrink-0">
                <Loader2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 animate-spin" />
              </div>
              <div>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{counts.running}</span>
                <p className="text-xs text-muted-foreground">Running</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-4">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 shrink-0">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{counts.completed}</span>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-4">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/10 shrink-0">
                <XCircle className="w-4.5 h-4.5 text-destructive" />
              </div>
              <div>
                <span className="text-2xl font-bold text-destructive">{counts.failed}</span>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-4">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 shrink-0">
                <Timer className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.queued}</span>
                <p className="text-xs text-muted-foreground">Queued</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Filter buttons */}
      <motion.div
        className="flex flex-wrap items-center gap-2"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        {filterButtons.map((btn) => (
          <Button
            key={btn.key}
            variant={filter === btn.key ? 'default' : 'outline'}
            size="sm"
            className={`gap-1.5 ${filter === btn.key ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
            onClick={() => handleFilterChange(btn.key)}
          >
            {btn.label}
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-4 ${
                filter === btn.key
                  ? 'bg-white/20 text-white'
                  : btn.color || ''
              }`}
            >
              {btn.count}
            </Badge>
          </Button>
        ))}
      </motion.div>

      {/* Task list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ListTodo className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm mb-3">Failed to load tasks</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTasks(UI_TO_API[filter])}
              className="gap-1.5"
            >
              <Loader2 className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <TaskCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Task cards */}
        {!loading && !error && (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3 pr-3">
              <AnimatePresence mode="popLayout">
                {filteredTasks.map((task, i) => {
                  const agentMeta = getAgentMeta(task.agent);
                  const isActing = actionLoading === task.id;

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                    >
                      <Card className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            {/* Left: Agent + Info */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`w-10 h-10 rounded-lg ${agentMeta.color} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                                {agentMeta.initials}
                              </div>
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{task.title}</span>
                                  {getPriorityBadge(task.priority)}
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {task.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {agentMeta.name}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTimeAgo(task.createdAt)}
                                  </span>
                                  {getStatusBadge(task.uiStatus)}
                                </div>
                                {/* Progress bar for running/failed */}
                                {(task.uiStatus === 'running' || task.uiStatus === 'failed') && (
                                  <div className="flex items-center gap-3">
                                    <Progress
                                      value={task.progress}
                                      className={`h-1.5 flex-1 ${task.uiStatus === 'failed' ? '[&_div]:bg-destructive' : ''}`}
                                    />
                                    <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                                      {task.progress}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-1.5 shrink-0 sm:mt-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-muted-foreground"
                                onClick={() => setSelectedTask(task)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </Button>
                              {task.uiStatus === 'running' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5 text-amber-600 dark:text-amber-400"
                                  onClick={() => handleStop(task.id)}
                                  disabled={isActing}
                                >
                                  {isActing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5" />
                                  )}
                                  Stop
                                </Button>
                              )}
                              {task.uiStatus === 'failed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5 text-emerald-600 dark:text-emerald-400"
                                  onClick={() => handleRetry(task.id)}
                                  disabled={isActing}
                                >
                                  {isActing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  )}
                                  Retry
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {!loading && filteredTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ListTodo className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No tasks match the selected filter</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </motion.div>

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        agents={agents}
        onSubmit={() => fetchTasks(UI_TO_API[filter])}
      />
    </div>
  );
}
