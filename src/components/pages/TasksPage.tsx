'use client';

import { useState } from 'react';
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
  ArrowUpRight,
  AlertTriangle,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ── Types ─────────────────Separator───────────────────────────

type TaskStatus = 'running' | 'completed' | 'failed' | 'queued';
type TaskPriority = 'high' | 'medium' | 'low';
type TaskFilter = 'all' | TaskStatus;

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  agent: string;
  agentColor: string;
  agentInitials: string;
  createdAt: string;
  substeps: { name: string; done: boolean }[];
  output?: string;
  timeline: { time: string; event: string }[];
}

// ── Mock Data ──────────────────────────────────────────────────

const TASKS: TaskItem[] = [
  {
    id: 't1',
    title: 'Code Review for PR #234',
    description: 'Review changes in the authentication module, check for security vulnerabilities and code quality issues.',
    status: 'running',
    priority: 'high',
    progress: 75,
    agent: 'Agent Alpha',
    agentColor: 'bg-emerald-500',
    agentInitials: 'AA',
    createdAt: '15 min ago',
    substeps: [
      { name: 'Parse diff output', done: true },
      { name: 'Check naming conventions', done: true },
      { name: 'Security analysis', done: true },
      { name: 'Generate review comments', done: false },
    ],
    timeline: [
      { time: '15m ago', event: 'Task started' },
      { time: '12m ago', event: 'Diff parsed successfully (142 files)' },
      { time: '8m ago', event: 'Found 3 naming convention issues' },
      { time: '3m ago', event: 'Security scan in progress...' },
    ],
  },
  {
    id: 't2',
    title: 'Security Scan',
    description: 'Run comprehensive security scan on the codebase including dependency vulnerabilities and SAST analysis.',
    status: 'running',
    priority: 'high',
    progress: 40,
    agent: 'Agent Beta',
    agentColor: 'bg-violet-500',
    agentInitials: 'AB',
    createdAt: '25 min ago',
    substeps: [
      { name: 'Check dependency vulnerabilities', done: true },
      { name: 'Run SAST analysis', done: false },
      { name: 'Check secrets in code', done: false },
      { name: 'Generate security report', done: false },
    ],
    timeline: [
      { time: '25m ago', event: 'Task started' },
      { time: '20m ago', event: 'Dependency check started' },
      { time: '15m ago', event: 'Found 2 moderate vulnerabilities' },
      { time: '5m ago', event: 'SAST analysis running...' },
    ],
  },
  {
    id: 't3',
    title: 'Generate API Documentation',
    description: 'Auto-generate OpenAPI documentation from TypeScript type definitions and route handlers.',
    status: 'running',
    priority: 'medium',
    progress: 90,
    agent: 'Agent Gamma',
    agentColor: 'bg-teal-500',
    agentInitials: 'AG',
    createdAt: '1h ago',
    substeps: [
      { name: 'Parse route definitions', done: true },
      { name: 'Extract type information', done: true },
      { name: 'Generate OpenAPI spec', done: true },
      { name: 'Format and validate', done: false },
    ],
    timeline: [
      { time: '1h ago', event: 'Task started' },
      { time: '50m ago', event: 'Parsed 28 API endpoints' },
      { time: '30m ago', event: 'Type extraction complete' },
      { time: '10m ago', event: 'OpenAPI spec generated, formatting...' },
    ],
  },
  {
    id: 't4',
    title: 'Database Migration',
    description: 'Apply schema changes for the new memory and permissions tables to the SQLite database.',
    status: 'completed',
    priority: 'high',
    progress: 100,
    agent: 'Agent Alpha',
    agentColor: 'bg-emerald-500',
    agentInitials: 'AA',
    createdAt: '2h ago',
    substeps: [
      { name: 'Backup database', done: true },
      { name: 'Apply schema changes', done: true },
      { name: 'Verify data integrity', done: true },
      { name: 'Update indexes', done: true },
    ],
    output: 'Migration applied successfully. 4 new tables created, 6 indexes added. 0 data loss.',
    timeline: [
      { time: '2h ago', event: 'Task started' },
      { time: '1h 55m ago', event: 'Database backup created' },
      { time: '1h 50m ago', event: 'Schema changes applied' },
      { time: '1h 48m ago', event: 'Data integrity verified' },
      { time: '1h 45m ago', event: 'Task completed successfully' },
    ],
  },
  {
    id: 't5',
    title: 'Unit Test Suite',
    description: 'Execute the full unit test suite for the agent communication module and report coverage metrics.',
    status: 'running',
    priority: 'medium',
    progress: 30,
    agent: 'Agent Delta',
    agentColor: 'bg-amber-500',
    agentInitials: 'AD',
    createdAt: '30 min ago',
    substeps: [
      { name: 'Setup test environment', done: true },
      { name: 'Run core tests', done: false },
      { name: 'Run integration tests', done: false },
      { name: 'Generate coverage report', done: false },
    ],
    timeline: [
      { time: '30m ago', event: 'Task started' },
      { time: '25m ago', event: 'Test environment configured' },
      { time: '10m ago', event: 'Running core tests...' },
    ],
  },
  {
    id: 't6',
    title: 'Performance Benchmark',
    description: 'Run performance benchmarks on the API routes and measure response times under simulated load.',
    status: 'queued',
    priority: 'low',
    progress: 0,
    agent: 'Unassigned',
    agentColor: 'bg-zinc-400',
    agentInitials: '?',
    createdAt: '45 min ago',
    substeps: [
      { name: 'Setup benchmark environment', done: false },
      { name: 'Run API benchmarks', done: false },
      { name: 'Analyze results', done: false },
    ],
    timeline: [
      { time: '45m ago', event: 'Task queued, waiting for agent' },
    ],
  },
  {
    id: 't7',
    title: 'Deploy to Staging',
    description: 'Deploy the latest build to the staging environment on Vercel and run smoke tests.',
    status: 'failed',
    priority: 'high',
    progress: 60,
    agent: 'Agent Gamma',
    agentColor: 'bg-teal-500',
    agentInitials: 'AG',
    createdAt: '1h ago',
    substeps: [
      { name: 'Build project', done: true },
      { name: 'Deploy to Vercel', done: true },
      { name: 'Run smoke tests', done: false },
      { name: 'Verify deployment', done: false },
    ],
    timeline: [
      { time: '1h ago', event: 'Task started' },
      { time: '50m ago', event: 'Build completed successfully' },
      { time: '45m ago', event: 'Deployed to Vercel staging' },
      { time: '40m ago', event: 'Smoke test failed: API timeout' },
      { time: '40m ago', event: 'Task failed' },
    ],
  },
  {
    id: 't8',
    title: 'Update Dependencies',
    description: 'Check for and update outdated npm packages while ensuring compatibility with existing code.',
    status: 'completed',
    priority: 'low',
    progress: 100,
    agent: 'Agent Alpha',
    agentColor: 'bg-emerald-500',
    agentInitials: 'AA',
    createdAt: '3h ago',
    substeps: [
      { name: 'Audit dependencies', done: true },
      { name: 'Update packages', done: true },
      { name: 'Run tests', done: true },
    ],
    output: 'Updated 5 packages. All 247 tests passing. No breaking changes detected.',
    timeline: [
      { time: '3h ago', event: 'Task started' },
      { time: '2h 50m ago', event: 'Found 5 outdated packages' },
      { time: '2h 40m ago', event: 'Packages updated' },
      { time: '2h 30m ago', event: 'All tests passing' },
      { time: '2h 30m ago', event: 'Task completed successfully' },
    ],
  },
  {
    id: 't9',
    title: 'Research Web Frameworks',
    description: 'Research and compare modern web frameworks including performance benchmarks and ecosystem analysis.',
    status: 'running',
    priority: 'medium',
    progress: 55,
    agent: 'Agent Beta',
    agentColor: 'bg-violet-500',
    agentInitials: 'AB',
    createdAt: '45 min ago',
    substeps: [
      { name: 'Gather benchmark data', done: true },
      { name: 'Analyze ecosystems', done: true },
      { name: 'Compare features', done: false },
      { name: 'Write summary report', done: false },
    ],
    timeline: [
      { time: '45m ago', event: 'Task started' },
      { time: '35m ago', event: 'Benchmark data collected' },
      { time: '20m ago', event: 'Ecosystem analysis complete' },
      { time: '5m ago', event: 'Feature comparison in progress...' },
    ],
  },
  {
    id: 't10',
    title: 'Create Release Notes',
    description: 'Generate release notes from the commit history and PR descriptions for version 2.4.0.',
    status: 'queued',
    priority: 'low',
    progress: 0,
    agent: 'Unassigned',
    agentColor: 'bg-zinc-400',
    agentInitials: '?',
    createdAt: '1h ago',
    substeps: [
      { name: 'Fetch commit history', done: false },
      { name: 'Categorize changes', done: false },
      { name: 'Generate notes', done: false },
    ],
    timeline: [
      { time: '1h ago', event: 'Task queued, waiting for agent' },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case 'running':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <XCircle className="w-3 h-3" />
          Failed
        </Badge>
      );
    case 'queued':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
          <Timer className="w-3 h-3" />
          Queued
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

function getProgressColor(status: TaskStatus, progress: number): string {
  if (status === 'failed') return '[&_div]:bg-destructive';
  if (status === 'completed') return '';
  if (progress >= 75) return '';
  if (progress >= 50) return '';
  return '';
}

// ── Task Detail Dialog ─────────────────────────────────────────

function TaskDetailDialog({ task, open, onClose }: { task: TaskItem | null; open: boolean; onClose: () => void }) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">{task.title}</DialogTitle>
            {getStatusBadge(task.status)}
            {getPriorityBadge(task.priority)}
          </div>
          <DialogDescription>{task.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Agent & time */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full ${task.agentColor} flex items-center justify-center text-white text-[10px] font-bold`}>
                {task.agentInitials}
              </div>
              <span className="text-sm font-medium">{task.agent}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {task.createdAt}
            </div>
          </div>

          {/* Progress */}
          {task.status !== 'queued' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span className="text-muted-foreground">{task.progress}%</span>
              </div>
              <Progress value={task.progress} className={getProgressColor(task.status, task.progress)} />
            </div>
          )}

          {/* Substeps */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Substeps</span>
            <div className="space-y-1.5">
              {task.substeps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>
                    {step.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Output */}
          {task.output && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Output</span>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-muted-foreground">{task.output}</p>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Timeline</span>
            <div className="space-y-2">
              {task.timeline.map((event, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      i === task.timeline.length - 1
                        ? task.status === 'failed'
                          ? 'bg-destructive'
                          : 'bg-emerald-500'
                        : 'bg-zinc-300 dark:bg-zinc-600'
                    }`} />
                    {i < task.timeline.length - 1 && (
                      <div className="w-px h-6 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <span className="text-xs text-muted-foreground">{event.time}</span>
                    <p className="text-sm">{event.event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function TasksPage() {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const filteredTasks = filter === 'all' ? TASKS : TASKS.filter((t) => t.status === filter);

  const runningCount = TASKS.filter((t) => t.status === 'running').length;
  const completedCount = TASKS.filter((t) => t.status === 'completed').length;
  const failedCount = TASKS.filter((t) => t.status === 'failed').length;
  const queuedCount = TASKS.filter((t) => t.status === 'queued').length;

  const filterButtons: { key: TaskFilter; label: string; count: number; color?: string }[] = [
    { key: 'all', label: 'All', count: TASKS.length },
    { key: 'running', label: 'Running', count: runningCount, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'completed', label: 'Completed', count: completedCount, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'failed', label: 'Failed', count: failedCount, color: 'text-destructive' },
    { key: 'queued', label: 'Queued', count: queuedCount, color: 'text-amber-600 dark:text-amber-400' },
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
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </motion.div>

      {/* Task stats row */}
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
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{runningCount}</span>
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
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</span>
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
              <span className="text-2xl font-bold text-destructive">{failedCount}</span>
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
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{queuedCount}</span>
              <p className="text-xs text-muted-foreground">Queued</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

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
            onClick={() => setFilter(btn.key)}
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
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-3 pr-3">
            <AnimatePresence mode="popLayout">
              {filteredTasks.map((task, i) => (
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
                          <div className={`w-10 h-10 rounded-lg ${task.agentColor} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                            {task.agentInitials}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{task.title}</span>
                              {getPriorityBadge(task.priority)}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {task.description}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {task.agent}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {task.createdAt}
                              </span>
                              {getStatusBadge(task.status)}
                            </div>
                            {/* Progress bar */}
                            {(task.status === 'running' || task.status === 'failed') && (
                              <div className="flex items-center gap-3">
                                <Progress
                                  value={task.progress}
                                  className={`h-1.5 flex-1 ${getProgressColor(task.status, task.progress)}`}
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
                          {task.status === 'running' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-amber-600 dark:text-amber-400"
                            >
                              <Square className="w-3.5 h-3.5" />
                              Stop
                            </Button>
                          )}
                          {task.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-emerald-600 dark:text-emerald-400"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ListTodo className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No tasks match the selected filter</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </motion.div>

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
