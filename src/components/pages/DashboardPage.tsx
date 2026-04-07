'use client';

import React from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// ── Stat Card Data ─────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string;
  icon: React.ElementType;
  accentBg: string;
  accentText: string;
  trend: string;
}

const STATS: StatItem[] = [
  {
    label: 'Active Agents',
    value: '3',
    icon: Users,
    accentBg: 'bg-emerald-500/10',
    accentText: 'text-emerald-600',
    trend: '+12% from last session',
  },
  {
    label: 'Available Tools',
    value: '43',
    icon: Wrench,
    accentBg: 'bg-amber-500/10',
    accentText: 'text-amber-600',
    trend: '+5 new this week',
  },
  {
    label: 'Running Tasks',
    value: '7',
    icon: Play,
    accentBg: 'bg-cyan-500/10',
    accentText: 'text-cyan-600',
    trend: '+12% from last session',
  },
  {
    label: 'Total Memory Entries',
    value: '156',
    icon: Brain,
    accentBg: 'bg-violet-500/10',
    accentText: 'text-violet-600',
    trend: '+23 added today',
  },
];

// ── Architecture Subsystems ────────────────────────────────────

interface SubsystemItem {
  name: string;
  description: string;
  icon: React.ElementType;
  badge: string;
}

const SUBSYSTEMS: SubsystemItem[] = [
  {
    name: 'Engine Agent Loop',
    description: 'Core reasoning and decision-making engine with streaming capabilities',
    icon: Cpu,
    badge: 'Active',
  },
  {
    name: 'Tools',
    description: '43+ integrated tools for code execution, web search, file operations',
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

// ── Agent Loop Steps ───────────────────────────────────────────

const LOOP_STEPS = [
  { label: 'User Prompt', icon: MessageSquare },
  { label: 'Stream Response', icon: Zap },
  { label: 'Tool Detection', icon: Wrench },
  { label: 'Permission Check', icon: Shield },
  { label: 'Execute Tool', icon: Play },
  { label: 'Loop Back', icon: RefreshCw },
];

// ── Activity Data ──────────────────────────────────────────────

interface ActivityItem {
  id: string;
  description: string;
  time: string;
  dotColor: string;
}

const ACTIVITIES: ActivityItem[] = [
  {
    id: '1',
    description: 'Agent Alpha completed code review',
    time: '2 min ago',
    dotColor: 'bg-emerald-500',
  },
  {
    id: '2',
    description: 'Tool WebSearch executed successfully',
    time: '5 min ago',
    dotColor: 'bg-amber-500',
  },
  {
    id: '3',
    description: "New skill 'debug' loaded",
    time: '12 min ago',
    dotColor: 'bg-cyan-500',
  },
  {
    id: '4',
    description: 'Team Delta spawned subagent',
    time: '18 min ago',
    dotColor: 'bg-violet-500',
  },
  {
    id: '5',
    description: 'Permission check passed for file edit',
    time: '25 min ago',
    dotColor: 'bg-emerald-500',
  },
];

// ── Quick Actions ──────────────────────────────────────────────

interface QuickAction {
  label: string;
  icon: React.ElementType;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'New Conversation',
    icon: MessageSquare,
    description: 'Start a new agent chat',
  },
  {
    label: 'Create Agent',
    icon: UserPlus,
    description: 'Configure a new agent',
  },
  {
    label: 'Manage Tools',
    icon: Settings,
    description: 'View and edit tools',
  },
  {
    label: 'View Tasks',
    icon: ListTodo,
    description: 'Monitor task progress',
  },
];

// ── Stat Card Component ────────────────────────────────────────

function StatCard({ stat }: { stat: StatItem }) {
  const Icon = stat.icon;
  return (
    <Card className="gap-0 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </span>
            <span className="text-3xl font-bold tracking-tight">{stat.value}</span>
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

// ── Main Dashboard Page ────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* ── Page Header ──────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          System overview with agent health monitoring, real-time metrics, and activity feeds.
        </p>
      </div>

      {/* ── Top Stats Row ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
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

      {/* ── Bottom Row: Recent Activity + Quick Actions ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>
                  Latest events across all agents and subsystems
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-0">
              {ACTIVITIES.map((activity, idx) => (
                <React.Fragment key={activity.id}>
                  <div className="flex items-center gap-3 py-3">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${activity.dotColor}`}
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between flex-1 gap-1 min-w-0">
                      <span className="text-sm truncate">{activity.description}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {activity.time}
                      </span>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500/60 shrink-0" />
                  </div>
                  {idx < ACTIVITIES.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </div>
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
  );
}
