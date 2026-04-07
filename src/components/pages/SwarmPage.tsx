'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  Settings,
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Shield,
  FileCode,
  Search,
  BarChart3,
  Globe,
  PenLine,
  Server,
  TestTube,
  Rocket,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// ── Types ──────────────────────────────────────────────────────

interface AgentMember {
  name: string;
  role: string;
  status: 'active' | 'idle' | 'busy';
  color: string;
  initials: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  status: 'Active' | 'Idle' | 'Offline';
  members: AgentMember[];
  tasksCompleted: number;
  activeTasks: number;
  successRate: number;
}

// ── Mock Data ──────────────────────────────────────────────────

const TEAMS: Team[] = [
  {
    id: 'alpha',
    name: 'Team Alpha',
    description: 'Code Review Squad',
    status: 'Active',
    tasksCompleted: 24,
    activeTasks: 3,
    successRate: 96,
    members: [
      { name: 'Code Reviewer', role: 'Coordinator', status: 'active', color: 'bg-emerald-500', initials: 'CR' },
      { name: 'Security Scanner', role: 'Worker', status: 'active', color: 'bg-teal-500', initials: 'SS' },
      { name: 'Style Checker', role: 'Worker', status: 'active', color: 'bg-cyan-500', initials: 'SC' },
    ],
  },
  {
    id: 'beta',
    name: 'Team Beta',
    description: 'Research Collective',
    status: 'Active',
    tasksCompleted: 18,
    activeTasks: 5,
    successRate: 94,
    members: [
      { name: 'Web Researcher', role: 'Coordinator', status: 'active', color: 'bg-violet-500', initials: 'WR' },
      { name: 'Data Analyst', role: 'Worker', status: 'busy', color: 'bg-orange-500', initials: 'DA' },
      { name: 'Report Writer', role: 'Worker', status: 'active', color: 'bg-pink-500', initials: 'RW' },
      { name: 'Citation Checker', role: 'Worker', status: 'idle', color: 'bg-amber-500', initials: 'CC' },
    ],
  },
  {
    id: 'delta',
    name: 'Team Delta',
    description: 'DevOps Pipeline',
    status: 'Idle',
    tasksCompleted: 42,
    activeTasks: 0,
    successRate: 98,
    members: [
      { name: 'Build Manager', role: 'Coordinator', status: 'idle', color: 'bg-sky-500', initials: 'BM' },
      { name: 'Test Runner', role: 'Worker', status: 'idle', color: 'bg-rose-500', initials: 'TR' },
      { name: 'Deployment Agent', role: 'Worker', status: 'idle', color: 'bg-lime-500', initials: 'DA' },
    ],
  },
];

const AGENT_ICONS: Record<string, React.ElementType> = {
  'Code Reviewer': FileCode,
  'Security Scanner': Shield,
  'Style Checker': PenLine,
  'Web Researcher': Search,
  'Data Analyst': BarChart3,
  'Report Writer': Globe,
  'Citation Checker': CheckCircle2,
  'Build Manager': Server,
  'Test Runner': TestTube,
  'Deployment Agent': Rocket,
};

// ── Agent Network Visualization ────────────────────────────────

function AgentNetwork({ members }: { members: AgentMember[] }) {
  const coordinator = members[0];
  const workers = members.slice(1);

  // Positions: coordinator at center, workers around it
  const centerX = 120;
  const centerY = 80;
  const radius = 58;

  const workerPositions = workers.map((_, i) => {
    const angle = ((2 * Math.PI) / workers.length) * i - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return (
    <div className="relative w-[240px] h-[160px] mx-auto">
      {/* SVG lines connecting coordinator to workers */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        {workerPositions.map((pos, i) => (
          <motion.line
            key={i}
            x1={centerX}
            y1={centerY}
            x2={pos.x}
            y2={pos.y}
            stroke="currentColor"
            className="text-emerald-300 dark:text-emerald-600"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.6 }}
            transition={{ duration: 0.6, delay: i * 0.15 }}
          />
        ))}
      </svg>

      {/* Coordinator node */}
      <motion.div
        className="absolute flex flex-col items-center"
        style={{
          left: centerX - 24,
          top: centerY - 24,
          zIndex: 2,
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <div className="relative">
          <div className={`w-12 h-12 rounded-full ${coordinator.color} flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
            {coordinator.initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-background" />
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground mt-1 font-medium whitespace-nowrap">
          Coordinator
        </span>
      </motion.div>

      {/* Worker nodes */}
      {workers.map((worker, i) => {
        const pos = workerPositions[i];
        const Icon = AGENT_ICONS[worker.name];
        return (
          <motion.div
            key={worker.name}
            className="absolute flex flex-col items-center"
            style={{
              left: pos.x - 20,
              top: pos.y - 20,
              zIndex: 1,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 + i * 0.1 }}
          >
            <div className={`w-10 h-10 rounded-full ${worker.color} flex items-center justify-center text-white text-[10px] font-bold shadow-md`}>
              {Icon ? <Icon className="w-4 h-4" /> : worker.initials}
            </div>
            <span className="text-[9px] text-muted-foreground mt-1 font-medium whitespace-nowrap max-w-[60px] truncate text-center">
              {worker.name}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Team Card ──────────────────────────────────────────────────

function TeamCard({ team, index }: { team: Team; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg">{team.name}</CardTitle>
                <Badge
                  className={
                    team.status === 'Active'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : team.status === 'Idle'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20'
                  }
                  variant="outline"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      team.status === 'Active' ? 'bg-emerald-500' : team.status === 'Idle' ? 'bg-amber-500' : 'bg-zinc-400'
                    }`}
                  />
                  {team.status}
                </Badge>
              </div>
              <CardDescription>{team.description}</CardDescription>
            </div>
            <CardAction>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                Manage
              </Button>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Agent avatars */}
          <div className="flex items-center gap-2">
            {team.members.map((member, i) => (
              <div
                key={member.name}
                className="relative"
                style={{ marginLeft: i > 0 ? '-8px' : 0, zIndex: team.members.length - i }}
                title={member.name}
              >
                <div className={`w-9 h-9 rounded-full ${member.color} flex items-center justify-center text-white text-[10px] font-bold border-2 border-background`}>
                  {member.initials}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                    member.status === 'active'
                      ? 'bg-emerald-500'
                      : member.status === 'busy'
                        ? 'bg-orange-500'
                        : 'bg-zinc-400'
                  }`}
                />
              </div>
            ))}
            <span className="text-xs text-muted-foreground ml-2">
              {team.members.length} agents
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Active Tasks</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">{team.activeTasks}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Completed</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">{team.tasksCompleted}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Success Rate</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{team.successRate}%</span>
              </div>
            </div>
          </div>

          {/* Success rate bar */}
          <div className="space-y-1.5">
            <Progress value={team.successRate} className="h-1.5" />
          </div>

          <Separator />

          {/* Expand button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? 'Hide Details' : 'Show Team Details'}
          </Button>

          {/* Expanded section */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                  {/* Agent hierarchy */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Team Topology
                    </span>
                    <div className="mt-3">
                      <AgentNetwork members={team.members} />
                    </div>
                  </div>

                  <Separator />

                  {/* Member list */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Members
                    </span>
                    <div className="mt-2 space-y-2">
                      {team.members.map((member) => {
                        const Icon = AGENT_ICONS[member.name];
                        return (
                          <div
                            key={member.name}
                            className="flex items-center justify-between p-2 rounded-md bg-background border"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full ${member.color} flex items-center justify-center text-white shrink-0`}>
                                {Icon ? <Icon className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
                              </div>
                              <div>
                                <span className="text-sm font-medium">{member.name}</span>
                                <span className="text-xs text-muted-foreground ml-1.5 capitalize">
                                  {member.role}
                                </span>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                member.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : member.status === 'busy'
                                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                                    : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                              }
                            >
                              {member.status}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function SwarmPage() {
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
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Swarm Coordination</h1>
            <p className="text-sm text-muted-foreground">
              Manage multi-agent teams and orchestration topologies
            </p>
          </div>
        </div>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4" />
          Create Team
        </Button>
      </motion.div>

      {/* Stats overview */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {[
          { label: 'Total Teams', value: '3', icon: Users, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Active Agents', value: '10', icon: Cpu, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Tasks Completed', value: '84', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Avg Success Rate', value: '96%', icon: Activity, color: 'text-emerald-600 dark:text-emerald-400' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="py-4">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 shrink-0">
                  <Icon className={`w-4.5 h-4.5 ${stat.color}`} />
                </div>
                <div>
                  <span className="text-2xl font-bold">{stat.value}</span>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Team cards */}
      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
        {TEAMS.map((team, i) => (
          <TeamCard key={team.id} team={team} index={i} />
        ))}
      </div>
    </div>
  );
}
