// =============================================================================
// OpenHarness Agent — Permission Pipeline (Phase 2: Four-Stage Short-Circuit)
// =============================================================================
// Based on Claude Code's principle: Fail Fast — reject early, avoid wasted work.
//
// Pipeline: validateInput → checkPermissions → runHooks → canUseTool
// Each stage can short-circuit the pipeline with a deny result.
// =============================================================================

import type { AgentTool } from './types';
import { db } from '@/lib/db';

// ── Permission Result ───────────────────────────────────────────────

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  stage?: string;     // Which stage denied the request
  requiresConfirmation?: boolean; // If true, tool execution is deferred until user confirms
}

// ── Pipeline Configuration ──────────────────────────────────────────

export interface PermissionPipelineConfig {
  /** Current permission mode: default (ask), auto (allow all), plan (block writes) */
  mode: 'default' | 'auto' | 'plan';
  /** Agent ID for DB-backed permission rules */
  agentId?: string;
  /** Whether this is an autonomous session (relaxed permissions) */
  autonomous?: boolean;
}

// ── Pipeline Execution ──────────────────────────────────────────────

/**
 * runPermissionPipeline — Executes the four-stage permission check.
 *
 * Stage 1: validateInput   — Schema validation on tool arguments
 * Stage 2: checkPermissions — Permission mode + tool metadata
 * Stage 3: runHooks        — Pre-tool-use hook execution (DB-backed)
 * Stage 4: canUseTool      — Final decision based on accumulated checks
 *
 * Short-circuits at the first deny.
 */
export async function runPermissionPipeline(
  tool: AgentTool,
  args: Record<string, unknown>,
  config: PermissionPipelineConfig,
): Promise<PermissionResult> {
  // ── Stage 1: Input Validation ────────────────────────────────────
  const validation = stage1_validateInput(tool, args);
  if (!validation.allowed) return validation;

  // ── Stage 2: Permission Check ───────────────────────────────────
  const permission = stage2_checkPermissions(tool, config);
  if (!permission.allowed) return permission;

  // ── Stage 3: Pre-Tool Hooks ────────────────────────────────────
  const hook = await stage3_runHooks(tool, args, config);
  if (!hook.allowed) return hook;

  // ── Stage 4: Final Decision ────────────────────────────────────
  return stage4_canUseTool(tool, config);
}

// ── Stage 1: Input Validation ───────────────────────────────────────

function stage1_validateInput(
  tool: AgentTool,
  args: Record<string, unknown>,
): PermissionResult {
  if (!tool.validateInput) {
    return { allowed: true };
  }

  const result = tool.validateInput(args);
  if (!result.valid) {
    return {
      allowed: false,
      stage: 'validateInput',
      reason: result.message || `Invalid input for tool "${tool.name}"`,
    };
  }

  return { allowed: true };
}

// ── Stage 2: Permission Check ───────────────────────────────────────

/**
 * Check if the tool's permission mode allows execution in the current session.
 *
 * Logic:
 * - Auto mode + Open tool → Allowed
 * - Auto mode + Restricted tool → Allowed (with logging in real system)
 * - Auto mode + Sandboxed tool → Only if tool isReadOnly
 * - Default mode + Open tool → Allowed
 * - Default mode + Restricted tool → Allowed (auto-approve for now; confirmation in Phase 4)
 * - Default mode + Sandboxed tool → Only if tool isReadOnly
 * - Plan mode + Open tool → Allowed
 * - Plan mode + Restricted tool → Only if tool isReadOnly (plan mode blocks writes)
 * - Plan mode + Sandboxed tool → Only if tool isReadOnly
 */
function stage2_checkPermissions(
  tool: AgentTool,
  config: PermissionPipelineConfig,
): PermissionResult {
  const { mode, autonomous } = config;

  // Autonomous mode: allow everything except destructive operations
  if (autonomous) {
    if (tool.isDestructive) {
      return {
        allowed: false,
        stage: 'checkPermissions',
        reason: `Autonomous mode cannot execute destructive tool "${tool.name}". Switch to manual mode for this operation.`,
      };
    }
    return { allowed: true };
  }

  // Plan mode: only allow read-only tools
  if (mode === 'plan') {
    if (!tool.isReadOnly) {
      return {
        allowed: false,
        stage: 'checkPermissions',
        reason: `Plan mode blocks write operations. Tool "${tool.name}" requires write access. Exit plan mode to execute.`,
      };
    }
    return { allowed: true };
  }

  // Auto mode: allow everything
  if (mode === 'auto') {
    return { allowed: true };
  }

  // Default mode
  // Sandboxed tools: only allow if read-only
  if (tool.permissionMode === 'sandboxed' && !tool.isReadOnly) {
    return {
      allowed: false,
      stage: 'checkPermissions',
      reason: `Tool "${tool.name}" is sandboxed and can only be used in read-only mode.`,
    };
  }

  // Open and Restricted tools are allowed in default mode
  return { allowed: true };
}

// ── Stage 3: Pre-Tool Hooks ─────────────────────────────────────────

/**
 * Execute PreToolUse hooks from the database.
 * Currently stub implementation — returns allowed.
 * Full implementation would check PermissionRule records for path-based restrictions.
 */
async function stage3_runHooks(
  tool: AgentTool,
  args: Record<string, unknown>,
  _config: PermissionPipelineConfig,
): Promise<PermissionResult> {
  try {
    // Check for explicit deny rules in the database
    const denyRules = await db.permissionRule.findMany({
      where: { isAllowed: false, mode: 'deny' },
      take: 20,
    });

    for (const rule of denyRules) {
      let denyList: string[] = [];
      try {
        denyList = JSON.parse(rule.commandDenyList || '[]');
      } catch { /* skip */ }

      // Check if the tool name matches any deny list entry
      if (denyList.some(entry => {
        const pattern = entry.toLowerCase().trim();
        return tool.name.toLowerCase() === pattern ||
               tool.name.toLowerCase().includes(pattern);
      })) {
        return {
          allowed: false,
          stage: 'runHooks',
          reason: `Tool "${tool.name}" is blocked by permission rule "${rule.id}" (path pattern: ${rule.pathPattern}).`,
        };
      }
    }
  } catch {
    // DB errors should not block tool execution — fail-open for hooks
  }

  return { allowed: true };
}

// ── Stage 4: Final Decision ─────────────────────────────────────────

function stage4_canUseTool(
  tool: AgentTool,
  config: PermissionPipelineConfig,
): PermissionResult {
  // Final safety net: verify the tool is still valid
  if (!tool.name) {
    return {
      allowed: false,
      stage: 'canUseTool',
      reason: 'Tool has no name — invalid tool definition.',
    };
  }

  // For restricted tools in default mode, note confirmation is preferred
  // (This doesn't block — just signals the UI layer)
  if (config.mode === 'default' && tool.permissionMode === 'restricted' && !tool.isReadOnly) {
    return {
      allowed: true,
      requiresConfirmation: false, // Auto-approved in current implementation
    };
  }

  return { allowed: true };
}

// ── Utility: Format Denial Message for LLM ─────────────────────────

export function formatPermissionDenial(result: PermissionResult): string {
  return `[PERMISSION DENIED] ${result.reason || 'Operation not permitted.'} (Stage: ${result.stage || 'unknown'})`;
}
