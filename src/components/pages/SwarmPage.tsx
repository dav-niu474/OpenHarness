'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  Settings,
  Activity,
  CheckCircle2,
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
  Loader2,
  X,
  Trash2,
  UserPlus,
  Bot,
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
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────

interface AgentData {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  _count: { conversations: number; tasks: number; memories: number };
}

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  type: string;
}

interface MemberData {
  id: string;
  teamId: string;
  agentId: string;
  role: string;
  agent: AgentInfo;
}

interface TeamData {
  id: string;
  name: string;
  description: string | null;
  config: string;
  createdAt: string;
  members: MemberData[];
}

interface TaskData {
  id: string;
  agentId: string | null;
  teamId: string | null;
  status: string;
  priority: string;
  progress: number;
  agent?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
}

interface StatsData {
  activeAgents: number;
  totalAgents: number;
  totalTeams: number;
  runningTasks: number;
  totalTasks: number;
  taskSuccessRate: number;
  taskDistribution?: Record<string, number>;
}

interface TeamConfig {
  collaborationMode?: string;
  maxAgents?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  alpha: 'bg-emerald-500',
  beta: 'bg-violet-500',
  gamma: 'bg-teal-500',
};

const AGENT_ICONS: Record<string, React.ElementType> = {
  Alpha: FileCode,
  Beta: Search,
  Gamma: Server,
};

function getAgentColor(name: string): string {
  const key = name.toLowerCase().split(' ')[0];
  return AGENT_COLORS[key] || 'bg-zinc-500';
}

function getAgentInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function getAgentIcon(name: string): React.ElementType {
  const key = name.split(' ')[0];
  return AGENT_ICONS[key] || Cpu;
}

function parseConfig(configStr: string): TeamConfig {
  try {
    return JSON.parse(configStr);
  } catch {
    return {};
  }
}

const ROLE_COLORS: Record<string, string> = {
  leader: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  worker: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  reviewer: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  observer: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
};

const COLLABORATION_LABELS: Record<string, string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
  pipeline: 'Pipeline',
};

// ── Agent Network Visualization ────────────────────────────────

function AgentNetwork({ members }: { members: MemberData[] }) {
  const coordinator = members[0];
  const workers = members.slice(1);

  if (!coordinator) return null;

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

      <motion.div
        className="absolute flex flex-col items-center"
        style={{ left: centerX - 24, top: centerY - 24, zIndex: 2 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <div className="relative">
          <div className={`w-12 h-12 rounded-full ${getAgentColor(coordinator.agent.name)} flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
            {getAgentInitials(coordinator.agent.name)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-background" />
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground mt-1 font-medium whitespace-nowrap">
          {coordinator.agent.name}
        </span>
      </motion.div>

      {workers.map((worker, i) => {
        const pos = workerPositions[i];
        const Icon = getAgentIcon(worker.agent.name);
        return (
          <motion.div
            key={worker.id}
            className="absolute flex flex-col items-center"
            style={{ left: pos.x - 20, top: pos.y - 20, zIndex: 1 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 + i * 0.1 }}
          >
            <div className={`w-10 h-10 rounded-full ${getAgentColor(worker.agent.name)} flex items-center justify-center text-white text-[10px] font-bold shadow-md`}>
              {Icon ? <Icon className="w-4 h-4" /> : getAgentInitials(worker.agent.name)}
            </div>
            <span className="text-[9px] text-muted-foreground mt-1 font-medium whitespace-nowrap max-w-[60px] truncate text-center">
              {worker.agent.name}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
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
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TeamCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-center gap-2">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="w-9 h-9 rounded-full -ml-4" />
          <Skeleton className="w-9 h-9 rounded-full -ml-4" />
          <Skeleton className="h-4 w-16 ml-2" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </CardContent>
    </Card>
  );
}

// ── Create/Edit Team Dialog ────────────────────────────────────

function TeamFormDialog({
  open,
  onOpenChange,
  team,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamData | null;
  onSave: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collabMode, setCollabMode] = useState('parallel');
  const [maxAgents, setMaxAgents] = useState('5');
  const [saving, setSaving] = useState(false);

  const isEdit = !!team;
  const existingConfig = team ? parseConfig(team.config) : {};

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description || '');
      setCollabMode(existingConfig.collaborationMode || 'parallel');
      setMaxAgents(String(existingConfig.maxAgents || 5));
    } else {
      setName('');
      setDescription('');
      setCollabMode('parallel');
      setMaxAgents('5');
    }
  }, [team, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Team name is required');
      return;
    }

    setSaving(true);
    try {
      const config = { collaborationMode: collabMode, maxAgents: parseInt(maxAgents, 10) || 5 };
      const url = '/api/teams';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit
        ? { id: team!.id, name: name.trim(), description: description.trim() || null, config }
        : { name: name.trim(), description: description.trim() || null, config };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save team');
      }

      toast.success(isEdit ? 'Team updated' : 'Team created');
      onOpenChange(false);
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <>
                <Settings className="w-4 h-4 text-emerald-600" />
                Edit Team
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 text-emerald-600" />
                Create Team
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update team settings and configuration.' : 'Create a new multi-agent team for collaborative tasks.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              placeholder="e.g. Code Review Squad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Description</Label>
            <Textarea
              id="team-desc"
              placeholder="Optional team description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Collaboration Mode</Label>
              <Select value={collabMode} onValueChange={setCollabMode}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                  <SelectItem value="pipeline">Pipeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-agents">Max Agents</Label>
              <Input
                id="max-agents"
                type="number"
                min={1}
                max={20}
                value={maxAgents}
                onChange={(e) => setMaxAgents(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Team AlertDialog ────────────────────────────────────

function DeleteTeamDialog({
  open,
  onOpenChange,
  team,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamData | null;
  onConfirm: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!team) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: team.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete team');
      }
      toast.success(`"${team.name}" deleted`);
      onOpenChange(false);
      onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Team</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{team?.name}</strong>? This will also remove all members and any associated task assignments. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={deleting}
          >
            {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Delete Team
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Add Member Dialog ──────────────────────────────────────────

function AddMemberDialog({
  open,
  onOpenChange,
  team,
  agents,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamData | null;
  agents: AgentData[];
  onConfirm: () => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedRole, setSelectedRole] = useState('worker');
  const [adding, setAdding] = useState(false);

  const memberAgentIds = team ? team.members.map((m) => m.agentId) : [];
  const availableAgents = agents.filter((a) => !memberAgentIds.includes(a.id));

  useEffect(() => {
    setSelectedAgentId('');
    setSelectedRole('worker');
  }, [open, team]);

  const handleAdd = async () => {
    if (!team || !selectedAgentId) {
      toast.error('Please select an agent');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/teams/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: team.id, agentId: selectedAgentId, role: selectedRole }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add member');
      }

      const agent = agents.find((a) => a.id === selectedAgentId);
      toast.success(`${agent?.name || 'Agent'} added to ${team.name}`);
      onOpenChange(false);
      onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600" />
            Add Member
          </DialogTitle>
          <DialogDescription>
            Add an agent to <strong>{team?.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an agent..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgents.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                    No available agents
                  </div>
                ) : (
                  availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <span className="flex items-center gap-2">
                        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                        {agent.name}
                        <span className="text-xs text-muted-foreground capitalize">({agent.status})</span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leader">Leader</SelectItem>
                <SelectItem value="worker">Worker</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="observer">Observer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={adding || !selectedAgentId}
            onClick={handleAdd}
          >
            {adding && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Team Card ──────────────────────────────────────────────────

function TeamCard({
  team,
  index,
  tasks,
  onEdit,
  onDelete,
  onAddMember,
  onRemoveMember,
}: {
  team: TeamData;
  index: number;
  tasks: TaskData[];
  onEdit: (team: TeamData) => void;
  onDelete: (team: TeamData) => void;
  onAddMember: (team: TeamData) => void;
  onRemoveMember: (memberId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const config = parseConfig(team.config);
  const collabMode = COLLABORATION_LABELS[config.collaborationMode || 'parallel'] || 'Parallel';

  // Calculate task stats
  const teamTasks = tasks.filter((t) => t.teamId === team.id);
  const totalTasks = teamTasks.length;
  const activeTasks = teamTasks.filter((t) => t.status === 'in_progress' || t.status === 'pending').length;
  const completedTasks = teamTasks.filter((t) => t.status === 'completed').length;
  const completedOrFailed = teamTasks.filter((t) => t.status === 'completed' || t.status === 'failed').length;
  const successRate = completedOrFailed > 0
    ? Math.round((completedTasks / completedOrFailed) * 100)
    : totalTasks > 0 ? 100 : 0;

  const teamStatus = team.members.length > 0 && team.members.some((m) => m.agent.status === 'active')
    ? 'Active'
    : 'Idle';

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
                    teamStatus === 'Active'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  }
                  variant="outline"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      teamStatus === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {teamStatus}
                </Badge>
                <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/20 text-xs">
                  {collabMode}
                </Badge>
              </div>
              <CardDescription>{team.description || 'No description'}</CardDescription>
            </div>
            <CardAction>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  title="Edit team"
                  onClick={() => onEdit(team)}
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  title="Delete team"
                  onClick={() => onDelete(team)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Agent avatars */}
          <div className="flex items-center gap-2">
            {team.members.length > 0 ? (
              <>
                {team.members.slice(0, 5).map((member, i) => (
                  <div
                    key={member.id}
                    className="relative"
                    style={{ marginLeft: i > 0 ? '-8px' : 0, zIndex: team.members.length - i }}
                    title={`${member.agent.name} — ${member.role}`}
                  >
                    <div className={`w-9 h-9 rounded-full ${getAgentColor(member.agent.name)} flex items-center justify-center text-white text-[10px] font-bold border-2 border-background`}>
                      {getAgentInitials(member.agent.name)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                        member.agent.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'
                      }`}
                    />
                  </div>
                ))}
                {team.members.length > 5 && (
                  <span className="text-xs text-muted-foreground ml-2">+{team.members.length - 5} more</span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No members</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {team.members.length} agent{team.members.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Active Tasks</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">{activeTasks}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Completed</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm font-semibold">{completedTasks}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Total Tasks</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold">{totalTasks}</span>
              </div>
            </div>
          </div>

          {/* Success rate bar */}
          {totalTasks > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Success Rate</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{successRate}%</span>
              </div>
              <Progress value={successRate} className="h-1.5" />
            </div>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => onAddMember(team)}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? 'Hide Details' : 'Show Team Details'}
            </Button>
          </div>

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
                  {team.members.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Team Topology
                      </span>
                      <div className="mt-3">
                        <AgentNetwork members={team.members} />
                      </div>
                    </div>
                  )}

                  {team.members.length > 0 && <Separator />}

                  {/* Member list */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Members ({team.members.length})
                    </span>
                    {team.members.length === 0 ? (
                      <div className="mt-2 text-sm text-muted-foreground text-center py-6">
                        No members yet. Click &quot;Add Member&quot; to get started.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <ScrollArea className="max-h-64">
                          {team.members.map((member) => {
                            const Icon = getAgentIcon(member.agent.name);
                            return (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-2 rounded-md bg-background border"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-7 h-7 rounded-full ${getAgentColor(member.agent.name)} flex items-center justify-center text-white shrink-0`}>
                                    {Icon ? <Icon className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium">{member.agent.name}</span>
                                    <span className="text-xs text-muted-foreground ml-1.5 capitalize">
                                      {member.role}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-xs ${ROLE_COLORS[member.role] || ROLE_COLORS.worker}`}>
                                    {member.role}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={
                                      member.agent.status === 'active'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                        : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                                    }
                                  >
                                    {member.agent.status}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    title="Remove member"
                                    onClick={() => onRemoveMember(member.id)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </ScrollArea>
                      </div>
                    )}
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
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<TeamData | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<TeamData | null>(null);
  const [addMemberTeam, setAddMemberTeam] = useState<TeamData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentsRes, tasksRes, teamsRes, statsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/tasks'),
        fetch('/api/teams'),
        fetch('/api/stats'),
      ]);

      if (!agentsRes.ok || !tasksRes.ok || !teamsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const agentsJson = await agentsRes.json();
      const tasksJson = await tasksRes.json();
      const teamsJson = await teamsRes.json();
      const statsJson = await statsRes.json();

      setAgents(agentsJson.data || []);
      setTasks(tasksJson.data || []);
      setTeams(teamsJson.data || []);
      setStats(statsJson.data || null);
    } catch (err) {
      console.error('SwarmPage fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to load swarm data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await fetch('/api/teams/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove member');
      }

      toast.success('Member removed');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  // Calculate total members across all teams
  const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0);

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
        <Button
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Create Team
        </Button>
      </motion.div>

      {/* Stats overview */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {[
            {
              label: 'Total Teams',
              value: stats?.totalTeams ?? teams.length,
              icon: Users,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Active Agents',
              value: stats?.activeAgents ?? agents.length,
              icon: Cpu,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Tasks Completed',
              value: stats?.taskDistribution?.completed ?? 0,
              icon: CheckCircle2,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: 'Success Rate',
              value: `${stats?.taskSuccessRate ?? 0}%`,
              icon: Activity,
              color: 'text-emerald-600 dark:text-emerald-400',
            },
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
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm mb-3">Failed to load swarm data</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <Loader2 className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Team cards */}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <TeamCardSkeleton key={i} />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center py-16 text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
            <Users className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium mb-1">No teams yet</h3>
          <p className="text-sm mb-4">Create your first team to start coordinating agents</p>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Create Team
          </Button>
        </motion.div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
          {teams.map((team, i) => (
            <TeamCard
              key={team.id}
              team={team}
              index={i}
              tasks={tasks}
              onEdit={(t) => setEditTeam(t)}
              onDelete={(t) => setDeleteTeam(t)}
              onAddMember={(t) => setAddMemberTeam(t)}
              onRemoveMember={handleRemoveMember}
            />
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <TeamFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        team={null}
        onSave={fetchData}
      />

      {/* Edit Team Dialog */}
      <TeamFormDialog
        open={!!editTeam}
        onOpenChange={(open) => { if (!open) setEditTeam(null); }}
        team={editTeam}
        onSave={fetchData}
      />

      {/* Delete Team Dialog */}
      <DeleteTeamDialog
        open={!!deleteTeam}
        onOpenChange={(open) => { if (!open) setDeleteTeam(null); }}
        team={deleteTeam}
        onConfirm={fetchData}
      />

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={!!addMemberTeam}
        onOpenChange={(open) => { if (!open) setAddMemberTeam(null); }}
        team={addMemberTeam}
        agents={agents}
        onConfirm={fetchData}
      />
    </div>
  );
}
