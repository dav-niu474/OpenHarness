// =============================================================================
// OpenHarness Agent — Memory System (Phase 3: Three-Layer Memory Architecture)
// =============================================================================
// Based on Claude Code's memory design:
//   Layer 1: Conversation memory (automatic, in-session)
//   Layer 2: Session-spanning memory (DB-backed, persistent key-value)
//   Layer 3: Knowledge base (Skill system, on-demand loading)
//
// This module handles Layer 2: Memory injection + extraction.
// =============================================================================

import { db } from '@/lib/db';

// ── Memory Types ────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  agentId: string;
  key: string;
  value: string;
  category: 'preference' | 'context' | 'fact' | 'instruction';
  updatedAt: Date;
}

// ── Memory Injection ────────────────────────────────────────────────

/**
 * buildMemorySection — Load memories from DB and format them for system prompt injection.
 *
 * Loads up to `maxMemories` most-recently-updated memory entries for the given agent.
 * Formats them as a structured section that the LLM can reference.
 */
export async function buildMemorySection(
  agentId: string,
  maxMemories: number = 10,
): Promise<string> {
  if (!agentId) return '';

  try {
    const memories = await db.memory.findMany({
      where: { agentId },
      orderBy: { updatedAt: 'desc' },
      take: maxMemories,
    });

    if (memories.length === 0) return '';

    const memoryLines = memories.map(m => {
      const catIcon = getCategoryIcon(m.category);
      return `${catIcon} **${m.key}**: ${m.value}`;
    });

    return `
## Memory (Your Persistent Knowledge)
The following facts have been learned from previous conversations. Use them when relevant to provide personalized responses:

${memoryLines.join('\n')}

Remember: You can save new memories using the MemorySave tool during this conversation.
`;
  } catch (err) {
    console.error('Failed to load memories:', err);
    return '';
  }
}

/**
 * buildMemorySectionLightweight — Return just memory keys/categories without values.
 * Used for the initial prompt to save tokens, with on-demand loading via tools.
 */
export async function buildMemorySectionLightweight(
  agentId: string,
): Promise<string> {
  if (!agentId) return '';

  try {
    const memories = await db.memory.findMany({
      where: { agentId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { key: true, category: true },
    });

    if (memories.length === 0) return '';

    const categories = new Set(memories.map(m => m.category));
    const categorySummary = Array.from(categories)
      .map(cat => {
        const count = memories.filter(m => m.category === cat).length;
        return `${getCategoryIcon(cat as string)} ${cat}: ${count} entries`;
      })
      .join(' | ');

    const keys = memories.map(m => m.key).join(', ');

    return `
## Memory (${memories.length} entries)
${categorySummary}
Topics: ${keys}
Use MemorySearch tool to retrieve specific memories when needed.
`;
  } catch {
    return '';
  }
}

// ── Memory Operations ───────────────────────────────────────────────

/**
 * saveMemory — Save or update a memory entry for an agent.
 * Uses upsert to handle both new and existing entries.
 */
export async function saveMemory(
  agentId: string,
  key: string,
  value: string,
  category: string = 'context',
): Promise<{ success: boolean; memory?: MemoryEntry; error?: string }> {
  if (!agentId || !key || !value) {
    return { success: false, error: 'agentId, key, and value are required.' };
  }

  const validCategories = ['preference', 'context', 'fact', 'instruction'];
  if (!validCategories.includes(category)) {
    category = 'context';
  }

  try {
    const memory = await db.memory.upsert({
      where: {
        agentId_key: { agentId, key },
      },
      create: { agentId, key, value, category },
      update: { value, category, updatedAt: new Date() },
    });

    return {
      success: true,
      memory: {
        id: memory.id,
        agentId: memory.agentId,
        key: memory.key,
        value: memory.value,
        category: memory.category as MemoryEntry['category'],
        updatedAt: memory.updatedAt,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save memory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * searchMemory — Search memories by keyword or category.
 */
export async function searchMemory(
  agentId: string,
  query?: string,
  category?: string,
  limit: number = 10,
): Promise<{ success: boolean; memories: MemoryEntry[]; error?: string }> {
  if (!agentId) {
    return { success: false, memories: [], error: 'agentId is required.' };
  }

  try {
    const where: Record<string, unknown> = { agentId };
    if (category) where.category = category;
    if (query) {
      // Simple keyword search: match key or value
      where.OR = [
        { key: { contains: query } },
        { value: { contains: query } },
      ];
    }

    const memories = await db.memory.findMany({
      where: Object.keys(where).length > 1 ? where : { agentId },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 50),
    });

    return {
      success: true,
      memories: memories.map(m => ({
        id: m.id,
        agentId: m.agentId,
        key: m.key,
        value: m.value,
        category: m.category as MemoryEntry['category'],
        updatedAt: m.updatedAt,
      })),
    };
  } catch (err) {
    return {
      success: false,
      memories: [],
      error: `Failed to search memories: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * deleteMemory — Delete a memory entry.
 */
export async function deleteMemory(
  agentId: string,
  key: string,
): Promise<{ success: boolean; error?: string }> {
  if (!agentId || !key) {
    return { success: false, error: 'agentId and key are required.' };
  }

  try {
    await db.memory.delete({
      where: { agentId_key: { agentId, key } },
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete memory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * listMemory — List all memories for an agent.
 */
export async function listMemory(
  agentId: string,
  limit: number = 20,
): Promise<{ success: boolean; memories: MemoryEntry[]; error?: string }> {
  return searchMemory(agentId, undefined, undefined, limit);
}

// ── Memory Extraction (Auto-Learn) ──────────────────────────────────

/**
 * extractAndSaveMemories — Analyze conversation and extract learnable facts.
 *
 * This is a lightweight implementation that uses heuristic patterns to detect
 * user preferences, facts, and instructions mentioned in conversation.
 * A full implementation would use an LLM to extract structured memories.
 */
export async function extractAndSaveMemories(
  agentId: string,
  userMessage: string,
): Promise<{ saved: number; keys: string[] }> {
  if (!agentId || !userMessage) return { saved: 0, keys: [] };

  const savedKeys: string[] = [];
  const patterns: Array<{ pattern: RegExp; category: string; keyPrefix: string }> = [
    // "I prefer X" / "I like X" / "I always use X"
    { pattern: /(?:i prefer|i like|i always use|i usually use|i love)\s+(.+)/gi, category: 'preference', keyPrefix: 'preference' },
    // "Remember that X" / "Don't forget X"
    { pattern: /(?:remember that|don't forget|note that|keep in mind)\s+(.+)/gi, category: 'instruction', keyPrefix: 'instruction' },
    // "My name is X" / "I'm a X"
    { pattern: /(?:my name is|i'm a|i am a|i work as|i'm called)\s+(.+)/gi, category: 'fact', keyPrefix: 'fact' },
  ];

  for (const { pattern, category, keyPrefix } of patterns) {
    const matches = userMessage.matchAll(pattern);
    for (const match of matches) {
      const value = match[1]?.trim();
      if (value && value.length > 5 && value.length < 200) {
        const key = `${keyPrefix}_${Date.now()}_${savedKeys.length}`;
        const result = await saveMemory(agentId, key, value, category);
        if (result.success) {
          savedKeys.push(key);
        }
      }
    }
  }

  return { saved: savedKeys.length, keys: savedKeys };
}

// ── Utility ─────────────────────────────────────────────────────────

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'preference': return '👤';
    case 'context': return '📋';
    case 'fact': return '📌';
    case 'instruction': return '⚙️';
    default: return '📝';
  }
}
