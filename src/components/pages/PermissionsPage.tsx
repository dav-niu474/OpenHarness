'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  Zap,
  Eye,
  Plus,
  X,
  Ban,
  CheckCircle2,
  HelpCircle,
  Settings,
  AlertTriangle,
  Activity,
  GitBranch,
  Lock,
  Unlock,
  Play,
  Pause,
  Terminal,
  RefreshCw,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

type PermissionMode = 'default' | 'auto' | 'plan';
type RuleMode = 'allow' | 'deny' | 'ask';

interface PermissionRule {
  id: string;
  mode: string;
  pathPattern: string;
  isAllowed: boolean;
  commandDenyList: string;
  createdAt: string;
}

interface Hook {
  id: string;
  event: string;
  name: string;
  status: 'running' | 'paused';
}

interface DedupedCommand {
  command: string;
  ruleId: string;
  rulePattern: string;
}

// ── Helpers ────────────────────────────────────────────────────

function getPermissionBadge(mode: string, isAllowed: boolean) {
  if (mode === 'allow' && isAllowed) {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Allowed
      </Badge>
    );
  }
  if (mode === 'deny' || !isAllowed) {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
        <Ban className="w-3 h-3" />
        Denied
      </Badge>
    );
  }
  if (mode === 'ask') {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
        <HelpCircle className="w-3 h-3" />
        Ask
      </Badge>
    );
  }
  return null;
}

function getModeBadge(mode: string) {
  switch (mode) {
    case 'allow':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          allow
        </Badge>
      );
    case 'deny':
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
          deny
        </Badge>
      );
    case 'ask':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          ask
        </Badge>
      );
    default:
      return <Badge variant="outline">{mode}</Badge>;
  }
}

function parseCommandDenyList(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Permission Mode Config ────────────────────────────────────

const PERMISSION_CONFIG: {
  mode: PermissionMode;
  title: string;
  description: string;
  useCase: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}[] = [
  {
    mode: 'default',
    title: 'Default Mode',
    description: 'Ask before write/execute operations',
    useCase: 'Daily development',
    icon: ShieldCheck,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  {
    mode: 'auto',
    title: 'Auto Mode',
    description: 'Allow all operations automatically',
    useCase: 'Sandboxed environments',
    icon: Zap,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  {
    mode: 'plan',
    title: 'Plan Mode',
    description: 'Block all write operations',
    useCase: 'Large refactors, review first',
    icon: Eye,
    iconColor: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/10',
  },
];

// ── Default Hooks ──────────────────────────────────────────────

const DEFAULT_HOOKS: Hook[] = [
  { id: 'h1', event: 'PreToolUse', name: 'security-check', status: 'running' },
  { id: 'h2', event: 'PostToolUse', name: 'audit-log', status: 'running' },
  { id: 'h3', event: 'PreToolUse', name: 'rate-limit', status: 'paused' },
];

// ── Skeleton Components ────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="py-4">
          <CardContent className="p-4 flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RulesSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
              <div className="flex-1" />
              <Skeleton className="h-7 w-7" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CommandsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Separator />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-7" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Error State ────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="py-12">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-destructive/10">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <p className="font-medium">Failed to load permissions</p>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function PermissionsPage() {
  // Data state
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hooks state (in-memory)
  const [hooks, setHooks] = useState<Hook[]>(DEFAULT_HOOKS);

  // Permission mode (client-side only)
  const [selectedMode, setSelectedMode] = useState<PermissionMode>('default');

  // Dialog state
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleMode, setNewRuleMode] = useState<string>('allow');
  const [newRuleAllowed, setNewRuleAllowed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Command deny list state
  const [newCommand, setNewCommand] = useState('');
  const [selectedRuleForCommand, setSelectedRuleForCommand] = useState<string>('');
  const [isAddingCommand, setIsAddingCommand] = useState(false);

  // Fetch rules
  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/permissions');
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      const json = await res.json();
      if (json.success) {
        setRules(json.data);
      } else {
        throw new Error(json.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permission rules');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Create rule
  const handleAddRule = async () => {
    if (!newRulePattern.trim()) {
      toast.error('Path pattern is required');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathPattern: newRulePattern.trim(),
          mode: newRuleMode,
          isAllowed: newRuleAllowed,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => [...prev, json.data]);
        setAddRuleOpen(false);
        setNewRulePattern('');
        setNewRuleMode('allow');
        setNewRuleAllowed(true);
        toast.success('Permission rule created');
      } else {
        toast.error(json.error || 'Failed to create rule');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete rule
  const handleDeleteRule = async (id: string) => {
    try {
      const res = await fetch('/api/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => prev.filter((r) => r.id !== id));
        toast.success('Rule deleted');
      } else {
        toast.error(json.error || 'Failed to delete rule');
      }
    } catch {
      toast.error('Network error');
    }
  };

  // Add command to a rule's deny list
  const handleAddCommand = async () => {
    if (!newCommand.trim()) {
      toast.error('Command is required');
      return;
    }
    if (!selectedRuleForCommand) {
      toast.error('Select a rule first');
      return;
    }
    setIsAddingCommand(true);
    try {
      const rule = rules.find((r) => r.id === selectedRuleForCommand);
      if (!rule) {
        toast.error('Rule not found');
        return;
      }
      const currentList = parseCommandDenyList(rule.commandDenyList);
      if (currentList.includes(newCommand.trim())) {
        toast.error('Command already exists in this rule');
        return;
      }
      const updatedList = [...currentList, newCommand.trim()];
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          commandDenyList: updatedList,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? json.data : r)));
        setNewCommand('');
        toast.success('Command added to deny list');
      } else {
        toast.error(json.error || 'Failed to add command');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsAddingCommand(false);
    }
  };

  // Remove command from a rule's deny list
  const handleRemoveCommand = async (ruleId: string, command: string) => {
    try {
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) return;
      const currentList = parseCommandDenyList(rule.commandDenyList);
      const updatedList = currentList.filter((c) => c !== command);
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ruleId,
          commandDenyList: updatedList,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRules((prev) => prev.map((r) => (r.id === ruleId ? json.data : r)));
        toast.success('Command removed');
      } else {
        toast.error(json.error || 'Failed to remove command');
      }
    } catch {
      toast.error('Network error');
    }
  };

  // Toggle hook status
  const handleToggleHook = (hookId: string) => {
    setHooks((prev) =>
      prev.map((h) =>
        h.id === hookId
          ? { ...h, status: h.status === 'running' ? 'paused' : 'running' }
          : h
      )
    );
  };

  // Derived data: deduplicated commands across all rules
  const dedupedCommands: DedupedCommand[] = rules.flatMap((rule) => {
    const commands = parseCommandDenyList(rule.commandDenyList);
    return commands.map((cmd) => ({
      command: cmd,
      ruleId: rule.id,
      rulePattern: rule.pathPattern,
    }));
  });

  // Stats
  const totalRules = rules.length;
  const deniedPatterns = rules.filter((r) => !r.isAllowed).length;
  const allowedPatterns = rules.filter((r) => r.isAllowed).length;
  const askPatterns = rules.filter((r) => r.mode === 'ask').length;
  const runningHooks = hooks.filter((h) => h.status === 'running').length;

  // ── Render ───────────────────────────────────────────────────

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
            <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Permissions & Governance</h1>
            <p className="text-sm text-muted-foreground">
              Safety controls, access policies, and execution governance
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchRules}
          disabled={isLoading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Permission Mode Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Permission Mode</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PERMISSION_CONFIG.map((config) => {
            const Icon = config.icon;
            const isSelected = selectedMode === config.mode;
            return (
              <motion.div
                key={config.mode}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Card
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'hover:border-border'
                  }`}
                  onClick={() => setSelectedMode(config.mode)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${config.bgColor} shrink-0`}>
                        <Icon className={`w-5 h-5 ${config.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{config.title}</span>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 300 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </motion.div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {config.description}
                        </p>
                        <Badge variant="secondary" className="mt-2 text-[10px] font-normal">
                          {config.useCase}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Error State */}
      {error && !isLoading && (
        <ErrorState message={error} onRetry={fetchRules} />
      )}

      {/* Tabs */}
      {!error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Tabs defaultValue="rules" className="space-y-4">
            <TabsList>
              <TabsTrigger value="rules" className="gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                Path Rules
                {totalRules > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {totalRules}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="commands" className="gap-1.5">
                <Ban className="w-3.5 h-3.5" />
                Command Deny List
                {dedupedCommands.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {dedupedCommands.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="hooks" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                Hooks
                {runningHooks > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {runningHooks}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Path Rules Tab ── */}
            <TabsContent value="rules">
              {isLoading ? (
                <RulesSkeleton />
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Path Rules</CardTitle>
                        <CardDescription>
                          File system access control patterns
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setAddRuleOpen(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Rule
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {rules.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <FolderOpen className="w-10 h-10" />
                        <p className="text-sm">No permission rules yet</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setAddRuleOpen(true)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create first rule
                        </Button>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[400px]">
                        <div className="space-y-2 pr-2">
                          {/* Column headers */}
                          <div className="flex items-center gap-4 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="w-48 shrink-0">Pattern</span>
                            <span className="w-24 shrink-0">Permission</span>
                            <span className="w-20 shrink-0">Mode</span>
                            <span className="w-16 shrink-0 text-center">Commands</span>
                            <span className="flex-1" />
                          </div>
                          {rules.map((rule, i) => {
                            const cmdCount = parseCommandDenyList(rule.commandDenyList).length;
                            return (
                              <motion.div
                                key={rule.id}
                                className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                              >
                                <code className="text-sm font-mono w-48 shrink-0 bg-muted px-2 py-0.5 rounded truncate">
                                  {rule.pathPattern}
                                </code>
                                <div className="w-24 shrink-0">
                                  {getPermissionBadge(rule.mode, rule.isAllowed)}
                                </div>
                                <div className="w-20 shrink-0">
                                  {getModeBadge(rule.mode)}
                                </div>
                                <div className="w-16 shrink-0 text-center">
                                  {cmdCount > 0 ? (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {cmdCount} cmd
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                                <div className="flex-1" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={() => handleDeleteRule(rule.id)}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </motion.div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Command Deny List Tab ── */}
            <TabsContent value="commands">
              {isLoading ? (
                <CommandsSkeleton />
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <div>
                      <CardTitle className="text-base">Command Deny List</CardTitle>
                      <CardDescription>
                        Dangerous commands that are automatically blocked
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Add command input */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Terminal className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Add a command to block..."
                          className="pl-8 font-mono text-sm"
                          value={newCommand}
                          onChange={(e) => setNewCommand(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddCommand();
                          }}
                        />
                      </div>
                      <Select value={selectedRuleForCommand} onValueChange={setSelectedRuleForCommand}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select rule..." />
                        </SelectTrigger>
                        <SelectContent>
                          {rules.map((rule) => (
                            <SelectItem key={rule.id} value={rule.id}>
                              <code className="text-xs">{rule.pathPattern}</code>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={handleAddCommand}
                        disabled={isAddingCommand}
                      >
                        {isAddingCommand ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Add
                      </Button>
                    </div>

                    <Separator />

                    {/* Commands list */}
                    {dedupedCommands.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <Terminal className="w-10 h-10" />
                        <p className="text-sm">No denied commands configured</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[350px]">
                        <div className="space-y-2 pr-2">
                          {dedupedCommands.map((item, i) => (
                            <motion.div
                              key={`${item.ruleId}-${item.command}`}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: i * 0.03 }}
                            >
                              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 shrink-0">
                                <Ban className="w-4 h-4 text-destructive" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <code className="text-sm font-mono font-semibold">{item.command}</code>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Rule: <code className="text-xs">{item.rulePattern}</code>
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => handleRemoveCommand(item.ruleId, item.command)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </motion.div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Hooks Tab ── */}
            <TabsContent value="hooks">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Hook Configuration</CardTitle>
                      <CardDescription>
                        Event-driven hooks for governance automation
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {hooks.map((hook, i) => (
                      <motion.div
                        key={hook.id}
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.1 }}
                      >
                        <div
                          className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                            hook.status === 'running'
                              ? 'bg-emerald-500/10'
                              : 'bg-amber-500/10'
                          }`}
                        >
                          {hook.status === 'running' ? (
                            <Play className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Pause className="w-5 h-5 text-amber-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{hook.name}</span>
                            <Badge
                              variant="outline"
                              className={
                                hook.status === 'running'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              }
                            >
                              {hook.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Trigger: {hook.event}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => handleToggleHook(hook.id)}
                          >
                            {hook.status === 'running' ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                Resume
                              </>
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      )}

      {/* Permission Stats */}
      {isLoading ? (
        <StatsSkeleton />
      ) : (
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {[
            { label: 'Rules Active', value: String(totalRules), icon: Lock, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Denied Patterns', value: String(deniedPatterns), icon: Ban, color: 'text-destructive' },
            { label: 'Allowed Patterns', value: String(allowedPatterns), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Ask Patterns', value: String(askPatterns), icon: HelpCircle, color: 'text-amber-600 dark:text-amber-400' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="py-4">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
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

      {/* ── Add Rule Dialog ── */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Permission Rule</DialogTitle>
            <DialogDescription>
              Create a new path-based access control rule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pathPattern">Path Pattern *</Label>
              <Input
                id="pathPattern"
                placeholder="/src/** or ~/.env*"
                className="font-mono"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRule();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Use glob patterns (e.g., /src/**, *.log, ~/.env*)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mode">Mode</Label>
              <Select value={newRuleMode} onValueChange={setNewRuleMode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Allow
                    </div>
                  </SelectItem>
                  <SelectItem value="deny">
                    <div className="flex items-center gap-2">
                      <Ban className="w-3.5 h-3.5 text-red-500" />
                      Deny
                    </div>
                  </SelectItem>
                  <SelectItem value="ask">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                      Ask
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allowed</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle to explicitly allow or deny access
                </p>
              </div>
              <Switch checked={newRuleAllowed} onCheckedChange={setNewRuleAllowed} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRuleOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleAddRule}
              disabled={isSubmitting || !newRulePattern.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Rule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
