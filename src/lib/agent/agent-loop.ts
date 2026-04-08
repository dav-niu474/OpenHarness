// =============================================================================
// OpenHarness Agent — Agent Loop (Phase 1: AsyncGenerator + State + Circuit Breaker)
// =============================================================================
// Core agent loop following Claude Code's architecture:
// - while(true) + State object + continue
// - AsyncGenerator for streaming SSE events
// - Circuit breaker (3 consecutive failures → trip)
// - Token budget tracking
// =============================================================================

import type { LLMMessage } from '@/lib/llm';
import { chatStream, getModelInfo } from '@/lib/llm';
import type { StreamEvent, LoopState, ToolCallRecord, TaskPlanEvent, TokenUsage, ToolContext } from './types';
import { DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_CONSECUTIVE_FAILURES } from './types';
import { executeTool } from './tools';

// ── Agent Loop Configuration ────────────────────────────────────────

export interface AgentLoopConfig {
  /** LLM model ID to use */
  modelId: string;
  /** Max agent loop iterations (default: 10) */
  maxIterations?: number;
  /** Max consecutive tool failures before circuit breaker (default: 3) */
  maxConsecutiveFailures?: number;
  /** Whether this is an autonomous session */
  autonomous?: boolean;
  /** Tool context passed to tool handlers */
  toolContext?: ToolContext;
}

// ── Create Initial Loop State ───────────────────────────────────────

export function createLoopState(
  messages: LLMMessage[],
  config: AgentLoopConfig,
): LoopState {
  return {
    messages,
    turnCount: 0,
    maxIterations: config.maxIterations || DEFAULT_MAX_ITERATIONS,
    fullThinking: '',
    fullContent: '',
    usageData: null,
    toolCallsHistory: [],
    consecutiveFailures: 0,
    maxConsecutiveFailures: config.maxConsecutiveFailures || DEFAULT_MAX_CONSECUTIVE_FAILURES,
    isPlanningPhase: false,
    lastTaskPlan: null,
    abortController: new AbortController(),
  };
}

// ── Core Agent Loop (AsyncGenerator) ────────────────────────────────

/**
 * runAgentLoop — The core agent loop implemented as an AsyncGenerator.
 * Yields StreamEvent objects that the caller converts to SSE data.
 *
 * Architecture:
 *   while (turnCount < maxIterations) {
 *     1. Check abort signal
 *     2. Check circuit breaker
 *     3. Stream LLM response, accumulate thinking/content/tool_calls
 *     4. No tool calls → break (conversation complete)
 *     5. Execute tools with circuit breaker tracking
 *     6. Push tool results into messages, continue loop
 *   }
 */
export async function* runAgentLoop(
  state: LoopState,
  config: AgentLoopConfig,
): AsyncGenerator<StreamEvent, void, undefined> {
  const modelInfo = getModelInfo(config.modelId);
  const toolDefs = (await import('./tools')).getToolDefinitions();

  try {
    // ── Main Loop ────────────────────────────────────────────────
    while (state.turnCount < state.maxIterations) {
      state.turnCount++;

      // Step 1: Check abort signal
      if (state.abortController.signal.aborted) {
        yield { type: 'error', error: 'Agent loop aborted by user.' };
        return;
      }

      // Step 2: Check circuit breaker
      if (state.consecutiveFailures >= state.maxConsecutiveFailures) {
        yield { type: 'error', error: `Circuit breaker tripped: ${state.consecutiveFailures} consecutive tool failures. Stopping to prevent waste.` };
        // Don't return — let the LLM see the error and respond naturally
        state.messages.push({
          role: 'user',
          content: `[SYSTEM NOTICE] ${state.consecutiveFailures} consecutive tool failures detected. Please summarize what you were trying to accomplish and explain the issue to the user. Do not attempt further tool calls.`,
        });
        // One more iteration to let the LLM respond
        const finalEvents = yield* streamLLMResponse(state, config.modelId, toolDefs, modelInfo.name);
        yield* finalEvents;
        break;
      }

      // Notify about loop iteration (except first)
      if (state.turnCount > 1) {
        yield {
          type: 'loop_iteration',
          iteration: state.turnCount,
          maxIterations: state.maxIterations,
          model: modelInfo.name,
        };
      }

      // Step 3: Stream LLM response
      const toolCalls = yield* streamLLMResponse(state, config.modelId, toolDefs, modelInfo.name);

      // Step 4: No tool calls → conversation complete
      if (toolCalls.length === 0) break;

      // Step 5: Execute tools
      // First, add assistant message with tool_calls to the message history
      state.messages.push({
        role: 'assistant',
        content: '', // Content was accumulated in streamLLMResponse
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // End planning phase when executing tools
      if (state.isPlanningPhase) {
        state.isPlanningPhase = false;
      }

      // Execute each tool call
      for (const tc of toolCalls) {
        const startTime = Date.now();

        // Emit special task_plan event for TaskPlan tool
        if (tc.name === 'TaskPlan') {
          const planEvent = parseTaskPlanArgs(tc.arguments);
          state.lastTaskPlan = planEvent;
          yield {
            type: 'task_plan',
            title: planEvent.title,
            steps: planEvent.steps,
            complexity: planEvent.complexity,
            completedSteps: planEvent.completedSteps,
          };
        }

        yield { type: 'tool_executing', toolCallId: tc.id, name: tc.name };

        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(tc.arguments); } catch { /* keep empty */ }

        const result = await executeTool(tc.name, parsedArgs, config.toolContext);
        const duration = Date.now() - startTime;

        // Track in history
        const record: ToolCallRecord = {
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          result: result.success ? result.result : result.error || 'Unknown error',
          success: result.success,
          duration,
          iteration: state.turnCount,
        };
        state.toolCallsHistory.push(record);

        // Circuit breaker tracking
        if (!result.success) {
          state.consecutiveFailures++;
        } else {
          state.consecutiveFailures = 0; // Reset on success
        }

        yield {
          type: 'tool_result',
          toolCallId: tc.id,
          name: tc.name,
          result: record.result,
          success: result.success,
          duration,
          iteration: state.turnCount,
        };

        // Add tool result to message history
        state.messages.push({
          role: 'tool',
          content: result.success ? result.result : `Error: ${result.error || 'Unknown error'}`,
          tool_call_id: tc.id,
        });
      }
    }

    // ── Final done event ─────────────────────────────────────────
    yield {
      type: 'done',
      usage: state.usageData,
      model: modelInfo.name,
      modelId: modelInfo.id,
      provider: modelInfo.provider,
      thinkingLength: state.fullThinking.length,
      toolCalls: state.toolCallsHistory.length > 0 ? state.toolCallsHistory : undefined,
      loopIterations: state.turnCount,
      autonomous: !!config.autonomous,
    };
  } catch (error) {
    yield {
      type: 'done',
      usage: state.usageData,
      model: modelInfo.name,
      modelId: modelInfo.id,
      provider: modelInfo.provider,
      thinkingLength: state.fullThinking.length,
      toolCalls: state.toolCallsHistory.length > 0 ? state.toolCallsHistory : undefined,
      loopIterations: state.turnCount,
      autonomous: !!config.autonomous,
      error: String(error),
    };
  }
}

// ── Stream LLM Response (Internal) ──────────────────────────────────

/**
 * Stream a single LLM response and yield events.
 * Returns the accumulated tool calls for the caller to execute.
 */
async function* streamLLMResponse(
  state: LoopState,
  modelId: string,
  toolDefs: ReturnType<typeof import('./tools').getToolDefinitions>,
  modelName: string,
): AsyncGenerator<StreamEvent, AccumulatedToolCall[], void> {
  const providerStream = await chatStream(state.messages, modelId, toolDefs);
  const reader = providerStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Accumulators for this iteration
  const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
  let iterationThinking = '';
  let iterationContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;

            // Thinking content
            const thinkingContent = delta?.reasoning_content;
            if (thinkingContent) {
              state.fullThinking += thinkingContent;
              iterationThinking += thinkingContent;
              yield { type: 'thinking', content: thinkingContent, model: modelName };
            }

            // Regular content
            const content = delta?.content;
            if (content) {
              state.fullContent += content;
              iterationContent += content;

              // Detect planning phase
              if (!state.isPlanningPhase && (state.fullContent.includes('- [ ]') || state.fullContent.includes('Task Plan'))) {
                state.isPlanningPhase = true;
                yield { type: 'planning', content: 'Agent is creating a task plan...' };
              }

              yield { type: 'token', content, model: modelName };
            }

            // Tool calls
            const toolCalls = delta?.tool_calls;
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (tc.id) {
                  toolCallsAccumulator[tc.index ?? 0] = {
                    id: tc.id,
                    name: tc.function?.name || 'unknown',
                    arguments: tc.function?.arguments || '',
                  };
                } else if (toolCallsAccumulator[tc.index ?? 0]) {
                  toolCallsAccumulator[tc.index ?? 0].arguments += (tc.function?.arguments || '');
                }

                const acc = toolCallsAccumulator[tc.index ?? 0];
                if (acc) {
                  yield {
                    type: 'tool_call',
                    toolCallId: acc.id,
                    name: acc.name,
                    arguments: acc.arguments,
                    done: !tc.function?.arguments,
                    iteration: state.turnCount,
                  };
                }
              }
            }

            // Usage tracking
            if (json.usage) {
              state.usageData = json.usage as TokenUsage;
            }
          } catch {
            // Not valid JSON — skip
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const thinkingContent = delta?.reasoning_content;
          if (thinkingContent) {
            state.fullThinking += thinkingContent;
            iterationThinking += thinkingContent;
            yield { type: 'thinking', content: thinkingContent, model: modelName };
          }
          const content = delta?.content;
          if (content) {
            state.fullContent += content;
            iterationContent += content;
            yield { type: 'token', content, model: modelName };
          }
          if (json.usage) state.usageData = json.usage as TokenUsage;
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Return accumulated tool calls
  return Object.values(toolCallsAccumulator);
}

// ── Helper Types ────────────────────────────────────────────────────

interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function parseTaskPlanArgs(argsStr: string): TaskPlanEvent {
  try {
    const args = JSON.parse(argsStr);
    return {
      title: String(args.title || 'Untitled Plan'),
      steps: Array.isArray(args.steps) ? args.steps.map((s: unknown) => String(s)) : [],
      complexity: String(args.complexity || 'moderate'),
      completedSteps: [],
    };
  } catch {
    return { title: 'Untitled Plan', steps: [], complexity: 'moderate', completedSteps: [] };
  }
}
