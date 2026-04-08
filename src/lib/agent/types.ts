// =============================================================================
// OpenHarness Agent — Core Type Definitions (Phase 1)
// =============================================================================
// Based on Claude Code architecture: Loop > Recursion, Schema-Driven, Fail-Closed
// =============================================================================

import type { LLMMessage } from '@/lib/llm';

// ── SSE Stream Event Types ──────────────────────────────────────────

export type StreamEvent =
  | { type: 'thinking'; content: string; model: string }
  | { type: 'token'; content: string; model: string }
  | { type: 'tool_call'; toolCallId: string; name: string; arguments: string; done: boolean; iteration: number }
  | { type: 'tool_executing'; toolCallId: string; name: string }
  | { type: 'tool_result'; toolCallId: string; name: string; result: string; success: boolean; duration: number; iteration: number }
  | { type: 'loop_iteration'; iteration: number; maxIterations: number; model: string }
  | { type: 'planning'; content: string }
  | { type: 'task_plan'; title: string; steps: string[]; complexity: string; completedSteps: number[] }
  | { type: 'context_compressed'; strategy: 'snip' | 'summary'; originalTokens: number; compressedTokens: number; savedRatio: number }
  | { type: 'done'; usage?: TokenUsage; model: string; modelId: string; provider: string; thinkingLength: number; toolCalls?: ToolCallRecord[]; loopIterations: number; autonomous?: boolean; error?: string }
  | { type: 'error'; error: string };

// ── Token Usage ─────────────────────────────────────────────────────

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

// ── Agent Loop State ────────────────────────────────────────────────

export interface LoopState {
  /** Full message array for LLM context */
  messages: LLMMessage[];
  /** Current loop iteration (1-based) */
  turnCount: number;
  /** Maximum allowed iterations */
  maxIterations: number;
  /** Accumulated thinking content across all iterations */
  fullThinking: string;
  /** Accumulated content across all iterations */
  fullContent: string;
  /** Token usage from the last LLM call */
  usageData: TokenUsage | null;
  /** History of all tool calls executed in this session */
  toolCallsHistory: ToolCallRecord[];
  /** Circuit breaker: count of consecutive tool failures */
  consecutiveFailures: number;
  /** Max consecutive failures before circuit breaker trips */
  maxConsecutiveFailures: number;
  /** Whether the agent is in planning phase */
  isPlanningPhase: boolean;
  /** Last task plan event (for tracking completed steps) */
  lastTaskPlan: TaskPlanEvent | null;
  /** Abort controller for clean shutdown */
  abortController: AbortController;
}

// ── Tool Call Record ────────────────────────────────────────────────

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
  result: string;
  success: boolean;
  duration: number;
  iteration: number;
}

// ── Task Plan Event ─────────────────────────────────────────────────

export interface TaskPlanEvent {
  title: string;
  steps: string[];
  complexity: string;
  completedSteps: number[];
}

// ── Tool System Types ───────────────────────────────────────────────

/** Schema-driven tool definition with safety metadata (Fail-Closed defaults) */
export interface AgentTool {
  /** Tool name — must match the handler registry key */
  name: string;
  /** One-line description for the LLM (<80 chars) */
  description: string;
  /** When to use this tool — 3-5 trigger scenarios for the LLM */
  whenToUse?: string[];
  /** When NOT to use this tool — anti-patterns to prevent misuse */
  whenNotToUse?: string[];
  /** 2-3 JSON usage examples for the LLM */
  examples?: Array<Record<string, unknown>>;
  /** OpenAI function-calling parameter schema */
  parameters: Record<string, unknown>;
  /** Whether this tool only reads data and doesn't modify anything (default: false = destructive) */
  isReadOnly: boolean;
  /** Whether this tool performs irreversible/destructive operations (default: true) */
  isDestructive: boolean;
  /** Whether this tool is safe to run concurrently (default: false) */
  isConcurrencySafe: boolean;
  /** Permission mode: open=auto-allow, restricted=auto-allow with logging, sandboxed=readonly-only */
  permissionMode: 'open' | 'restricted' | 'sandboxed';
  /** Optional input validator — returns { valid, message } */
  validateInput?: (input: Record<string, unknown>) => { valid: boolean; message?: string };
}

/** Result from a tool execution */
export interface ToolResult {
  success: boolean;
  result: string;
  error?: string;
}

/** Context passed to tool handlers from the caller */
export interface ToolContext {
  agentId?: string;
  conversationId?: string;
  autonomous?: boolean;
}

/** Token budget tracker for context management */
export interface TokenBudget {
  /** Maximum input tokens the model can handle */
  maxInputTokens: number;
  /** Estimated tokens used by the system prompt */
  systemPromptTokens: number;
  /** Reserved tokens for the model's reply */
  reservedTokens: number;
}

// ── Default constants ───────────────────────────────────────────────

export const TOOL_DEFAULTS: Omit<AgentTool, 'name' | 'description' | 'parameters'> = {
  isReadOnly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  permissionMode: 'restricted',
};

export const DEFAULT_MAX_ITERATIONS = 10;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
export const MAX_TOOL_RESULT_LENGTH = 4000;
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  maxInputTokens: 32000,
  systemPromptTokens: 2000,
  reservedTokens: 2000,
};

// ── Permission Pipeline Types ─────────────────────────────────────

export interface PermissionPipelineConfig {
  mode: 'default' | 'auto' | 'plan';
  agentId?: string;
  autonomous?: boolean;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  stage?: string;
  requiresConfirmation?: boolean;
}

// ── Helper: Convert AgentTool to OpenAI function-calling format ─────

export function agentToolToOpenAI(tool: AgentTool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  // Build rich description with whenToUse/whenNotToUse guidance
  let enrichedDescription = tool.description;

  if (tool.whenToUse && tool.whenToUse.length > 0) {
    enrichedDescription += '\n\nWhen to use:\n' + tool.whenToUse.map(s => `- ${s}`).join('\n');
  }

  if (tool.whenNotToUse && tool.whenNotToUse.length > 0) {
    enrichedDescription += '\n\nWhen NOT to use:\n' + tool.whenNotToUse.map(s => `- ${s}`).join('\n');
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: enrichedDescription,
      parameters: tool.parameters,
    },
  };
}
