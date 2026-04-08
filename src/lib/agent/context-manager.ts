// =============================================================================
// OpenHarness Agent — Context Manager (Phase 2: Progressive Compression)
// =============================================================================
// Based on Claude Code's four-level compression:
//   Snip (70%) → Microcompact (85%) → Context Collapse (90%) → Autocompact (95%)
//
// Simplified to two strategies for this implementation:
//   Snip (75%) — cheap: keep system + first user msg + recent N messages
//   Summary (90%) — moderate: LLM generates a summary of old messages
// =============================================================================

import type { LLMMessage } from '@/lib/llm';
import { chat } from '@/lib/llm';
import type { TokenBudget } from './types';

// ── Compression Result ──────────────────────────────────────────────

export interface CompressionResult {
  messages: LLMMessage[];
  strategy: 'none' | 'snip' | 'summary';
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  compressionRatio: number;
}

// ── Token Estimation ────────────────────────────────────────────────

/**
 * estimateTokens — Rough token count estimation.
 * Uses the ~4 characters per token heuristic for English text.
 * Chinese text averages ~1.5 characters per token, so we use ~3 chars/token as a middle ground.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters separately (they use ~1.5 chars per token)
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const nonCjkChars = text.length - cjkChars;
  return Math.ceil(cjkChars / 1.5 + nonCjkChars / 4);
}

/**
 * estimateMessagesTokens — Estimate total tokens for an array of messages.
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content || '');
    if (msg.role === 'assistant' && msg.tool_calls) {
      total += estimateTokens(JSON.stringify(msg.tool_calls));
    }
    // Add small overhead per message for role/formatting tokens
    total += 10;
  }
  return total;
}

/**
 * getAvailableTokenBudget — Calculate how many tokens are available for messages.
 */
export function getAvailableTokenBudget(budget: TokenBudget): number {
  return budget.maxInputTokens - budget.systemPromptTokens - budget.reservedTokens;
}

// ── Compression Decision ────────────────────────────────────────────

/**
 * shouldCompress — Decide whether compression is needed based on current token count.
 *
 * @returns The recommended compression strategy, or 'none' if no compression needed.
 */
export function shouldCompress(
  currentTokens: number,
  budget: TokenBudget,
): 'none' | 'snip' | 'summary' {
  const available = getAvailableTokenBudget(budget);
  const ratio = currentTokens / available;

  if (ratio < 0.75) return 'none';
  if (ratio < 0.90) return 'snip';
  return 'summary';
}

// ── Snip Strategy (Cheap) ───────────────────────────────────────────

/**
 * snipCompress — Remove old messages, keep: system + first user msg + recent N messages.
 *
 * This is the cheapest compression: no LLM call needed.
 * Preserves the system prompt, the original user request, and recent context.
 */
export function snipCompress(
  messages: LLMMessage[],
  maxRecentMessages: number = 15,
): CompressionResult {
  const originalTokens = estimateMessagesTokens(messages);

  if (messages.length <= maxRecentMessages + 2) {
    // No compression needed — already short enough
    return {
      messages,
      strategy: 'none',
      originalTokens,
      compressedTokens: originalTokens,
      savedTokens: 0,
      compressionRatio: 1,
    };
  }

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  // Find the first user message (the original request)
  const firstUserIdx = nonSystemMessages.findIndex(m => m.role === 'user');
  const firstUserMessage = firstUserIdx >= 0 ? [nonSystemMessages[firstUserIdx]] : [];

  // Take the most recent messages
  const recentStart = Math.max(0, nonSystemMessages.length - maxRecentMessages);
  const recentMessages = nonSystemMessages.slice(recentStart);

  // Deduplicate: make sure firstUserMessage isn't also in recentMessages
  const compressed = [
    ...systemMessages,
    ...firstUserMessage,
    ...recentMessages.filter(m => !(firstUserMessage.length > 0 && m === firstUserMessage[0])),
  ];

  const compressedTokens = estimateMessagesTokens(compressed);

  return {
    messages: compressed,
    strategy: 'snip',
    originalTokens,
    compressedTokens,
    savedTokens: originalTokens - compressedTokens,
    compressionRatio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
  };
}

// ── Summary Strategy (Moderate Cost) ────────────────────────────────

/**
 * summaryCompress — Use LLM to generate a summary of old messages.
 *
 * Keeps:
 * - All system messages
 * - A generated summary of old messages (replaced)
 * - The most recent N messages in full
 */
export async function summaryCompress(
  messages: LLMMessage[],
  modelId: string,
  keepRecentCount: number = 10,
): Promise<CompressionResult> {
  const originalTokens = estimateMessagesTokens(messages);

  if (messages.length <= keepRecentCount + 2) {
    return {
      messages,
      strategy: 'none',
      originalTokens,
      compressedTokens: originalTokens,
      savedTokens: 0,
      compressionRatio: 1,
    };
  }

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  // Split into old (to summarize) and recent (to keep in full)
  const splitIdx = Math.max(0, nonSystemMessages.length - keepRecentCount);
  const oldMessages = nonSystemMessages.slice(0, splitIdx);
  const recentMessages = nonSystemMessages.slice(splitIdx);

  if (oldMessages.length === 0) {
    return {
      messages,
      strategy: 'none',
      originalTokens,
      compressedTokens: originalTokens,
      savedTokens: 0,
      compressionRatio: 1,
    };
  }

  // Generate summary of old messages
  const summary = await generateSummary(oldMessages, modelId);

  // Build compressed message list
  const compressed: LLMMessage[] = [
    ...systemMessages,
    {
      role: 'user',
      content: `[Previous Conversation Summary]\n${summary}`,
    },
    {
      role: 'assistant',
      content: 'Understood. I have the context from the previous conversation. Please continue.',
    },
    ...recentMessages,
  ];

  const compressedTokens = estimateMessagesTokens(compressed);

  return {
    messages: compressed,
    strategy: 'summary',
    originalTokens,
    compressedTokens,
    savedTokens: originalTokens - compressedTokens,
    compressionRatio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
  };
}

// ── Summary Generation ──────────────────────────────────────────────

/**
 * generateSummary — Ask the LLM to create a concise summary of the old messages.
 */
async function generateSummary(
  messages: LLMMessage[],
  modelId: string,
): Promise<string> {
  // Build a condensed version of the old messages for the summarizer
  const condensed = messages.map(m => {
    const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role;
    const content = (m.content || '').slice(0, 500); // Truncate long messages
    return `[${role}]: ${content}`;
  }).join('\n');

  try {
    const response = await chat(
      [
        {
          role: 'system',
          content: 'You are a conversation summarizer. Create a concise summary of the following conversation that preserves: 1) The user\'s original intent/request, 2) Key information discovered or discussed, 3) Any decisions made or conclusions reached, 4) Current state of the task. Keep the summary under 500 words. Use markdown formatting.',
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${condensed}`,
        },
      ],
      modelId,
    );

    return response.content || 'Unable to generate summary.';
  } catch {
    // Fallback: simple extraction-based summary
    return generateFallbackSummary(messages);
  }
}

/**
 * generateFallbackSummary — Simple fallback when LLM summarization fails.
 * Extracts key information from old messages without calling the LLM.
 */
function generateFallbackSummary(messages: LLMMessage[]): string {
  const lines: string[] = [];
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  lines.push(`**Conversation covered ${messages.length} messages (${userMessages.length} user, ${assistantMessages.length} assistant).**`);

  // Include first user message (original intent)
  if (userMessages.length > 0) {
    lines.push(`\n**Original request:** ${userMessages[0].content?.slice(0, 200) || '(empty)'}`);
  }

  // Include last assistant message (latest state)
  if (assistantMessages.length > 0) {
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    lines.push(`\n**Last response summary:** ${lastAssistant.content?.slice(0, 300) || '(empty)'}...`);
  }

  return lines.join('\n');
}

// ── Auto Compress (Unified Entry Point) ─────────────────────────────

/**
 * autoCompress — Automatically choose and apply the best compression strategy.
 *
 * @param messages - Current message array
 * @param modelId - Model to use for LLM-based summarization
 * @param budget - Token budget configuration
 * @returns Compressed messages + compression result metadata
 */
export async function autoCompress(
  messages: LLMMessage[],
  modelId: string,
  budget: TokenBudget,
): Promise<CompressionResult> {
  const currentTokens = estimateMessagesTokens(messages);
  const strategy = shouldCompress(currentTokens, budget);

  if (strategy === 'none') {
    return {
      messages,
      strategy: 'none',
      originalTokens: currentTokens,
      compressedTokens: currentTokens,
      savedTokens: 0,
      compressionRatio: 1,
    };
  }

  if (strategy === 'snip') {
    return snipCompress(messages);
  }

  // strategy === 'summary'
  return summaryCompress(messages, modelId);
}
