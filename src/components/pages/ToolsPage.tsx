'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// ── Types ──────────────────────────────────────────────────────

interface ToolParam {
  name: string;
  type: string;
  required?: boolean;
}

interface ToolItem {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  icon: React.ReactNode;
  category: string;
  permission: 'Default' | 'Auto' | 'Plan' | 'Sandbox';
  enabled: boolean;
  params: ToolParam[];
  example: string;
}

interface ToolCategory {
  name: string;
  icon: React.ReactNode;
  color: string;
  tools: ToolItem[];
}

type CategoryFilter = 'All' | 'File I/O' | 'Search' | 'Agent' | 'Task' | 'MCP' | 'Schedule' | 'Meta' | 'Notebook' | 'Mode';

// ── Mock Data ──────────────────────────────────────────────────

const toolCategories: ToolCategory[] = [
  {
    name: 'File I/O',
    icon: <FolderOpen className="w-4 h-4" />,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    tools: [
      {
        id: 'bash',
        name: 'Bash',
        description: 'Execute shell commands in a persistent session',
        fullDescription: 'Runs bash commands in a persistent shell session with optional timeout. Supports command chaining, piping, and environment variable access. Returns stdout, stderr, and exit codes.',
        icon: <Terminal className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'command', type: 'string', required: true },
          { name: 'description', type: 'string' },
          { name: 'timeout', type: 'number' },
        ],
        example: 'Bash({ command: "ls -la /workspace" })',
      },
      {
        id: 'read',
        name: 'Read',
        description: 'Read file contents from the local filesystem',
        fullDescription: 'Reads text files from the local filesystem. Supports line offset and limit for large files. Returns content with line numbers for easy reference.',
        icon: <FileText className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'filepath', type: 'string', required: true },
          { name: 'offset', type: 'number' },
          { name: 'limit', type: 'number' },
        ],
        example: 'Read({ filepath: "/src/app.ts", limit: 100 })',
      },
      {
        id: 'write',
        name: 'Write',
        description: 'Write or create files on the filesystem',
        fullDescription: 'Creates new files or overwrites existing ones. Supports full text content. Use for creating configuration files, source code, or any text-based output.',
        icon: <PenLine className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'filepath', type: 'string', required: true },
          { name: 'content', type: 'string', required: true },
        ],
        example: 'Write({ filepath: "/config.json", content: "{...}" })',
      },
      {
        id: 'edit',
        name: 'Edit',
        description: 'Find and replace text within existing files',
        fullDescription: 'Performs exact string replacements in files. Supports unique match requirement to prevent accidental edits. Can replace all occurrences or just the first match.',
        icon: <PenLine className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'filepath', type: 'string', required: true },
          { name: 'old_string', type: 'string', required: true },
          { name: 'new_string', type: 'string', required: true },
          { name: 'replace_all', type: 'boolean' },
        ],
        example: 'Edit({ filepath: "/app.ts", old_string: "old", new_string: "new" })',
      },
      {
        id: 'glob',
        name: 'Glob',
        description: 'Find files by name patterns (glob syntax)',
        fullDescription: 'Fast file pattern matching using glob syntax. Supports patterns like "**/*.ts" or "src/**/*.tsx". Returns matching file paths sorted by modification time.',
        icon: <FolderOpen className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'pattern', type: 'string', required: true },
          { name: 'path', type: 'string' },
        ],
        example: 'Glob({ pattern: "**/*.test.ts" })',
      },
      {
        id: 'grep',
        name: 'Grep',
        description: 'Search file contents with regex patterns',
        fullDescription: 'Powerful search tool built on ripgrep. Supports full regex syntax, case-insensitive search, file type filtering, and multiple output modes including content, files, and count.',
        icon: <SearchIcon className="w-4 h-4" />,
        category: 'File I/O',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'pattern', type: 'string', required: true },
          { name: 'path', type: 'string' },
          { name: 'glob', type: 'string' },
          { name: 'output_mode', type: 'string' },
        ],
        example: 'Grep({ pattern: "TODO:", output_mode: "content" })',
      },
    ],
  },
  {
    name: 'Search',
    icon: <Telescope className="w-4 h-4" />,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    tools: [
      {
        id: 'web-fetch',
        name: 'WebFetch',
        description: 'Fetch and extract content from web pages',
        fullDescription: 'Retrieves web page content with automatic content extraction. Returns title, main text content, and metadata. Handles HTML parsing and cleans up boilerplate content.',
        icon: <Globe className="w-4 h-4" />,
        category: 'Search',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'url', type: 'string', required: true },
          { name: 'selector', type: 'string' },
        ],
        example: 'WebFetch({ url: "https://example.com/docs" })',
      },
      {
        id: 'web-search',
        name: 'WebSearch',
        description: 'Search the web for real-time information',
        fullDescription: 'Performs web searches returning structured results with URLs, titles, snippets, hostnames, and rankings. Useful for finding up-to-date information beyond the training data cutoff.',
        icon: <SearchIcon className="w-4 h-4" />,
        category: 'Search',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'query', type: 'string', required: true },
          { name: 'num', type: 'number' },
        ],
        example: 'WebSearch({ query: "Next.js 15 features", num: 10 })',
      },
      {
        id: 'tool-search',
        name: 'ToolSearch',
        description: 'Search and discover available tools by capability',
        fullDescription: 'Searches the tool registry to discover tools based on capability descriptions. Returns matching tools with their parameters and usage examples. Useful for finding the right tool for a task.',
        icon: <SearchIcon className="w-4 h-4" />,
        category: 'Search',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'query', type: 'string', required: true },
          { name: 'category', type: 'string' },
        ],
        example: 'ToolSearch({ query: "file manipulation" })',
      },
      {
        id: 'lsp',
        name: 'LSP',
        description: 'Language Server Protocol for code intelligence',
        fullDescription: 'Provides code intelligence features through the Language Server Protocol. Includes go-to-definition, find-references, hover-info, diagnostics, and code actions for supported languages.',
        icon: <Code2 className="w-4 h-4" />,
        category: 'Search',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'action', type: 'string', required: true },
          { name: 'filepath', type: 'string', required: true },
          { name: 'position', type: 'object' },
        ],
        example: 'LSP({ action: "definition", filepath: "/app.ts", position: { line: 10, col: 5 } })',
      },
    ],
  },
  {
    name: 'Agent',
    icon: <Users className="w-4 h-4" />,
    color: 'text-violet-600 bg-violet-50 border-violet-200',
    tools: [
      {
        id: 'agent',
        name: 'Agent',
        description: 'Spawn and manage sub-agents for task delegation',
        fullDescription: 'Creates and manages sub-agents that can work on specific tasks independently. Supports assigning tools, setting permissions, and collecting results from agent execution.',
        icon: <Users className="w-4 h-4" />,
        category: 'Agent',
        permission: 'Plan',
        enabled: true,
        params: [
          { name: 'task', type: 'string', required: true },
          { name: 'tools', type: 'string[]' },
          { name: 'model', type: 'string' },
        ],
        example: 'Agent({ task: "Refactor auth module", tools: ["Read", "Edit"] })',
      },
      {
        id: 'send-message',
        name: 'SendMessage',
        description: 'Send messages between agents in a team',
        fullDescription: 'Enables inter-agent communication by sending structured messages between team members. Supports message routing, priority levels, and context threading.',
        icon: <Send className="w-4 h-4" />,
        category: 'Agent',
        permission: 'Plan',
        enabled: true,
        params: [
          { name: 'target', type: 'string', required: true },
          { name: 'content', type: 'string', required: true },
          { name: 'priority', type: 'string' },
        ],
        example: 'SendMessage({ target: "reviewer", content: "PR ready" })',
      },
      {
        id: 'team-create',
        name: 'TeamCreate',
        description: 'Create multi-agent teams for complex workflows',
        fullDescription: 'Sets up coordinated teams of agents with defined roles and communication channels. Supports leader/worker architectures, peer-to-peer collaboration, and hierarchical team structures.',
        icon: <Users className="w-4 h-4" />,
        category: 'Agent',
        permission: 'Plan',
        enabled: true,
        params: [
          { name: 'name', type: 'string', required: true },
          { name: 'roles', type: 'object[]', required: true },
          { name: 'config', type: 'object' },
        ],
        example: 'TeamCreate({ name: "dev-team", roles: [{ role: "leader" }] })',
      },
    ],
  },
  {
    name: 'Task',
    icon: <ListChecks className="w-4 h-4" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    tools: [
      {
        id: 'task-create',
        name: 'TaskCreate',
        description: 'Create a new background task for async execution',
        fullDescription: 'Creates a new asynchronous task with a title, description, and optional priority. Tasks run independently and can be monitored for completion. Returns a task ID for tracking.',
        icon: <CircleDot className="w-4 h-4" />,
        category: 'Task',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'title', type: 'string', required: true },
          { name: 'description', type: 'string' },
          { name: 'priority', type: 'string' },
        ],
        example: 'TaskCreate({ title: "Run tests", priority: "high" })',
      },
      {
        id: 'task-get',
        name: 'TaskGet',
        description: 'Get details and status of a specific task',
        fullDescription: 'Retrieves the full details of a task including its current status, progress, results, and any error messages. Essential for monitoring background task execution.',
        icon: <ClipboardList className="w-4 h-4" />,
        category: 'Task',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'taskId', type: 'string', required: true },
        ],
        example: 'TaskGet({ taskId: "task_abc123" })',
      },
      {
        id: 'task-list',
        name: 'TaskList',
        description: 'List all tasks with optional status filtering',
        fullDescription: 'Returns a paginated list of all tasks. Supports filtering by status, priority, and agent assignment. Results are sorted by creation date by default.',
        icon: <ListChecks className="w-4 h-4" />,
        category: 'Task',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'status', type: 'string' },
          { name: 'limit', type: 'number' },
          { name: 'offset', type: 'number' },
        ],
        example: 'TaskList({ status: "in_progress", limit: 20 })',
      },
      {
        id: 'task-update',
        name: 'TaskUpdate',
        description: 'Update task properties, status, or progress',
        fullDescription: 'Updates properties of an existing task including status transitions, progress percentage, and result data. Validates status transition rules before applying changes.',
        icon: <CheckCircle2 className="w-4 h-4" />,
        category: 'Task',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'taskId', type: 'string', required: true },
          { name: 'status', type: 'string' },
          { name: 'progress', type: 'number' },
          { name: 'result', type: 'object' },
        ],
        example: 'TaskUpdate({ taskId: "task_abc123", status: "completed" })',
      },
      {
        id: 'task-stop',
        name: 'TaskStop',
        description: 'Cancel or stop a running task immediately',
        fullDescription: 'Sends a stop signal to a running or pending task. The task will attempt graceful shutdown. Returns confirmation and final state of the task.',
        icon: <XCircle className="w-4 h-4" />,
        category: 'Task',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'taskId', type: 'string', required: true },
        ],
        example: 'TaskStop({ taskId: "task_abc123" })',
      },
      {
        id: 'task-output',
        name: 'TaskOutput',
        description: 'Retrieve output and logs from a completed task',
        fullDescription: 'Fetches the output, logs, and artifacts produced by a task. Supports fetching partial output for long-running tasks. Returns structured output data.',
        icon: <FileOutput className="w-4 h-4" />,
        category: 'Task',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'taskId', type: 'string', required: true },
          { name: 'format', type: 'string' },
        ],
        example: 'TaskOutput({ taskId: "task_abc123", format: "text" })',
      },
    ],
  },
  {
    name: 'MCP',
    icon: <Plug className="w-4 h-4" />,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    tools: [
      {
        id: 'mcp-tool',
        name: 'MCPTool',
        description: 'Execute tools from Model Context Protocol servers',
        fullDescription: 'Invokes tools provided by connected MCP (Model Context Protocol) servers. Dynamically discovers available tools and adapts to their input schemas. Supports streaming responses.',
        icon: <Plug className="w-4 h-4" />,
        category: 'MCP',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'server', type: 'string', required: true },
          { name: 'tool', type: 'string', required: true },
          { name: 'arguments', type: 'object' },
        ],
        example: 'MCPTool({ server: "filesystem", tool: "read", arguments: { path: "/file" } })',
      },
      {
        id: 'list-mcp-resources',
        name: 'ListMcpResources',
        description: 'List available resources from MCP servers',
        fullDescription: 'Enumerates all available resources from connected MCP servers. Returns resource URIs, names, descriptions, and MIME types. Useful for discovering what data sources are available.',
        icon: <Database className="w-4 h-4" />,
        category: 'MCP',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'server', type: 'string' },
          { name: 'cursor', type: 'string' },
        ],
        example: 'ListMcpResources({ server: "github" })',
      },
      {
        id: 'read-mcp-resource',
        name: 'ReadMcpResource',
        description: 'Read specific resource content from MCP servers',
        fullDescription: 'Reads the content of a specific resource from an MCP server. Returns the resource data along with its MIME type. Supports text and binary resource types.',
        icon: <Database className="w-4 h-4" />,
        category: 'MCP',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'uri', type: 'string', required: true },
        ],
        example: 'ReadMcpResource({ uri: "github://repo/issue/42" })',
      },
    ],
  },
  {
    name: 'Schedule',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    tools: [
      {
        id: 'cron-create',
        name: 'CronCreate',
        description: 'Create scheduled cron jobs for recurring tasks',
        fullDescription: 'Creates cron-based scheduled tasks that execute at specified intervals. Supports standard cron expression syntax. Jobs persist across sessions and can be managed independently.',
        icon: <Clock className="w-4 h-4" />,
        category: 'Schedule',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'schedule', type: 'string', required: true },
          { name: 'task', type: 'string', required: true },
          { name: 'name', type: 'string' },
        ],
        example: 'CronCreate({ schedule: "0 9 * * Mon", task: "weekly-report", name: "Weekly Report" })',
      },
      {
        id: 'remote-trigger',
        name: 'RemoteTrigger',
        description: 'Trigger remote webhooks and external actions',
        fullDescription: 'Sends HTTP requests to external webhook endpoints to trigger remote actions. Supports custom headers, payload bodies, and retry logic. Returns the response status and body.',
        icon: <Zap className="w-4 h-4" />,
        category: 'Schedule',
        permission: 'Sandbox',
        enabled: true,
        params: [
          { name: 'url', type: 'string', required: true },
          { name: 'method', type: 'string' },
          { name: 'body', type: 'object' },
          { name: 'headers', type: 'object' },
        ],
        example: 'RemoteTrigger({ url: "https://hooks.example.com/deploy", method: "POST" })',
      },
    ],
  },
  {
    name: 'Meta',
    icon: <Settings className="w-4 h-4" />,
    color: 'text-zinc-600 bg-zinc-50 border-zinc-200',
    tools: [
      {
        id: 'skill',
        name: 'Skill',
        description: 'Load and manage agent skill modules',
        fullDescription: 'Loads, lists, or manages skill modules that extend agent capabilities. Skills provide domain-specific knowledge and workflow templates. Can load from local or remote sources.',
        icon: <Settings className="w-4 h-4" />,
        category: 'Meta',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'action', type: 'string', required: true },
          { name: 'name', type: 'string' },
        ],
        example: 'Skill({ action: "load", name: "code-review" })',
      },
      {
        id: 'config',
        name: 'Config',
        description: 'Read and modify agent configuration settings',
        fullDescription: 'Accesses and modifies agent configuration including model parameters, system prompts, tool permissions, and environment variables. Changes take effect immediately.',
        icon: <Settings className="w-4 h-4" />,
        category: 'Meta',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'key', type: 'string', required: true },
          { name: 'value', type: 'string' },
        ],
        example: 'Config({ key: "model.temperature", value: "0.7" })',
      },
      {
        id: 'brief',
        name: 'Brief',
        description: 'Generate a concise briefing of current context',
        fullDescription: 'Analyzes the current conversation context, recent actions, and open tasks to generate a concise status briefing. Useful for context summarization and handoff between sessions.',
        icon: <FileQuestion className="w-4 h-4" />,
        category: 'Meta',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'format', type: 'string' },
          { name: 'include', type: 'string[]' },
        ],
        example: 'Brief({ format: "markdown", include: ["tasks", "files"] })',
      },
      {
        id: 'sleep',
        name: 'Sleep',
        description: 'Pause execution for a specified duration',
        fullDescription: 'Pauses agent execution for a specified number of milliseconds. Useful for waiting on async operations, rate limiting, or pacing long-running workflows.',
        icon: <Moon className="w-4 h-4" />,
        category: 'Meta',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'duration', type: 'number', required: true },
        ],
        example: 'Sleep({ duration: 5000 })',
      },
    ],
  },
  {
    name: 'Notebook',
    icon: <PenLine className="w-4 h-4" />,
    color: 'text-pink-600 bg-pink-50 border-pink-200',
    tools: [
      {
        id: 'notebook-edit',
        name: 'NotebookEdit',
        description: 'Edit Jupyter notebook cells and metadata',
        fullDescription: 'Edits Jupyter notebook (.ipynb) files by modifying cell contents, adding/removing cells, and updating metadata. Supports code, markdown, and raw cell types. Preserves execution counts and outputs.',
        icon: <PenLine className="w-4 h-4" />,
        category: 'Notebook',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'filepath', type: 'string', required: true },
          { name: 'cellIndex', type: 'number', required: true },
          { name: 'content', type: 'string', required: true },
          { name: 'cellType', type: 'string' },
        ],
        example: 'NotebookEdit({ filepath: "/analysis.ipynb", cellIndex: 2, content: "print(42)" })',
      },
    ],
  },
  {
    name: 'Mode',
    icon: <Play className="w-4 h-4" />,
    color: 'text-teal-600 bg-teal-50 border-teal-200',
    tools: [
      {
        id: 'enter-plan-mode',
        name: 'EnterPlanMode',
        description: 'Switch to planning mode for task design',
        fullDescription: 'Transitions the agent into planning mode where it focuses on analyzing requirements, designing solutions, and creating implementation plans without executing changes. Useful for complex tasks requiring careful thought.',
        icon: <PlaneTakeoff className="w-4 h-4" />,
        category: 'Mode',
        permission: 'Auto',
        enabled: true,
        params: [
          { name: 'reason', type: 'string' },
        ],
        example: 'EnterPlanMode({ reason: "Need to design architecture first" })',
      },
      {
        id: 'exit-plan-mode',
        name: 'ExitPlanMode',
        description: 'Exit planning mode and resume execution',
        fullDescription: 'Transitions the agent out of planning mode back to normal execution mode. The plan is preserved for reference during implementation. Clears the planning context.',
        icon: <PlaneLanding className="w-4 h-4" />,
        category: 'Mode',
        permission: 'Auto',
        enabled: true,
        params: [],
        example: 'ExitPlanMode()',
      },
      {
        id: 'worktree',
        name: 'Worktree',
        description: 'Manage git worktrees for parallel development',
        fullDescription: 'Creates and manages git worktrees to enable parallel development on multiple branches simultaneously. Supports creating, listing, and removing worktrees. Useful for multi-task workflows.',
        icon: <GitBranch className="w-4 h-4" />,
        category: 'Mode',
        permission: 'Default',
        enabled: true,
        params: [
          { name: 'action', type: 'string', required: true },
          { name: 'branch', type: 'string' },
          { name: 'path', type: 'string' },
        ],
        example: 'Worktree({ action: "create", branch: "feature/auth" })',
      },
    ],
  },
];

const categoryFilters: CategoryFilter[] = [
  'All',
  'File I/O',
  'Search',
  'Agent',
  'Task',
  'MCP',
  'Schedule',
  'Meta',
  'Notebook',
  'Mode',
];

// ── Permission badge styles ────────────────────────────────────

function getPermissionBadgeClasses(permission: string) {
  switch (permission) {
    case 'Default':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Auto':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Plan':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Sandbox':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-zinc-50 text-zinc-700 border-zinc-200';
  }
}

// ── Component ──────────────────────────────────────────────────

export default function ToolsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [toolStates, setToolStates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    toolCategories.forEach((cat) =>
      cat.tools.forEach((t) => {
        initial[t.id] = t.enabled;
      })
    );
    return initial;
  });

  const filteredCategories = useMemo(() => {
    return toolCategories
      .filter((cat) => categoryFilter === 'All' || cat.name === categoryFilter)
      .map((cat) => ({
        ...cat,
        tools: cat.tools.filter(
          (t) =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter((cat) => cat.tools.length > 0);
  }, [searchQuery, categoryFilter]);

  const totalTools = toolCategories.reduce((sum, cat) => sum + cat.tools.length, 0);
  const enabledTools = Object.values(toolStates).filter(Boolean).length;

  const toggleTool = (toolId: string) => {
    setToolStates((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
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
        {categoryFilters.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
              categoryFilter === cat
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-muted-foreground border-zinc-200 hover:border-zinc-300 hover:text-foreground'
            }`}
          >
            {cat}
            {cat !== 'All' && (
              <span className="text-xs opacity-70">
                ({toolCategories.find((c) => c.name === cat)?.tools.length ?? 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tool Categories Accordion */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="pr-4">
          <Accordion type="multiple" defaultValue={toolCategories.map((c) => c.name)} className="flex flex-col gap-4">
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
                    {category.tools.map((tool) => (
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
                                  className={`text-[10px] px-1.5 py-0 mt-0.5 ${getPermissionBadgeClasses(tool.permission)}`}
                                >
                                  {tool.permission}
                                </Badge>
                              </div>
                            </div>
                            <Switch
                              checked={toolStates[tool.id]}
                              onCheckedChange={() => toggleTool(tool.id)}
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
                            {tool.example}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
        </div>
      </ScrollArea>
    </div>
  );
}
