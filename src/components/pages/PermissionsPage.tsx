'use client';

import { useState } from 'react';
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

type PermissionMode = 'default' | 'auto' | 'plan';
type RulePermission = 'Allowed' | 'Denied' | 'Ask';

interface PathRule {
  id: string;
  pattern: string;
  permission: RulePermission;
  type: string;
}

interface DeniedCommand {
  id: string;
  command: string;
  reason: string;
}

interface Hook {
  id: string;
  event: string;
  name: string;
  status: 'running' | 'paused' | 'error';
}

// ── Mock Data ──────────────────────────────────────────────────

const PATH_RULES: PathRule[] = [
  { id: '1', pattern: '/etc/*', permission: 'Denied', type: 'System' },
  { id: '2', pattern: '~/.ssh/*', permission: 'Denied', type: 'Security' },
  { id: '3', pattern: './src/**', permission: 'Allowed', type: 'Project' },
  { id: '4', pattern: './dist/*', permission: 'Denied', type: 'Build' },
  { id: '5', pattern: '~/.config/*', permission: 'Ask', type: 'Config' },
  { id: '6', pattern: './public/**', permission: 'Allowed', type: 'Assets' },
  { id: '7', pattern: './prisma/*', permission: 'Allowed', type: 'Database' },
  { id: '8', pattern: '/tmp/*', permission: 'Ask', type: 'Temp' },
  { id: '9', pattern: './node_modules/*', permission: 'Denied', type: 'Dependencies' },
  { id: '10', pattern: '~/.env*', permission: 'Denied', type: 'Secrets' },
];

const DENIED_COMMANDS: DeniedCommand[] = [
  { id: 'd1', command: 'rm -rf /', reason: 'Destructive system command' },
  { id: 'd2', command: 'DROP TABLE *', reason: 'Destructive SQL operation' },
  { id: 'd3', command: 'sudo rm -rf', reason: 'Privilege escalation + destruction' },
  { id: 'd4', command: ':(){ :|:& };:', reason: 'Fork bomb' },
  { id: 'd5', command: 'mkfs.ext4 /dev/sda1', reason: 'Filesystem destruction' },
  { id: 'd6', command: 'dd if=/dev/zero of=/dev/sda', reason: 'Disk wipe command' },
];

const HOOKS: Hook[] = [
  { id: 'h1', event: 'PreToolUse', name: 'security-check', status: 'running' },
  { id: 'h2', event: 'PostToolUse', name: 'audit-log', status: 'running' },
  { id: 'h3', event: 'PreToolUse', name: 'rate-limit', status: 'paused' },
];

// ── Helpers ────────────────────────────────────────────────────

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

function getPermissionBadge(permission: RulePermission) {
  switch (permission) {
    case 'Allowed':
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {permission}
        </Badge>
      );
    case 'Denied':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <Ban className="w-3 h-3" />
          {permission}
        </Badge>
      );
    case 'Ask':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
          <HelpCircle className="w-3 h-3" />
          {permission}
        </Badge>
      );
  }
}

function getTypeBadge(type: string) {
  const typeColorMap: Record<string, string> = {
    System: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    Security: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    Project: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    Build: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
    Config: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    Assets: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    Database: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    Temp: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    Dependencies: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
    Secrets: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  };
  return (
    <Badge variant="outline" className={typeColorMap[type] || 'bg-muted'}>
      {type}
    </Badge>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function PermissionsPage() {
  const [selectedMode, setSelectedMode] = useState<PermissionMode>('default');
  const [newCommand, setNewCommand] = useState('');

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

      {/* Tabs for rules, commands, hooks */}
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
            </TabsTrigger>
            <TabsTrigger value="commands" className="gap-1.5">
              <Ban className="w-3.5 h-3.5" />
              Command Deny List
            </TabsTrigger>
            <TabsTrigger value="hooks" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Hooks
            </TabsTrigger>
          </TabsList>

          {/* Path Rules Tab */}
          <TabsContent value="rules">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Path Rules</CardTitle>
                    <CardDescription>
                      File system access control patterns
                    </CardDescription>
                  </div>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="w-3.5 h-3.5" />
                    Add Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-2 pr-2">
                    {/* Column headers */}
                    <div className="flex items-center gap-4 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <span className="w-44 shrink-0">Pattern</span>
                      <span className="w-28 shrink-0">Permission</span>
                      <span className="w-28 shrink-0">Type</span>
                      <span className="flex-1" />
                    </div>
                    {PATH_RULES.map((rule, i) => (
                      <motion.div
                        key={rule.id}
                        className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                      >
                        <code className="text-sm font-mono w-44 shrink-0 bg-muted px-2 py-0.5 rounded">
                          {rule.pattern}
                        </code>
                        <div className="w-28 shrink-0">
                          {getPermissionBadge(rule.permission)}
                        </div>
                        <div className="w-28 shrink-0">
                          {getTypeBadge(rule.type)}
                        </div>
                        <div className="flex-1" />
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Command Deny List Tab */}
          <TabsContent value="commands">
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
                    />
                  </div>
                  <Button variant="outline" className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Add Command
                  </Button>
                </div>

                <Separator />

                {/* Commands list */}
                <ScrollArea className="max-h-[350px]">
                  <div className="space-y-2 pr-2">
                    {DENIED_COMMANDS.map((cmd, i) => (
                      <motion.div
                        key={cmd.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 shrink-0">
                          <Ban className="w-4 h-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono font-semibold">{cmd.command}</code>
                          <p className="text-xs text-muted-foreground mt-0.5">{cmd.reason}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hooks Tab */}
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
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="w-3.5 h-3.5" />
                    Add Hook
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {HOOKS.map((hook, i) => (
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
                            : hook.status === 'paused'
                              ? 'bg-amber-500/10'
                              : 'bg-destructive/10'
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
                        <Button variant="outline" size="sm" className="gap-1.5">
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

      {/* Permission Stats */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        {[
          { label: 'Rules Active', value: '12', icon: Lock, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Blocks Today', value: '3', icon: Ban, color: 'text-destructive' },
          { label: 'Approvals Today', value: '47', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Hooks Running', value: '2/3', icon: Activity, color: 'text-amber-600 dark:text-amber-400' },
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
    </div>
  );
}
