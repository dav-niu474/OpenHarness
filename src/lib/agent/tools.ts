// =============================================================================
// OpenHarness Agent — Tool System (Phase 1: buildTool Factory + Enhanced Descriptions)
// =============================================================================
// Schema-driven tool registry with Fail-Closed defaults.
// Each tool includes whenToUse/whenNotToUse guidance for better LLM decision-making.
// =============================================================================

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';
import type { AgentTool, ToolResult, ToolContext } from './types';
import { saveMemory, searchMemory, listMemory, deleteMemory } from './memory';

// ── buildTool Factory ───────────────────────────────────────────────

/**
 * buildTool — Factory function that creates a tool definition with fail-closed defaults.
 * Based on Claude Code's pattern: new tools default to unsafe, require explicit safety declaration.
 */
export function buildTool(def: Omit<AgentTool, 'isReadOnly' | 'isDestructive' | 'isConcurrencySafe' | 'permissionMode'> & Partial<Pick<AgentTool, 'isReadOnly' | 'isDestructive' | 'isConcurrencySafe' | 'permissionMode'>>): AgentTool {
  return {
    isReadOnly: false,
    isDestructive: true,
    isConcurrencySafe: false,
    permissionMode: 'restricted',
    ...def,
  };
}

// ── Tool Registry ───────────────────────────────────────────────────

/** All registered tools with schema-driven definitions */
const TOOL_REGISTRY: AgentTool[] = [
  // ━━━ Search Tools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'WebSearch',
    description: 'Search the web for real-time information, news, and facts. Returns ranked results with titles, URLs, and snippets.',
    whenToUse: [
      'Need latest information or real-time data (news, prices, weather, events)',
      'User explicitly asks to search or look something up online',
      'Answer requires citing sources or verifying current facts',
      'Need to verify if a fact, statistic, or claim is still accurate',
      'Researching a topic that may have recent developments',
    ],
    whenNotToUse: [
      'The answer can be found in the existing conversation context',
      'Pure mathematical calculation or logical reasoning',
      'Creative writing, brainstorming, or opinion-based questions',
      'The user is asking about your capabilities or general knowledge',
    ],
    examples: [
      { query: 'Next.js 16 new features 2025' },
      { query: 'TypeScript 5.8 release notes', recency_days: 30 },
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query — be specific and use relevant keywords' },
        count: { type: 'number', description: 'Max results (1-20, default 8)', default: 8 },
        recency_days: { type: 'number', description: 'Only return results from the last N days (e.g. 7 for past week)' },
      },
      required: ['query'],
    },
  }),

  buildTool({
    name: 'WebFetch',
    description: 'Fetch and extract text content from a URL. Returns page title and extracted text (up to 3000 chars).',
    whenToUse: [
      'User provides a URL and asks you to read or summarize the page',
      'Need to get detailed content from a search result link',
      'Reading documentation, blog posts, or articles from the web',
      'Extracting information from a specific web page',
    ],
    whenNotToUse: [
      'User just wants a brief overview — use WebSearch instead',
      'The URL is a file download (PDF, image, video)',
      'You need structured data from an API endpoint',
    ],
    examples: [
      { url: 'https://docs.example.com/getting-started' },
      { url: 'https://blog.example.com/ai-trends-2025' },
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from' },
      },
      required: ['url'],
    },
  }),

  // ━━━ Task Planning ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'TaskPlan',
    description: 'Create a structured task plan with numbered steps. Essential for complex multi-step tasks — always plan before executing.',
    whenToUse: [
      'The user request involves 3 or more steps',
      'Task requires multiple tools or tool combinations',
      'User asks you to "plan", "outline", or "break down" a task',
      'Complex coding task with multiple files or components to modify',
      'Research task requiring multiple searches before synthesis',
    ],
    whenNotToUse: [
      'Simple factual question that can be answered directly',
      'Single-step task (one search, one calculation, etc.)',
      'Greeting or casual conversation',
    ],
    examples: [
      { title: 'Research AI Frameworks', steps: ['Search for top AI frameworks 2025', 'Compare features and performance', 'Summarize findings with recommendations'], complexity: 'moderate' },
      { title: 'Debug API Error', steps: ['Search for common causes of 500 errors', 'Check recent code changes', 'Propose fix with code example'], complexity: 'complex' },
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Brief title of the overall task' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Ordered list of steps to execute' },
        complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'], description: 'Estimated complexity' },
      },
      required: ['title', 'steps'],
    },
  }),

  // ━━━ Task Management (DB-backed) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'TaskCreate',
    description: 'Create a trackable task in the database. Use for items that need persistence beyond the current conversation.',
    whenToUse: [
      'User asks to create a to-do item, reminder, or action item',
      'You identify a follow-up action during task execution',
      'Need to track progress on a multi-step project',
      'User says "remember this" or "add this to my tasks"',
    ],
    whenNotToUse: [
      'Just listing steps in the current conversation — use TaskPlan instead',
      'Temporary planning that does not need to persist across sessions',
    ],
    examples: [
      { title: 'Review PR #42', description: 'Check code quality and test coverage', priority: 'high' },
      { title: 'Research database options', priority: 'medium' },
    ],
    isReadOnly: false,
    isDestructive: false,
    permissionMode: 'restricted',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the task' },
        description: { type: 'string', description: 'Detailed description of the task' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority level', default: 'medium' },
        agentId: { type: 'string', description: 'Optional agent ID to assign the task to' },
      },
      required: ['title'],
    },
  }),

  buildTool({
    name: 'TaskList',
    description: 'List and filter tasks from the database. View pending, in-progress, or completed tasks.',
    whenToUse: [
      'User asks "what are my tasks?" or "show my to-do list"',
      'Need to check task status before starting work',
      'Reviewing progress on a project',
    ],
    whenNotToUse: [
      'Just displaying the current plan — the UI already shows TaskPlan',
      'User is asking about general capabilities, not tasks',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Filter by priority' },
        agentId: { type: 'string', description: 'Filter by agent ID' },
        limit: { type: 'number', description: 'Max tasks to return (default 20)', default: 20 },
      },
    },
  }),

  buildTool({
    name: 'TaskUpdate',
    description: 'Update an existing task\'s status, progress, or result. Use to mark tasks complete or record findings.',
    whenToUse: [
      'Completing a task step and need to update its status',
      'Recording progress or results for a tracked task',
      'User asks to mark a task as done or update it',
    ],
    whenNotToUse: [
      'Creating a new task — use TaskCreate instead',
      'Just listing tasks — use TaskList instead',
    ],
    examples: [
      { id: 'task-123', status: 'completed', progress: 100 },
      { id: 'task-123', status: 'in_progress', progress: 50, result: 'Halfway through research' },
    ],
    isReadOnly: false,
    isDestructive: false,
    permissionMode: 'restricted',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task ID to update' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'], description: 'New status' },
        progress: { type: 'number', description: 'Progress percentage (0-100)' },
        result: { type: 'string', description: 'JSON string with task output/result data' },
      },
      required: ['id'],
    },
  }),

  // ━━━ Agent Tools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'Agent',
    description: 'Query information about available agents — their types, capabilities, and status.',
    whenToUse: [
      'User asks "what agents are available?" or "tell me about the agents"',
      'Need to check agent capabilities before delegating work',
      'Getting details about a specific agent\'s configuration',
    ],
    whenNotToUse: [
      'Actually delegating work to an agent — use multi-agent mode instead',
      'Looking for tasks — use TaskList instead',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'info'], description: 'Action to perform', default: 'list' },
        agentId: { type: 'string', description: 'Agent ID (for "info" action)' },
      },
    },
  }),

  buildTool({
    name: 'SendMessage',
    description: 'Send a message to another agent for inter-agent communication and collaboration.',
    whenToUse: [
      'Coordinating with another agent on a shared task',
      'Passing information or findings to a specialized agent',
      'Multi-agent workflow where agents need to share data',
    ],
    whenNotToUse: [
      'Sending a message to the user — just respond directly',
      'Creating a task for tracking — use TaskCreate instead',
    ],
    examples: [
      { toAgentId: 'seed-beta', message: 'I found these search results for your analysis...' },
    ],
    isReadOnly: false,
    isDestructive: false,
    permissionMode: 'restricted',
    parameters: {
      type: 'object',
      properties: {
        toAgentId: { type: 'string', description: 'The agent ID to send the message to' },
        message: { type: 'string', description: 'The message content' },
      },
      required: ['toAgentId', 'message'],
    },
  }),

  // ━━━ Meta Tools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'Skill',
    description: 'Manage and load knowledge modules (skills) to enhance your capabilities for specific tasks.',
    whenToUse: [
      'User asks about available skills or knowledge modules',
      'Need specialized knowledge for a domain-specific task',
      'Loading a skill that would improve your response quality',
    ],
    whenNotToUse: [
      'The task can be handled with your built-in knowledge',
      'User is not asking about skills or knowledge enhancement',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'load', 'info'], description: 'Action to perform', default: 'list' },
        skillId: { type: 'string', description: 'Skill ID (for "load" and "info")' },
      },
    },
  }),

  buildTool({
    name: 'Config',
    description: 'Read the current agent configuration — model, temperature, max tokens, and other settings.',
    whenToUse: [
      'User asks about current configuration or settings',
      'Need to check what model or parameters are in use',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get'], description: 'Action (currently only "get")', default: 'get' },
      },
    },
  }),

  // ━━━ Memory Tools (Phase 3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'MemorySave',
    description: 'Save a persistent memory entry (key-value pair) that persists across conversations. Use to remember user preferences, facts, or instructions.',
    whenToUse: [
      'User shares a preference (I prefer X, I like Y)',
      'User provides personal information (My name is, I work at)',
      'User gives an instruction to remember (Remember that, Always do X)',
      'You discover an important fact during the conversation worth remembering',
      'User says "remember this" or "save this"',
    ],
    whenNotToUse: [
      'Temporary information only relevant to the current conversation',
      'Information already saved as a memory (check MemorySearch first)',
      'Trivial or very common knowledge',
    ],
    examples: [
      { key: 'preference_coding_language', value: 'User prefers TypeScript for all projects', category: 'preference' },
      { key: 'fact_team_size', value: 'User manages a team of 5 developers', category: 'fact' },
    ],
    isReadOnly: false,
    isDestructive: false,
    permissionMode: 'restricted',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'A short, descriptive key for the memory (e.g. preference_language, fact_name)' },
        value: { type: 'string', description: 'The value to store for this memory' },
        category: { type: 'string', enum: ['preference', 'context', 'fact', 'instruction'], description: 'Memory category', default: 'context' },
      },
      required: ['key', 'value'],
    },
  }),

  buildTool({
    name: 'MemorySearch',
    description: 'Search through persistent memory entries by keyword or category. Use to recall previously saved information.',
    whenToUse: [
      'Need to recall a user preference or previously discussed information',
      'User asks "do you remember" or "what did I say about"',
      'Need context from a previous conversation',
    ],
    whenNotToUse: [
      'The information is in the current conversation context',
      'User is asking a new question unrelated to past conversations',
    ],
    examples: [
      { query: 'coding preference' },
      { query: 'project', category: 'fact' },
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword to find in memory keys or values' },
        category: { type: 'string', enum: ['preference', 'context', 'fact', 'instruction'], description: 'Filter by memory category' },
        limit: { type: 'number', description: 'Max results to return (default 10)', default: 10 },
      },
    },
  }),

  buildTool({
    name: 'MemoryList',
    description: 'List all persistent memory entries for the current agent. Shows keys, categories, and values.',
    whenToUse: [
      'User asks "what do you remember about me" or "show my memories"',
      'Need to review all stored memories at once',
    ],
    whenNotToUse: [
      'Looking for a specific memory - use MemorySearch instead',
      'Saving a new memory - use MemorySave instead',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max memories to return (default 20)', default: 20 },
      },
    },
  }),

  buildTool({
    name: 'MemoryDelete',
    description: 'Delete a persistent memory entry by key.',
    whenToUse: [
      'User asks to forget or remove a specific memory',
      'A memory entry is outdated or incorrect',
    ],
    whenNotToUse: [
      'Need to update a memory - just save a new value with the same key using MemorySave',
      'Need to search memories - use MemorySearch instead',
    ],
    examples: [
      { key: 'preference_old_framework' },
    ],
    isReadOnly: false,
    isDestructive: true,
    permissionMode: 'restricted',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The memory key to delete' },
      },
      required: ['key'],
    },
  }),

  // ━━━ Meta Tools (continued) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  buildTool({
    name: 'Brief',
    description: 'Generate a brief summary of system capabilities, available tools, and current agent state.',
    whenToUse: [
      'User asks "what can you do?" or "what tools do you have?"',
      'Need a quick overview at the start of a conversation',
      'User wants to understand the system capabilities',
    ],
    isReadOnly: true,
    isDestructive: false,
    permissionMode: 'open',
    parameters: {
      type: 'object',
      properties: {},
    },
  }),
];

// ── Public API ──────────────────────────────────────────────────────

/** Get all tool definitions in OpenAI function-calling format */
export function getToolDefinitions() {
  return TOOL_REGISTRY.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: buildEnrichedDescription(tool),
      parameters: tool.parameters,
    },
  }));
}

/** Get a tool definition by name */
export function getToolByName(name: string): AgentTool | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

/** Get all tool names */
export function getToolNames(): string[] {
  return TOOL_REGISTRY.map(t => t.name);
}

/** Build enriched description with whenToUse/whenNotToUse for the LLM */
function buildEnrichedDescription(tool: AgentTool): string {
  let desc = tool.description;

  if (tool.whenToUse && tool.whenToUse.length > 0) {
    desc += '\n\nWhen to use:\n' + tool.whenToUse.map(s => `- ${s}`).join('\n');
  }

  if (tool.whenNotToUse && tool.whenNotToUse.length > 0) {
    desc += '\n\nWhen NOT to use:\n' + tool.whenNotToUse.map(s => `- ${s}`).join('\n');
  }

  return desc;
}

// ── Smart Tool Result Processing ────────────────────────────────────

const MAX_TOOL_RESULT_LENGTH = 4000;

/**
 * Process tool results: truncate or summarize if too long.
 * Simple truncation for Phase 1 — LLM-based summarization in Phase 2.
 */
export function processToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_LENGTH) return result;

  // Smart truncation: keep the beginning and end, with a marker in between
  const keepStart = Math.floor(MAX_TOOL_RESULT_LENGTH * 0.6);
  const keepEnd = MAX_TOOL_RESULT_LENGTH - keepStart - 100;

  return (
    result.slice(0, keepStart) +
    `\n\n... [${result.length - MAX_TOOL_RESULT_LENGTH} characters truncated for brevity] ...\n\n` +
    result.slice(-keepEnd) +
    `\n\n[Original result was ${result.length} characters, showing first ${keepStart} and last ${keepEnd}]`
  );
}

// ── Tool Execution Engine ───────────────────────────────────────────

/**
 * Execute a single tool by name with the given arguments.
 * Includes input validation (Phase 1), circuit breaker support.
 * All errors are caught and returned as ToolResult — tool handlers never throw.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  try {
    // ── Input validation (from tool schema) ──
    const tool = getToolByName(name);
    if (!tool) {
      return { success: false, result: '', error: `Unknown tool: "${name}". Available tools: ${getToolNames().join(', ')}` };
    }

    if (tool.validateInput) {
      const validation = tool.validateInput(args);
      if (!validation.valid) {
        return { success: false, result: '', error: `Invalid input for ${name}: ${validation.message}` };
      }
    }

    // ── Execute handler ──
    const rawResult = await executeHandler(name, args, context);

    // ── Process result (truncate if needed) ──
    if (rawResult.success && rawResult.result) {
      rawResult.result = processToolResult(rawResult.result);
    }

    return rawResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Tool "${name}" crashed: ${message}` };
  }
}

// ── Handler Dispatch ────────────────────────────────────────────────

async function executeHandler(
  name: string,
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case 'WebSearch': return handleWebSearch(args);
    case 'WebFetch': return handleWebFetch(args);
    case 'TaskPlan': return handleTaskPlan(args);
    case 'TaskCreate': return handleTaskCreate(args, context);
    case 'TaskList': return handleTaskList(args, context);
    case 'TaskUpdate': return handleTaskUpdate(args);
    case 'Agent': return handleAgent(args);
    case 'SendMessage': return handleSendMessage(args, context);
    case 'Skill': return handleSkill(args);
    case 'Config': return handleConfig(context);
    case 'Brief': return handleBrief(context);
    case 'MemorySave': return handleMemorySave(args, context);
    case 'MemorySearch': return handleMemorySearch(args, context);
    case 'MemoryList': return handleMemoryList(args, context);
    case 'MemoryDelete': return handleMemoryDelete(args, context);
    default:
      return { success: false, result: '', error: `No handler for tool "${name}".` };
  }
}

// ── Handler Implementations ─────────────────────────────────────────

// ── WebSearch ────────────────────────────────────────────────────────

async function handleWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim();
  if (!query) return { success: false, result: '', error: 'A non-empty "query" is required for WebSearch.' };

  const count = Math.min(Math.max(Number(args.count) || 8, 1), 20);

  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke('web_search', {
      query,
      num: count,
      recency_days: args.recency_days ? Number(args.recency_days) : undefined,
    });

    if (!results || !Array.isArray(results) || results.length === 0) {
      return { success: true, result: `No results found for query: "${query}"` };
    }

    const formatted = results
      .map((r: { url?: string; name?: string; snippet?: string; rank?: number; date?: string }, i: number) =>
        `${i + 1}. **${r.name || 'Untitled'}**\n   URL: ${r.url || 'N/A'}\n   Snippet: ${r.snippet || 'No snippet available.'}\n   Date: ${r.date || 'Unknown'}\n`,
      )
      .join('\n');

    return { success: true, result: `Found ${results.length} result(s) for "${query}":\n\n${formatted}` };
  } catch (err) {
    return { success: false, result: '', error: `Web search failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── WebFetch ─────────────────────────────────────────────────────────

async function handleWebFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = String(args.url ?? '').trim();
  if (!url) return { success: false, result: '', error: 'A non-empty "url" is required for WebFetch.' };

  try {
    const zai = await ZAI.create();
    const pageResult = await zai.functions.invoke('page_reader', { url });

    const title = pageResult?.data?.title || 'Untitled';
    const html = pageResult?.data?.html || '';

    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const truncated = plainText.slice(0, 3000);
    const publishedTime = pageResult?.data?.publishedTime || '';

    const meta = [`Title: ${title}`, `URL: ${url}`];
    if (publishedTime) meta.push(`Published: ${publishedTime}`);
    if (pageResult?.meta?.usage?.tokens) meta.push(`Tokens: ${pageResult.meta.usage.tokens}`);

    return {
      success: true,
      result: `${meta.join('\n')}\n\n---\n\n${truncated}${plainText.length > 3000 ? '\n\n... (truncated at 3000 characters)' : ''}`,
    };
  } catch (err) {
    return { success: false, result: '', error: `Failed to fetch URL "${url}": ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── TaskPlan ─────────────────────────────────────────────────────────

async function handleTaskPlan(args: Record<string, unknown>): Promise<ToolResult> {
  const title = String(args.title ?? '').trim();
  const steps = args.steps;

  if (!title) return { success: false, result: '', error: 'A non-empty "title" is required for TaskPlan.' };
  if (!Array.isArray(steps) || steps.length === 0) return { success: false, result: '', error: '"steps" must be a non-empty array of strings.' };

  const complexity = validateEnum(String(args.complexity ?? 'moderate'), ['simple', 'moderate', 'complex'], 'moderate');
  const stepsText = steps.map((s: unknown, i: number) => `${i + 1}. ${String(s)}`).join('\n');

  return {
    success: true,
    result: `## Task Plan: ${title}\n**Complexity:** ${complexity} | **Steps:** ${steps.length}\n\n${stepsText}\n\nPlan created. Proceeding to execute each step systematically.`,
  };
}

// ── TaskCreate ───────────────────────────────────────────────────────

async function handleTaskCreate(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const title = String(args.title ?? '').trim();
  if (!title) return { success: false, result: '', error: 'A non-empty "title" is required for TaskCreate.' };

  const description = args.description ? String(args.description) : undefined;
  const priority = validateEnum(String(args.priority ?? 'medium'), ['low', 'medium', 'high', 'critical'], 'medium');
  const agentId = args.agentId ? String(args.agentId) : context?.agentId || undefined;
  const taskId = `task-${Date.now()}`;

  try {
    const task = await db.task.create({
      data: { id: taskId, title, description, priority, agentId, status: 'pending', progress: 0 },
    });
    return {
      success: true,
      result: `Task created successfully.\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n**Priority:** ${task.priority}\n**Status:** ${task.status}${task.agentId ? `\n**Assigned Agent:** ${task.agentId}` : ''}${task.description ? `\n**Description:** ${task.description}` : ''}`,
    };
  } catch (err) {
    return { success: false, result: '', error: `Failed to create task: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── TaskList ─────────────────────────────────────────────────────────

async function handleTaskList(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const where: Record<string, unknown> = {};

  if (args.status) {
    where.status = validateEnum(String(args.status), ['pending', 'in_progress', 'completed', 'failed', 'cancelled'], undefined);
  }
  if (args.priority) {
    where.priority = validateEnum(String(args.priority), ['low', 'medium', 'high', 'critical'], undefined);
  }
  if (args.agentId || context?.agentId) {
    where.agentId = String(args.agentId || context?.agentId);
  }

  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

  try {
    const tasks = await db.task.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    if (tasks.length === 0) return { success: true, result: 'No tasks found matching the given filters.' };

    const formatted = tasks
      .map((t, i) =>
        `${i + 1}. **${t.title}** [${t.id}]\n   Status: ${t.status} | Priority: ${t.priority} | Progress: ${t.progress}%${t.agentId ? `\n   Agent: ${t.agentId}` : ''}${t.description ? `\n   Description: ${t.description}` : ''}`,
      )
      .join('\n\n');

    const statusCounts = {
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };

    return {
      success: true,
      result: `Found ${tasks.length} task(s) (showing up to ${limit}):\n\n${formatted}\n\n---\n**Summary:** ${statusCounts.pending} pending, ${statusCounts.in_progress} in progress, ${statusCounts.completed} completed, ${statusCounts.failed} failed`,
    };
  } catch (err) {
    return { success: false, result: '', error: `Failed to list tasks: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── TaskUpdate ───────────────────────────────────────────────────────

async function handleTaskUpdate(args: Record<string, unknown>): Promise<ToolResult> {
  const id = String(args.id ?? '').trim();
  if (!id) return { success: false, result: '', error: 'A non-empty "id" is required for TaskUpdate.' };

  const data: Record<string, unknown> = {};

  if (args.status !== undefined) {
    const validStatus = validateEnum(String(args.status), ['pending', 'in_progress', 'completed', 'failed', 'cancelled'], undefined);
    if (!validStatus) return { success: false, result: '', error: `Invalid status: "${args.status}". Must be one of: pending, in_progress, completed, failed, cancelled.` };
    data.status = validStatus;
  }

  if (args.progress !== undefined) {
    const progress = Number(args.progress);
    if (isNaN(progress) || progress < 0 || progress > 100) return { success: false, result: '', error: 'Progress must be a number between 0 and 100.' };
    data.progress = progress;
  }

  if (args.result !== undefined) data.result = String(args.result);
  if (data.progress === 100 && !data.status) data.status = 'completed';
  if (Object.keys(data).length === 0) return { success: false, result: '', error: 'No fields to update. Provide at least one of: status, progress, or result.' };

  try {
    const task = await db.task.update({ where: { id }, data });
    return {
      success: true,
      result: `Task updated successfully.\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n**Status:** ${task.status}\n**Priority:** ${task.priority}\n**Progress:** ${task.progress}%${task.result ? `\n**Result:** ${task.result}` : ''}`,
    };
  } catch (err) {
    return { success: false, result: '', error: `Failed to update task "${id}": ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Agent ────────────────────────────────────────────────────────────

async function handleAgent(args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? 'list');

  if (action === 'info' && args.agentId) {
    try {
      const agent = await db.agent.findUnique({
        where: { id: String(args.agentId) },
        include: { tasks: { orderBy: { createdAt: 'desc' }, take: 5 }, _count: { select: { conversations: true, tasks: true, memories: true } } },
      });
      if (!agent) return { success: false, result: '', error: `Agent "${args.agentId}" not found.` };
      return {
        success: true,
        result: `**${agent.name}** [${agent.id}]\nType: ${agent.type} | Provider: ${agent.provider} | Model: ${agent.model}\nStatus: ${agent.status}\nDescription: ${agent.description || 'No description'}\n\n**Stats:** ${agent._count.conversations} conversations, ${agent._count.tasks} tasks, ${agent._count.memories} memories${agent.tasks.length > 0 ? `\n\n**Recent Tasks:**\n${agent.tasks.map(t => `- ${t.title} (${t.status})`).join('\n')}` : ''}`,
      };
    } catch (err) {
      return { success: false, result: '', error: `Failed to get agent info: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  try {
    const agents = await db.agent.findMany({ where: { status: 'active' }, orderBy: { createdAt: 'asc' } });
    if (agents.length === 0) return { success: true, result: 'No active agents found in the system.' };
    const formatted = agents.map((a, i) => `${i + 1}. **${a.name}** [${a.id}]\n   Type: ${a.type} | Provider: ${a.provider} | Model: ${a.model}\n   Description: ${a.description || 'No description'}`).join('\n\n');
    return { success: true, result: `${agents.length} active agent(s) available:\n\n${formatted}\n\nUse the Agent tool with action "info" and a specific agentId to get detailed information.` };
  } catch (err) {
    return { success: false, result: '', error: `Failed to list agents: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── SendMessage ──────────────────────────────────────────────────────

async function handleSendMessage(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const toAgentId = String(args.toAgentId ?? '').trim();
  const message = String(args.message ?? '').trim();
  if (!toAgentId) return { success: false, result: '', error: 'A non-empty "toAgentId" is required for SendMessage.' };
  if (!message) return { success: false, result: '', error: 'A non-empty "message" is required for SendMessage.' };

  try {
    const targetAgent = await db.agent.findUnique({ where: { id: toAgentId } });
    if (!targetAgent) return { success: false, result: '', error: `Target agent "${toAgentId}" not found.` };
    const fromAgentId = context?.agentId || 'unknown';
    return {
      success: true,
      result: `Message queued for delivery.\n\n**From:** ${fromAgentId}\n**To:** ${targetAgent.name} [${toAgentId}]\n**Message:** ${message}\n\nNote: Inter-agent messaging is informational. Real-time communication requires a running orchestration layer.`,
    };
  } catch (err) {
    return { success: false, result: '', error: `Failed to send message: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Skill ────────────────────────────────────────────────────────────

async function handleSkill(args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? 'list');
  const skillId = args.skillId ? String(args.skillId) : undefined;

  if (action === 'list') {
    try {
      const skills = await db.skill.findMany({ orderBy: [{ isLoaded: 'desc' }, { category: 'asc' }, { name: 'asc' }] });
      if (skills.length === 0) return { success: true, result: 'No skills found in the database.' };

      const loaded = skills.filter(s => s.isLoaded);
      const unloaded = skills.filter(s => !s.isLoaded);
      const formatSkill = (s: { id: string; name: string; description?: string | null; category: string; isLoaded: boolean }, i: number) =>
        `${i + 1}. **${s.name}** [${s.id}] — ${s.isLoaded ? '✅ Loaded' : '⬜ Available'}\n   Category: ${s.category}${s.description ? ` | ${s.description}` : ''}`;

      let result = `${skills.length} skill(s) available:\n\n`;
      if (loaded.length > 0) result += `**Loaded (${loaded.length}):**\n${loaded.map((s, i) => formatSkill(s, i)).join('\n\n')}\n\n`;
      if (unloaded.length > 0) result += `**Available (${unloaded.length}):**\n${unloaded.map((s, i) => formatSkill(s, i)).join('\n\n')}\n\n`;
      result += '\nUse the Skill tool with action "load" and a skillId to load a skill.';
      return { success: true, result };
    } catch (err) {
      return { success: false, result: '', error: `Failed to list skills: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (action === 'load') {
    if (!skillId) return { success: false, result: '', error: 'A "skillId" is required when action is "load".' };
    try {
      const skill = await db.skill.findUnique({ where: { id: skillId } });
      if (!skill) return { success: false, result: '', error: `Skill "${skillId}" not found.` };
      if (!skill.isLoaded) await db.skill.update({ where: { id: skillId }, data: { isLoaded: true } });
      return {
        success: true,
        result: `Skill "${skill.name}" is loaded.\n\n**ID:** ${skill.id}\n**Category:** ${skill.category}\n**Description:** ${skill.description || 'No description'}\n\n**Content:**\n${skill.content}`,
      };
    } catch (err) {
      return { success: false, result: '', error: `Failed to load skill: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (action === 'info' && skillId) {
    try {
      const skill = await db.skill.findUnique({ where: { id: skillId } });
      if (!skill) return { success: false, result: '', error: `Skill "${skillId}" not found.` };
      return {
        success: true,
        result: `**${skill.name}** [${skill.id}]\nCategory: ${skill.category} | Loaded: ${skill.isLoaded ? 'Yes' : 'No'}\nDescription: ${skill.description || 'No description'}\n\n**Content:**\n${skill.content}`,
      };
    } catch (err) {
      return { success: false, result: '', error: `Failed to get skill info: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { success: true, result: 'Use action "list" to see all skills, "load" to load one, or "info" for details.' };
}

// ── Config ───────────────────────────────────────────────────────────

async function handleConfig(context?: ToolContext): Promise<ToolResult> {
  return {
    success: true,
    result: `**Current Agent Configuration:**\n\n- **Agent ID:** ${context?.agentId || 'N/A'}\n- **Conversation ID:** ${context?.conversationId || 'N/A'}\n- **Available Models:** GLM 4.7, GLM 5, Kimi 2.5\n- **Default Model:** GLM 4.7\n- **Max Loop Iterations:** 10\n- **Tool Count:** ${getToolNames().length}\n- **Environment:** Serverless (Vercel)`,
  };
}

// ── Brief ────────────────────────────────────────────────────────────

async function handleBrief(context?: ToolContext): Promise<ToolResult> {
  const toolList = getToolNames().map((name, i) => `${i + 1}. **${name}**`).join('\n');
  return {
    success: true,
    result: `## OpenHarness Agent — System Brief\n\n**You are an AI agent** with access to ${getToolNames().length} tools for web search, task management, agent coordination, knowledge skills, and persistent memory.\n\n### Available Tools:\n${toolList}\n\n### How to Work:\n1. For complex tasks, create a **TaskPlan** first\n2. Use **WebSearch** to find real-time information\n3. Use **TaskCreate/TaskList/TaskUpdate** for persistent tracking\n4. Use **Skill** to load specialized knowledge\n5. Use **Agent** to discover other agents and **SendMessage** for collaboration\n6. Use **MemorySave/MemorySearch/MemoryList** to remember user preferences and facts\n\n### Current Session:\n- Agent: ${context?.agentId || 'default'}\n- Conversation: ${context?.conversationId || 'N/A'}`,
  };
}

// ── Memory Handlers (Phase 3) ────────────────────────────────────────

async function handleMemorySave(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const key = String(args.key ?? '').trim();
  const value = String(args.value ?? '').trim();
  const category = validateEnum(String(args.category ?? 'context'), ['preference', 'context', 'fact', 'instruction'], 'context');
  const agentId = context?.agentId;

  if (!key) return { success: false, result: '', error: 'A non-empty "key" is required for MemorySave.' };
  if (!value) return { success: false, result: '', error: 'A non-empty "value" is required for MemorySave.' };
  if (!agentId) return { success: false, result: '', error: 'MemorySave requires an active agent context.' };

  const result = await saveMemory(agentId, key, value, category);
  if (!result.success) return { success: false, result: '', error: result.error };

  return {
    success: true,
    result: `Memory saved successfully.\n\n**Key:** ${key}\n**Value:** ${value}\n**Category:** ${category}\n\nThis memory will persist across conversations.`,
  };
}

async function handleMemorySearch(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const agentId = context?.agentId;
  if (!agentId) return { success: false, result: '', error: 'MemorySearch requires an active agent context.' };

  const query = args.query ? String(args.query) : undefined;
  const category = args.category ? validateEnum(String(args.category), ['preference', 'context', 'fact', 'instruction'], undefined) : undefined;
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);

  const result = await searchMemory(agentId, query, category, limit);
  if (!result.success) return { success: false, result: '', error: result.error };

  if (result.memories.length === 0) {
    return { success: true, result: query ? `No memories found matching "${query}".` : 'No memories found for this agent.' };
  }

  const formatted = result.memories
    .map((m, i) => `${i + 1}. **${m.key}** [${m.category}]\n   ${m.value}\n   Updated: ${m.updatedAt.toISOString().split('T')[0]}`)
    .join('\n\n');

  return {
    success: true,
    result: `Found ${result.memories.length} memory(ies):\n\n${formatted}`,
  };
}

async function handleMemoryList(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const agentId = context?.agentId;
  if (!agentId) return { success: false, result: '', error: 'MemoryList requires an active agent context.' };

  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const result = await listMemory(agentId, limit);
  if (!result.success) return { success: false, result: '', error: result.error };

  if (result.memories.length === 0) return { success: true, result: 'No memories stored yet. Use MemorySave to save your first memory.' };

  const byCategory: Record<string, typeof result.memories> = {};
  for (const m of result.memories) {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(m);
  }

  const formatted = Object.entries(byCategory)
    .map(([cat, mems]) => {
      const memLines = mems.map((m, i) => `${i + 1}. **${m.key}**: ${m.value}`).join('\n');
      return `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${mems.length})\n${memLines}`;
    })
    .join('\n\n');

  return {
    success: true,
    result: `## Memory Store (${result.memories.length} entries)\n\n${formatted}`,
  };
}

async function handleMemoryDelete(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const key = String(args.key ?? '').trim();
  const agentId = context?.agentId;

  if (!key) return { success: false, result: '', error: 'A non-empty "key" is required for MemoryDelete.' };
  if (!agentId) return { success: false, result: '', error: 'MemoryDelete requires an active agent context.' };

  const result = await deleteMemory(agentId, key);
  if (!result.success) return { success: false, result: '', error: result.error };

  return { success: true, result: `Memory "${key}" deleted successfully.` };
}

// ── Utility ──────────────────────────────────────────────────────────

function validateEnum(value: string, allowed: string[], fallback?: string): string | undefined {
  if (allowed.includes(value)) return value;
  return fallback;
}

// ── Re-export ToolContext for backward compatibility ─────────────────
export type { ToolContext } from './types';
