'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Wrench,
  Search,
  Terminal,
  FileText,
  PenLine,
  FolderOpen,
  SearchIcon,
  Globe,
  Telescope,
  Code2,
  Users,
  Send,
  ListChecks,
  CircleDot,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  FileOutput,
  Plug,
  Database,
  Clock,
  Zap,
  Settings,
  FileQuestion,
  Moon,
  PlaneTakeoff,
  PlaneLanding,
  GitBranch,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────

interface ToolParam {
  name: string;
  type: string;
  required?: boolean;
}

interface ToolFromAPI {
  id: string;
  name: string;
  description: string | null;
  category: string;
  inputSchema: string;
  permissionMode: string;
  isEnabled: boolean;
  createdAt: string;
}

interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  permissionMode: string;
  isEnabled: boolean;
  params: ToolParam[];
}

interface ToolCategory {
  name: string;
  icon: React.ReactNode;
  color: string;
  tools: ToolItem[];
}

// ── Category Mapping ───────────────────────────────────────────

const CATEGORY_DISPLAY: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  file: { label: 'File I/O', icon: <FolderOpen className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  search: { label: 'Search', icon: <Telescope className="w-4 h-4" />, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  agent: { label: 'Agent', icon: <Users className="w-4 h-4" />, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  task: { label: 'Task', icon: <ListChecks className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  mcp: { label: 'MCP', icon: <Plug className="w-4 h-4" />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  schedule: { label: 'Schedule', icon: <Clock className="w-4 h-4" />, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  meta: { label: 'Meta', icon: <Settings className="w-4 h-4" />, color: 'text-zinc-600 bg-zinc-50 border-zinc-200' },
  notebook: { label: 'Notebook', icon: <PenLine className="w-4 h-4" />, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  mode: { label: 'Mode', icon: <Play className="w-4 h-4" />, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  system: { label: 'System', icon: <Terminal className="w-4 h-4" />, color: 'text-zinc-600 bg-zinc-50 border-zinc-200' },
};

// ── Icon Mapping ───────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ReactNode> = {
  bash: <Terminal className="w-4 h-4" />,
  read: <FileText className="w-4 h-4" />,
  write: <PenLine className="w-4 h-4" />,
  edit: <PenLine className="w-4 h-4" />,
  glob: <FolderOpen className="w-4 h-4" />,
  grep: <SearchIcon className="w-4 h-4" />,
  websearch: <SearchIcon className="w-4 h-4" />,
  webfetch: <Globe className="w-4 h-4" />,
  lsp: <Code2 className="w-4 h-4" />,
  agent: <Users className="w-4 h-4" />,
  sendmessage: <Send className="w-4 h-4" />,
  taskcreate: <CircleDot className="w-4 h-4" />,
  taskget: <ClipboardList className="w-4 h-4" />,
  tasklist: <ListChecks className="w-4 h-4" />,
  taskupdate: <CheckCircle2 className="w-4 h-4" />,
  taskstop: <XCircle className="w-4 h-4" />,
  taskoutput: <FileOutput className="w-4 h-4" />,
  mcptool: <Plug className="w-4 h-4" />,
  listmcpresources: <Database className="w-4 h-4" />,
  readmcpresource: <Database className="w-4 h-4" />,
  croncreate: <Clock className="w-4 h-4" />,
  remotetrigger: <Zap className="w-4 h-4" />,
  skill: <Settings className="w-4 h-4" />,
  config: <Settings className="w-4 h-4" />,
  brief: <FileQuestion className="w-4 h-4" />,
  sleep: <Moon className="w-4 h-4" />,
  notebookedit: <PenLine className="w-4 h-4" />,
  enterplanmode: <PlaneTakeoff className="w-4 h-4" />,
  exitplanmode: <PlaneLanding className="w-4 h-4" />,
  worktree: <GitBranch className="w-4 h-4" />,
};

function getToolIcon(name: string): React.ReactNode {
  return TOOL_ICONS[name.toLowerCase().replace(/[^a-z]/g, '')] || <Wrench className="w-4 h-4" />;
}

// ── Permission badge styles ────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  open: 'Default',
  restricted: 'Restricted',
  sandboxed: 'Sandboxed',
};

function getPermissionBadgeClasses(permission: string) {
  switch (permission) {
    case 'open':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'restricted':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'sandboxed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-zinc-50 text-zinc-700 border-zinc-200';
  }
}

// ── Helpers ────────────────────────────────────────────────────

function parseInputSchema(schemaStr: string): ToolParam[] {
  try {
    const schema = JSON.parse(schemaStr);
    if (schema?.properties) {
      return Object.entries(schema.properties as Record<string, { type?: string }>).map(([name, prop]) => ({
        name,
        type: prop.type || 'any',
        required: Array.isArray(schema.required) && (schema.required as string[]).includes(name),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

function mapApiToolToToolItem(tool: ToolFromAPI): ToolItem {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description || 'No description available.',
    icon: getToolIcon(tool.name),
    category: tool.category,
    permissionMode: tool.permissionMode,
    isEnabled: tool.isEnabled,
    params: parseInputSchema(tool.inputSchema),
  };
}

// ── Loading Skeleton ───────────────────────────────────────────

function ToolCardSkeleton() {
  return (
    <Card className="py-4 shadow-sm" style={{ gap: 0 }}>
      <CardContent className="px-4 py-0 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <div className="flex flex-col gap-1">
              <Skeleton className="w-24 h-4 rounded" />
              <Skeleton className="w-16 h-4 rounded" />
            </div>
          </div>
          <Skeleton className="w-10 h-5 rounded-full" />
        </div>
        <Skeleton className="w-full h-3 rounded" />
        <Skeleton className="w-full h-3 rounded" />
        <div className="flex flex-wrap gap-1">
          <Skeleton className="w-16 h-5 rounded" />
          <Skeleton className="w-20 h-5 rounded" />
          <Skeleton className="w-14 h-5 rounded" />
        </div>
        <Skeleton className="w-full h-10 rounded-md" />
      </CardContent>
    </Card>
  );
}

function CategorySkeleton() {
  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-28 h-5 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ToolCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function ToolsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [tools, setTools] = useState<ToolFromAPI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Fetch tools from API
  const fetchTools = useCallback(async (category?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category && category !== 'All') {
        params.set('category', category);
      }
      const res = await fetch(`/api/tools${params.toString() ? `?${params.toString()}` : ''}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTools(json.data);
      } else {
        setError(json.error || 'Failed to load tools');
        setTools([]);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setTools([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // Category filter change: re-fetch from API
  const handleCategoryChange = (cat: string) => {
    setCategoryFilter(cat);
    fetchTools(cat === 'All' ? undefined : cat);
  };

  // Build tool categories
  const toolCategories = useMemo((): ToolCategory[] => {
    const groups: Record<string, ToolItem[]> = {};

    tools.forEach((t) => {
      const key = t.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(mapApiToolToToolItem(t));
    });

    return Object.entries(groups).map(([key, items]) => {
      const config = CATEGORY_DISPLAY[key] || CATEGORY_DISPLAY.system;
      return {
        name: config.label,
        icon: config.icon,
        color: config.color,
        tools: items,
      };
    });
  }, [tools]);

  // Client-side search filter on top of category-fetched data
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return toolCategories;
    const q = searchQuery.toLowerCase();
    return toolCategories
      .map((cat) => ({
        ...cat,
        tools: cat.tools.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.tools.length > 0);
  }, [toolCategories, searchQuery]);

  const totalTools = tools.length;
  const enabledTools = tools.filter((t) => t.isEnabled).length;

  // Available filter categories from current data
  const availableFilters = useMemo(() => {
    const cats = new Set(tools.map((t) => t.category));
    return Array.from(cats)
      .sort()
      .map((c) => ({
        key: c,
        label: CATEGORY_DISPLAY[c]?.label || c,
        count: tools.filter((t) => t.category === c).length,
      }));
  }, [tools]);

  // Toggle tool enabled state with optimistic UI
  const toggleTool = async (toolId: string, currentState: boolean) => {
    const newState = !currentState;

    // Optimistic update
    setTools((prev) =>
      prev.map((t) => (t.id === toolId ? { ...t, isEnabled: newState } : t))
    );
    setTogglingIds((prev) => new Set(prev).add(toolId));

    try {
      const res = await fetch('/api/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: toolId, isEnabled: newState }),
      });
      const json = await res.json();

      if (!json.success) {
        // Revert on failure
        setTools((prev) =>
          prev.map((t) => (t.id === toolId ? { ...t, isEnabled: currentState } : t))
        );
        toast({
          title: 'Failed to update tool',
          description: json.error || 'An error occurred while updating the tool.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: `Tool ${newState ? 'enabled' : 'disabled'}`,
          description: `${tools.find((t) => t.id === toolId)?.name || 'Tool'} has been ${newState ? 'enabled' : 'disabled'}.`,
        });
      }
    } catch {
      // Revert on network error
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? { ...t, isEnabled: currentState } : t))
      );
      toast({
        title: 'Network error',
        description: 'Could not reach the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(toolId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
            <Wrench className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tool Registry</h1>
            <p className="text-sm text-muted-foreground">
              {totalTools} Tools Available · {enabledTools} Enabled
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tools by name or description..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleCategoryChange('All')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
            categoryFilter === 'All'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-muted-foreground border-zinc-200 hover:border-zinc-300 hover:text-foreground'
          }`}
        >
          All
          <span className="text-xs opacity-70">({totalTools})</span>
        </button>
        {availableFilters.map((cat) => (
          <button
            key={cat.key}
            onClick={() => handleCategoryChange(cat.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
              categoryFilter === cat.key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-muted-foreground border-zinc-200 hover:border-zinc-300 hover:text-foreground'
            }`}
          >
            {cat.label}
            <span className="text-xs opacity-70">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="pr-4">
          {isLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <CategorySkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
              <p className="text-sm font-medium text-foreground">Unable to load tools</p>
              <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
              <button
                onClick={() => fetchTools(categoryFilter === 'All' ? undefined : categoryFilter)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Loader2 className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <>
              <Accordion
                type="multiple"
                defaultValue={toolCategories.map((c) => c.name)}
                className="flex flex-col gap-4"
              >
                {filteredCategories.map((category) => (
                  <AccordionItem
                    key={category.name}
                    value={category.name}
                    className="border rounded-xl px-0"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 rounded-t-xl">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${category.color} border`}>
                          {category.icon}
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-semibold">{category.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {category.tools.length} tool{category.tools.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {category.tools.map((tool) => {
                          const isToggling = togglingIds.has(tool.id);
                          return (
                            <Card
                              key={tool.id}
                              className="py-4 shadow-sm hover:shadow-md transition-shadow"
                              style={{ gap: 0 }}
                            >
                              <CardContent className="px-4 py-0 flex flex-col gap-3">
                                {/* Tool Header */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0 text-muted-foreground">
                                      {tool.icon}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-sm truncate">{tool.name}</div>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 mt-0.5 ${getPermissionBadgeClasses(tool.permissionMode)}`}
                                      >
                                        {PERMISSION_LABELS[tool.permissionMode] || tool.permissionMode}
                                      </Badge>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={tool.isEnabled}
                                    onCheckedChange={() => toggleTool(tool.id, tool.isEnabled)}
                                    disabled={isToggling}
                                    className="shrink-0 scale-90"
                                  />
                                </div>

                                {/* Description */}
                                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                  {tool.description}
                                </p>

                                {/* Parameters */}
                                <div>
                                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Parameters
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {tool.params.map((param) => (
                                      <span
                                        key={param.name}
                                        className="inline-flex items-center gap-1 text-[11px] bg-muted px-1.5 py-0.5 rounded"
                                      >
                                        <span className="font-mono text-foreground">{param.name}</span>
                                        <span className="text-muted-foreground">{param.type}</span>
                                        {param.required && <span className="text-rose-500">*</span>}
                                      </span>
                                    ))}
                                    {tool.params.length === 0 && (
                                      <span className="text-[11px] text-muted-foreground italic">No parameters</span>
                                    )}
                                  </div>
                                </div>

                                {/* Example */}
                                <div className="rounded-md bg-zinc-950 text-zinc-300 px-2.5 py-1.5 text-[11px] font-mono leading-relaxed overflow-x-auto">
                                  {tool.name}({tool.params.filter((p) => p.required).map((p) => `${p.name}: "${p.type}"`).join(', ') || '...'})
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {filteredCategories.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Search className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No tools found matching &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
