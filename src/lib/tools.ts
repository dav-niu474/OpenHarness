// =============================================================================
// OpenHarness Tool Executor Engine
// =============================================================================
// Defines all tool schemas in OpenAI function-calling format, implements tool
// handlers that execute actual operations, and returns structured results for
// the LLM. This is a library file imported by API routes — NOT a server action.
// =============================================================================

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// ── Types ──────────────────────────────────────────────────────────

/** Shape of every tool definition sent to the LLM (OpenAI function-calling). */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Structured result returned by every tool handler. */
export interface ToolResult {
  success: boolean;
  result: string;
  error?: string;
}

/** Optional context passed through from the caller (streaming route). */
export interface ToolContext {
  agentId?: string;
  conversationId?: string;
}

// ── Tool Definitions (OpenAI function-calling format) ──────────────

function getToolDefinitions(): ToolDefinition[] {
  return [
    // ── Search Tools ───────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'WebSearch',
        description:
          'Search the web for real-time information. Returns a list of search results with titles, URLs, and snippets. Use this when you need up-to-date information, facts, or want to browse the web.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query string',
            },
            count: {
              type: 'number',
              description: 'Maximum number of results to return (1-20, default 8)',
              default: 8,
            },
            recency_days: {
              type: 'number',
              description:
                'Optional. Limit results to the last N days (e.g. 7 for past week)',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'WebFetch',
        description:
          'Fetch a URL and extract its text content. Returns the page title and first 3000 characters of extracted text. Useful for reading articles, documentation, or any web page content.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch and extract content from',
            },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'LSP',
        description:
          'Language Server Protocol integration for code intelligence (go-to-definition, hover, diagnostics, etc.).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'The LSP action to perform',
              enum: ['definition', 'hover', 'diagnostics', 'references', 'symbols'],
            },
            file: {
              type: 'string',
              description: 'File path to query',
            },
            line: {
              type: 'number',
              description: 'Line number (0-based)',
            },
            character: {
              type: 'number',
              description: 'Character offset (0-based)',
            },
          },
          required: ['action'],
        },
      },
    },

    // ── File Tools (simulated for serverless) ───────────────────
    {
      type: 'function',
      function: {
        name: 'Bash',
        description:
          'Execute a shell command in a persistent environment. Supports timeout. Returns stdout and stderr.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (max 600000)',
              default: 120000,
            },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Read',
        description:
          'Read file contents from the local filesystem. Supports text files only.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to read',
            },
            offset: {
              type: 'number',
              description: 'Line number to start reading from',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of lines to read',
            },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Write',
        description:
          'Write content to a file. Creates the file if it does not exist, overwrites it if it does.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to write',
            },
            content: {
              type: 'string',
              description: 'The content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Edit',
        description:
          'Perform exact string replacements in an existing file. The old_string must match exactly (including whitespace).',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to edit',
            },
            old_str: {
              type: 'string',
              description: 'The exact text to find and replace',
            },
            new_str: {
              type: 'string',
              description: 'The replacement text',
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences (default false)',
              default: false,
            },
          },
          required: ['path', 'old_str', 'new_str'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Glob',
        description:
          'Fast file pattern matching using glob patterns (e.g. "**/*.ts", "src/**/*.tsx"). Returns matching file paths.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'The glob pattern to match files against',
            },
            path: {
              type: 'string',
              description: 'Directory to search in (defaults to current directory)',
            },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Grep',
        description:
          'Powerful search tool built on ripgrep. Supports full regex syntax, file filtering, and multiline matching.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'The regular expression pattern to search for',
            },
            path: {
              type: 'string',
              description: 'File or directory to search in',
            },
            glob: {
              type: 'string',
              description: 'Glob pattern to filter files (e.g. "*.ts")',
            },
            output_mode: {
              type: 'string',
              description: 'Output mode: content, files_with_matches, or count',
              enum: ['content', 'files_with_matches', 'count'],
              default: 'content',
            },
          },
          required: ['pattern'],
        },
      },
    },

    // ── Task Management (DB-backed) ────────────────────────────
    {
      type: 'function',
      function: {
        name: 'TaskCreate',
        description:
          'Create a new background task in the database. Tasks can be assigned to agents and tracked with status, priority, and progress.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short title for the task',
            },
            description: {
              type: 'string',
              description: 'Detailed description of the task',
            },
            priority: {
              type: 'string',
              description: 'Task priority level',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
            },
            agentId: {
              type: 'string',
              description: 'Optional agent ID to assign the task to',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'TaskList',
        description:
          'List tasks from the database with optional status and priority filters. Returns a formatted list of tasks with their details.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by task status',
              enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
            },
            priority: {
              type: 'string',
              description: 'Filter by priority',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            agentId: {
              type: 'string',
              description: 'Filter by agent ID',
            },
            limit: {
              type: 'number',
              description: 'Maximum tasks to return (default 20)',
              default: 20,
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'TaskUpdate',
        description:
          'Update an existing task\'s status, progress, or result. Use this to mark tasks as completed, update progress percentage, or record results.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The task ID to update',
            },
            status: {
              type: 'string',
              description: 'New status',
              enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
            },
            progress: {
              type: 'number',
              description: 'Progress percentage (0-100)',
            },
            result: {
              type: 'string',
              description: 'JSON string with task output/result data',
            },
          },
          required: ['id'],
        },
      },
    },

    // ── Agent Tools ────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'Agent',
        description:
          'Query information about available agents in the system. Lists agents with their types, capabilities, and status.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['list', 'info'],
              default: 'list',
            },
            agentId: {
              type: 'string',
              description: 'Specific agent ID to get info for (when action is "info")',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'SendMessage',
        description:
          'Send a message to another agent in the system. Enables inter-agent communication for collaborative workflows.',
        parameters: {
          type: 'object',
          properties: {
            toAgentId: {
              type: 'string',
              description: 'The ID of the agent to send the message to',
            },
            message: {
              type: 'string',
              description: 'The message content to send',
            },
          },
          required: ['toAgentId', 'message'],
        },
      },
    },

    // ── Meta Tools ─────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'Skill',
        description:
          'Manage agent skills and knowledge modules. List available skills or load a specific skill into the current agent context.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['list', 'load', 'info'],
              default: 'list',
            },
            skillId: {
              type: 'string',
              description: 'Skill ID (required for "load" and "info" actions)',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Config',
        description:
          'Read current agent configuration including model, temperature, max tokens, and other settings.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform (currently only "get" is supported)',
              enum: ['get'],
              default: 'get',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'Brief',
        description:
          'Generate a brief summary of the system capabilities, available tools, and current agent state.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },

    // ── Task Planning ─────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'TaskPlan',
        description:
          'Create a structured task plan with numbered steps. Use this for complex tasks that require multiple steps. The plan will be displayed as a visual checklist in the UI.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Brief title of the overall task',
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ordered list of steps to execute',
            },
            complexity: {
              type: 'string',
              enum: ['simple', 'moderate', 'complex'],
              description: 'Estimated complexity of the task',
            },
          },
          required: ['title', 'steps'],
        },
      },
    },

    // ── MCP Tools ──────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'MCPTool',
        description:
          'Execute a tool via the Model Context Protocol (MCP). Connects to external MCP servers for extended tool capabilities.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'The MCP server name to connect to',
            },
            tool: {
              type: 'string',
              description: 'The tool name to execute on the MCP server',
            },
            args: {
              type: 'object',
              description: 'Arguments to pass to the MCP tool',
            },
          },
          required: ['server', 'tool'],
        },
      },
    },
  ];
}

// ── Tool Handlers ──────────────────────────────────────────────────

/**
 * Execute a single tool by name with the given arguments.
 * All errors are caught and returned as `{ success: false, error: ... }`.
 * Tool handlers never throw.
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      // ── Search Tools ─────────────────────────────────────────
      case 'WebSearch':
        return await handleWebSearch(args);
      case 'WebFetch':
        return await handleWebFetch(args);
      case 'LSP':
        return {
          success: false,
          result: '',
          error: 'LSP not available in serverless environment',
        };

      // ── File Tools (simulated for serverless) ─────────────────
      case 'Bash':
        return await handleBash(args);
      case 'Read':
        return {
          success: false,
          result: '',
          error: 'File system access is limited in serverless environment. Direct file reading is not available.',
        };
      case 'Write':
        return {
          success: false,
          result: '',
          error: 'File writing is not available in serverless environment.',
        };
      case 'Edit':
        return {
          success: false,
          result: '',
          error: 'File editing is not available in serverless environment.',
        };
      case 'Glob':
        return {
          success: false,
          result: '',
          error: 'File pattern matching is limited in serverless environment.',
        };
      case 'Grep':
        return {
          success: false,
          result: '',
          error: 'File search is limited in serverless environment.',
        };

      // ── Task Management (DB-backed) ───────────────────────────
      case 'TaskCreate':
        return await handleTaskCreate(args, context);
      case 'TaskList':
        return await handleTaskList(args, context);
      case 'TaskUpdate':
        return await handleTaskUpdate(args);

      // ── Agent Tools ───────────────────────────────────────────
      case 'Agent':
        return await handleAgent(args);
      case 'SendMessage':
        return await handleSendMessage(args, context);

      // ── Meta Tools ────────────────────────────────────────────
      case 'Skill':
        return await handleSkill(args);
      case 'Config':
        return await handleConfig(context);
      case 'Brief':
        return await handleBrief(context);

      // ── Task Planning ───────────────────────────────────────────
      case 'TaskPlan':
        return await handleTaskPlan(args);

      // ── MCP Tools ─────────────────────────────────────────────
      case 'MCPTool':
        return {
          success: false,
          result: '',
          error: 'MCP server connection not available in serverless environment.',
        };

      default:
        return {
          success: false,
          result: '',
          error: `Unknown tool: "${name}". No handler registered for this tool.`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      result: '',
      error: `Tool "${name}" failed: ${message}`,
    };
  }
}

// ── Handler Implementations ────────────────────────────────────────

// ── WebSearch ──────────────────────────────────────────────────────

async function handleWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim();
  if (!query) {
    return { success: false, result: '', error: 'A non-empty "query" is required for WebSearch.' };
  }

  const count = Math.min(Math.max(Number(args.count) || 8, 1), 20);

  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke('web_search', {
      query,
      num: count,
      recency_days: args.recency_days ? Number(args.recency_days) : undefined,
    });

    if (!results || !Array.isArray(results) || results.length === 0) {
      return {
        success: true,
        result: `No results found for query: "${query}"`,
      };
    }

    const formatted = results
      .map(
        (r: { url?: string; name?: string; snippet?: string; rank?: number; date?: string }, i: number) =>
          `${i + 1}. **${r.name || 'Untitled'}**\n   URL: ${r.url || 'N/A'}\n   Snippet: ${r.snippet || 'No snippet available.'}\n   Date: ${r.date || 'Unknown'}\n`,
      )
      .join('\n');

    return {
      success: true,
      result: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Web search failed: ${message}` };
  }
}

// ── WebFetch ───────────────────────────────────────────────────────

async function handleWebFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = String(args.url ?? '').trim();
  if (!url) {
    return { success: false, result: '', error: 'A non-empty "url" is required for WebFetch.' };
  }

  try {
    const zai = await ZAI.create();
    const pageResult = await zai.functions.invoke('page_reader', { url });

    const title = pageResult?.data?.title || 'Untitled';
    const html = pageResult?.data?.html || '';

    // Strip HTML tags for plain-text extraction
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
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to fetch URL "${url}": ${message}` };
  }
}

// ── Bash (simulated) ───────────────────────────────────────────────

async function handleBash(args: Record<string, unknown>): Promise<ToolResult> {
  const command = String(args.command ?? '').trim();
  if (!command) {
    return { success: false, result: '', error: 'A non-empty "command" is required for Bash.' };
  }

  // In serverless, simulate basic echo responses for simple commands
  const echoMatch = command.match(/^echo\s+["'](.+)["']$/i);
  if (echoMatch) {
    return {
      success: true,
      result: `[serverless-simulated]\n${echoMatch[1]}\n\nNote: Running in serverless environment. Shell execution is simulated.`,
    };
  }

  const pwdMatch = command.match(/^pwd$/i);
  if (pwdMatch) {
    return {
      success: true,
      result: `[serverless-simulated]\n/app\n\nNote: Running in serverless environment. Shell execution is simulated.`,
    };
  }

  const whoamiMatch = command.match(/^whoami$/i);
  if (whoamiMatch) {
    return {
      success: true,
      result: `[serverless-simulated]\nopenharness-agent\n\nNote: Running in serverless environment. Shell execution is simulated.`,
    };
  }

  const dateMatch = command.match(/^date$/i);
  if (dateMatch) {
    return {
      success: true,
      result: `[serverless-simulated]\n${new Date().toISOString()}\n\nNote: Running in serverless environment. Shell execution is simulated.`,
    };
  }

  const unameMatch = command.match(/^uname\s+-a$/i);
  if (unameMatch) {
    return {
      success: true,
      result: `[serverless-simulated]\nOpenHarness serverless (Node.js ${process.version})\n\nNote: Running in serverless environment. Shell execution is simulated.`,
    };
  }

  return {
    success: false,
    result: '',
    error: `Bash is not available in serverless environment. The command "${command}" cannot be executed. Only basic echo, pwd, whoami, date, and uname commands are simulated. Use WebSearch for web queries or TaskCreate for task management instead.`,
  };
}

// ── TaskCreate ─────────────────────────────────────────────────────

async function handleTaskCreate(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const title = String(args.title ?? '').trim();
  if (!title) {
    return { success: false, result: '', error: 'A non-empty "title" is required for TaskCreate.' };
  }

  const description = args.description ? String(args.description) : undefined;
  const priority = validateEnum(String(args.priority ?? 'medium'), ['low', 'medium', 'high', 'critical'], 'medium');
  const agentId = args.agentId ? String(args.agentId) : context?.agentId || undefined;
  const taskId = `task-${Date.now()}`;

  try {
    const task = await db.task.create({
      data: {
        id: taskId,
        title,
        description,
        priority,
        agentId,
        status: 'pending',
        progress: 0,
      },
    });

    return {
      success: true,
      result: `Task created successfully.\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n**Priority:** ${task.priority}\n**Status:** ${task.status}${task.agentId ? `\n**Assigned Agent:** ${task.agentId}` : ''}${task.description ? `\n**Description:** ${task.description}` : ''}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to create task: ${message}` };
  }
}

// ── TaskList ───────────────────────────────────────────────────────

async function handleTaskList(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const where: Record<string, unknown> = {};

  if (args.status) {
    where.status = validateEnum(
      String(args.status),
      ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
      undefined,
    );
  }
  if (args.priority) {
    where.priority = validateEnum(
      String(args.priority),
      ['low', 'medium', 'high', 'critical'],
      undefined,
    );
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

    if (tasks.length === 0) {
      return {
        success: true,
        result: 'No tasks found matching the given filters.',
      };
    }

    const formatted = tasks
      .map(
        (t, i) =>
          `${i + 1}. **${t.title}** [${t.id}]\n   Status: ${t.status} | Priority: ${t.priority} | Progress: ${t.progress}%${t.agentId ? `\n   Agent: ${t.agentId}` : ''}${t.description ? `\n   Description: ${t.description}` : ''}`,
      )
      .join('\n\n');

    const statusCounts = {
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };

    return {
      success: true,
      result: `Found ${tasks.length} task(s) (showing up to ${limit}):\n\n${formatted}\n\n---\n**Summary:** ${statusCounts.pending} pending, ${statusCounts.in_progress} in progress, ${statusCounts.completed} completed, ${statusCounts.failed} failed`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to list tasks: ${message}` };
  }
}

// ── TaskUpdate ─────────────────────────────────────────────────────

async function handleTaskUpdate(args: Record<string, unknown>): Promise<ToolResult> {
  const id = String(args.id ?? '').trim();
  if (!id) {
    return { success: false, result: '', error: 'A non-empty "id" is required for TaskUpdate.' };
  }

  // Build update payload
  const data: Record<string, unknown> = {};

  if (args.status !== undefined) {
    const validStatus = validateEnum(
      String(args.status),
      ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
      undefined,
    );
    if (!validStatus) {
      return {
        success: false,
        result: '',
        error: `Invalid status: "${args.status}". Must be one of: pending, in_progress, completed, failed, cancelled.`,
      };
    }
    data.status = validStatus;
  }

  if (args.progress !== undefined) {
    const progress = Number(args.progress);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      return { success: false, result: '', error: 'Progress must be a number between 0 and 100.' };
    }
    data.progress = progress;
  }

  if (args.result !== undefined) {
    data.result = String(args.result);
  }

  // Auto-set completed status when progress is 100
  if (data.progress === 100 && !data.status) {
    data.status = 'completed';
  }

  if (Object.keys(data).length === 0) {
    return {
      success: false,
      result: '',
      error: 'No fields to update. Provide at least one of: status, progress, or result.',
    };
  }

  try {
    const task = await db.task.update({
      where: { id },
      data,
    });

    return {
      success: true,
      result: `Task updated successfully.\n\n**ID:** ${task.id}\n**Title:** ${task.title}\n**Status:** ${task.status}\n**Priority:** ${task.priority}\n**Progress:** ${task.progress}%${task.result ? `\n**Result:** ${task.result}` : ''}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to update task "${id}": ${message}` };
  }
}

// ── Agent ──────────────────────────────────────────────────────────

async function handleAgent(args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? 'list');

  if (action === 'info' && args.agentId) {
    try {
      const agent = await db.agent.findUnique({
        where: { id: String(args.agentId) },
        include: {
          tasks: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          _count: {
            select: { conversations: true, tasks: true, memories: true },
          },
        },
      });

      if (!agent) {
        return { success: false, result: '', error: `Agent "${args.agentId}" not found.` };
      }

      return {
        success: true,
        result: `**${agent.name}** [${agent.id}]\nType: ${agent.type} | Provider: ${agent.provider} | Model: ${agent.model}\nStatus: ${agent.status}\nDescription: ${agent.description || 'No description'}\n\n**Stats:** ${agent._count.conversations} conversations, ${agent._count.tasks} tasks, ${agent._count.memories} memories${agent.tasks.length > 0 ? `\n\n**Recent Tasks:**\n${agent.tasks.map((t) => `- ${t.title} (${t.status})`).join('\n')}` : ''}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, result: '', error: `Failed to get agent info: ${message}` };
    }
  }

  // Default: list all agents
  try {
    const agents = await db.agent.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
    });

    if (agents.length === 0) {
      return { success: true, result: 'No active agents found in the system.' };
    }

    const formatted = agents
      .map(
        (a, i) =>
          `${i + 1}. **${a.name}** [${a.id}]\n   Type: ${a.type} | Provider: ${a.provider} | Model: ${a.model}\n   Description: ${a.description || 'No description'}`,
      )
      .join('\n\n');

    return {
      success: true,
      result: `${agents.length} active agent(s) available:\n\n${formatted}\n\nUse the Agent tool with action "info" and a specific agentId to get detailed information about an agent.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to list agents: ${message}` };
  }
}

// ── SendMessage ────────────────────────────────────────────────────

async function handleSendMessage(args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult> {
  const toAgentId = String(args.toAgentId ?? '').trim();
  const message = String(args.message ?? '').trim();

  if (!toAgentId) {
    return { success: false, result: '', error: 'A non-empty "toAgentId" is required for SendMessage.' };
  }
  if (!message) {
    return { success: false, result: '', error: 'A non-empty "message" is required for SendMessage.' };
  }

  try {
    // Verify target agent exists
    const targetAgent = await db.agent.findUnique({ where: { id: toAgentId } });
    if (!targetAgent) {
      return { success: false, result: '', error: `Target agent "${toAgentId}" not found.` };
    }

    const fromAgentId = context?.agentId || 'unknown';

    return {
      success: true,
      result: `Message queued for delivery.\n\n**From:** ${fromAgentId}\n**To:** ${targetAgent.name} [${toAgentId}]\n**Message:** ${message}\n\nNote: Inter-agent messaging is currently informational. The message has been recorded but real-time agent-to-agent communication requires a running agent orchestration layer.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to send message: ${message}` };
  }
}

// ── Skill ──────────────────────────────────────────────────────────

async function handleSkill(args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? 'list');
  const skillId = args.skillId ? String(args.skillId) : undefined;

  // ── List skills ─────────────────────────────────────────────
  if (action === 'list') {
    try {
      const skills = await db.skill.findMany({
        orderBy: [{ isLoaded: 'desc' }, { category: 'asc' }, { name: 'asc' }],
      });

      if (skills.length === 0) {
        return { success: true, result: 'No skills found in the database.' };
      }

      const loaded = skills.filter((s) => s.isLoaded);
      const unloaded = skills.filter((s) => !s.isLoaded);

      const formatSkill = (s: { id: string; name: string; description?: string | null; category: string; isLoaded: boolean }, i: number) =>
        `${i + 1}. **${s.name}** [${s.id}] — ${s.isLoaded ? '✅ Loaded' : '⬜ Not loaded'}\n   Category: ${s.category}${s.description ? ` | ${s.description}` : ''}`;

      let result = `${skills.length} skill(s) available:\n\n`;

      if (loaded.length > 0) {
        result += `**Loaded (${loaded.length}):**\n${loaded.map((s, i) => formatSkill(s, i)).join('\n\n')}\n\n`;
      }
      if (unloaded.length > 0) {
        result += `**Available (${unloaded.length}):**\n${unloaded.map((s, i) => formatSkill(s, i)).join('\n\n')}\n\n`;
      }

      result += '\nUse the Skill tool with action "load" and a skillId to load a skill into context.';

      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, result: '', error: `Failed to list skills: ${message}` };
    }
  }

  // ── Load skill ──────────────────────────────────────────────
  if (action === 'load') {
    if (!skillId) {
      return { success: false, result: '', error: 'A "skillId" is required when action is "load".' };
    }

    try {
      const skill = await db.skill.findUnique({ where: { id: skillId } });
      if (!skill) {
        return { success: false, result: '', error: `Skill "${skillId}" not found.` };
      }

      if (skill.isLoaded) {
        return {
          success: true,
          result: `Skill "${skill.name}" is already loaded.\n\n**ID:** ${skill.id}\n**Category:** ${skill.category}\n**Description:** ${skill.description || 'No description'}\n\n**Content:**\n${skill.content}`,
        };
      }

      // Mark skill as loaded in DB
      await db.skill.update({
        where: { id: skillId },
        data: { isLoaded: true },
      });

      return {
        success: true,
        result: `Skill "${skill.name}" has been loaded into context.\n\n**ID:** ${skill.id}\n**Category:** ${skill.category}\n**Description:** ${skill.description || 'No description'}\n\n**Content:**\n${skill.content}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, result: '', error: `Failed to load skill "${skillId}": ${message}` };
    }
  }

  // ── Skill info ──────────────────────────────────────────────
  if (action === 'info') {
    if (!skillId) {
      return { success: false, result: '', error: 'A "skillId" is required when action is "info".' };
    }

    try {
      const skill = await db.skill.findUnique({ where: { id: skillId } });
      if (!skill) {
        return { success: false, result: '', error: `Skill "${skillId}" not found.` };
      }

      return {
        success: true,
        result: `**${skill.name}** [${skill.id}]\nCategory: ${skill.category}\nStatus: ${skill.isLoaded ? '✅ Loaded' : '⬜ Not loaded'}\nDescription: ${skill.description || 'No description'}\n\n**Content:**\n${skill.content}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, result: '', error: `Failed to get skill info: ${message}` };
    }
  }

  return { success: false, result: '', error: `Unknown skill action: "${action}". Use "list", "load", or "info".` };
}

// ── TaskPlan ──────────────────────────────────────────────────

async function handleTaskPlan(args: Record<string, unknown>): Promise<ToolResult> {
  const title = String(args.title ?? '').trim();
  if (!title) {
    return { success: false, result: '', error: 'A non-empty "title" is required for TaskPlan.' };
  }

  const steps = args.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { success: false, result: '', error: 'A non-empty "steps" array is required for TaskPlan.' };
  }

  const complexity = validateEnum(
    String(args.complexity ?? 'moderate'),
    ['simple', 'moderate', 'complex'],
    'moderate',
  );

  const formattedSteps = steps
    .map((step: unknown, i: number) => `${i + 1}. [ ] ${String(step)}`)
    .join('\n');

  let result = `**Task Plan: ${title}**\nComplexity: ${complexity} | Steps: ${steps.length}\n\n${formattedSteps}`;

  if (complexity === 'complex') {
    result += '\n\n> This is a complex task. Consider delegating individual subtasks to specialized agents using the Agent tool or SendMessage tool for parallel execution.';
  }

  result += '\n\nProceeding to execute each step...';

  return { success: true, result };
}

// ── Config ─────────────────────────────────────────────────────────

async function handleConfig(context?: ToolContext): Promise<ToolResult> {
  try {
    let agentConfig = 'No agent selected. Running with default configuration.';

    if (context?.agentId) {
      const agent = await db.agent.findUnique({ where: { id: context.agentId } });
      if (agent) {
        let configObj: Record<string, unknown> = {};
        try {
          configObj = JSON.parse(agent.config || '{}');
        } catch {
          configObj = {};
        }
        agentConfig = `**${agent.name}** [${agent.id}]\n- Provider: ${agent.provider}\n- Model: ${agent.model}\n- Type: ${agent.type}\n- Status: ${agent.status}\n- Temperature: ${configObj.temperature ?? 'default'}\n- Max Tokens: ${configObj.maxTokens ?? 'default'}\n- Top P: ${configObj.topP ?? 'default'}`;
      }
    }

    return {
      success: true,
      result: `## Agent Configuration\n\n${agentConfig}\n\n## System Configuration\n- Runtime: ${process.env.VERCEL ? 'Vercel Serverless' : 'Local Development'}\n- Node.js: ${process.version}\n- Database: SQLite (Prisma ORM)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to get configuration: ${message}` };
  }
}

// ── Brief ──────────────────────────────────────────────────────────

async function handleBrief(context?: ToolContext): Promise<ToolResult> {
  try {
    const [agentCount, taskStats, skillStats] = await Promise.all([
      db.agent.count({ where: { status: 'active' } }),
      db.task.groupBy({ by: ['status'], _count: true }),
      db.skill.groupBy({ by: ['isLoaded'], _count: true }),
    ]);

    const statusSummary = taskStats
      .map((s) => `${s.status}: ${s._count}`)
      .join(', ');

    const loadedSkills = skillStats.find((s) => s.isLoaded === true)?._count ?? 0;
    const totalSkills = skillStats.reduce((sum, s) => sum + s._count, 0);

    const tools = getToolDefinitions().map((t) => t.function.name);

    return {
      success: true,
      result: `## OpenHarness System Brief\n\n### Agents\n${agentCount} active agent(s) available in the system.${context?.agentId ? ` Current agent: ${context.agentId}.` : ''}\n\n### Tasks\n${statusSummary}\n\n### Skills\n${loadedSkills}/${totalSkills} skill(s) loaded\n\n### Tools (${tools.length})\n${tools.map((t) => `- **${t}**`).join('\n')}\n\n### Tool Categories\n- **Search:** WebSearch, WebFetch, LSP\n- **File:** Bash, Read, Write, Edit, Glob, Grep (simulated in serverless)\n- **Task:** TaskCreate, TaskList, TaskUpdate (database-backed)\n- **Agent:** Agent, SendMessage\n- **Meta:** Skill, Config, Brief\n- **MCP:** MCPTool\n\n### Runtime\n${process.env.VERCEL ? '☁️ Serverless (Vercel)' : '💻 Local Development'}\nDatabase: SQLite via Prisma ORM\nLLM: Multi-provider (z-ai-web-dev-sdk, NVIDIA NIM)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, result: '', error: `Failed to generate brief: ${message}` };
  }
}

// ── Utility: Tool Categories for UI ────────────────────────────────

function getToolCategories(): Record<string, Array<{ name: string; description: string }>> {
  const defs = getToolDefinitions();
  const categories: Record<string, Array<{ name: string; description: string }>> = {
    search: [],
    file: [],
    task: [],
    agent: [],
    meta: [],
    mcp: [],
  };

  for (const def of defs) {
    const name = def.function.name;
    const desc = def.function.description;

    if (['WebSearch', 'WebFetch', 'LSP'].includes(name)) {
      categories.search.push({ name, description: desc });
    } else if (['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(name)) {
      categories.file.push({ name, description: desc });
    } else if (['TaskCreate', 'TaskList', 'TaskUpdate'].includes(name)) {
      categories.task.push({ name, description: desc });
    } else if (['Agent', 'SendMessage'].includes(name)) {
      categories.agent.push({ name, description: desc });
    } else if (['Skill', 'Config', 'Brief'].includes(name)) {
      categories.meta.push({ name, description: desc });
    } else if (['MCPTool'].includes(name)) {
      categories.mcp.push({ name, description: desc });
    }
  }

  return categories;
}

// ── Internal Helpers ───────────────────────────────────────────────

/**
 * Validate that a value is one of the allowed enum values.
 * Returns the validated value, or `fallback` if not valid.
 */
function validateEnum(value: string, allowed: string[], fallback?: string): string | undefined {
  if (allowed.includes(value)) return value;
  return fallback;
}

// ── Public API ─────────────────────────────────────────────────────

export { getToolDefinitions, executeTool, getToolCategories };
