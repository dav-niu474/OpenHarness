import { NextRequest } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { getModelInfo, type LLMMessage } from '@/lib/llm';
import { runAgentLoop, createLoopState, type AgentLoopConfig } from '@/lib/agent/agent-loop';
import type { ToolContext } from '@/lib/agent/tools';
import { buildMemorySectionLightweight } from '@/lib/agent/memory';

export const dynamic = 'force-dynamic';

// ── Agent ID Mapping ────────────────────────────────────────────────

const AGENT_ID_MAP: Record<string, string> = {
  alpha: 'seed-alpha',
  beta: 'seed-beta',
  gamma: 'seed-gamma',
};

// ── POST Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { agentId, message, conversationId, modelId, model, skillIds, autonomous } = await req.json();
    const effectiveModelReqId = modelId || model;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Resolve Agent ────────────────────────────────────────────
    const dbAgentId = AGENT_ID_MAP[agentId] || agentId || null;

    // ── Determine Model ──────────────────────────────────────────
    let effectiveModelId = effectiveModelReqId || 'z-ai/glm4.7';
    let systemPrompt = buildBaseSystemPrompt();
    let agentData: { agentMd?: string; soulPrompt?: string; boundSkills?: string; systemPrompt?: string; provider?: string; model?: string } | null = null;

    if (dbAgentId) {
      const agent = await db.agent.findUnique({ where: { id: dbAgentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        agentData = {
          agentMd: agent.agentMd || '',
          soulPrompt: agent.soulPrompt || '',
          boundSkills: agent.boundSkills || '[]',
          systemPrompt: agent.systemPrompt || undefined,
          provider: agent.provider || undefined,
          model: agent.model || undefined,
        };
        if (!modelId && agent.provider === 'nvidia' && agent.model) {
          effectiveModelId = agent.model;
        }
      }
    }

    // ── Build System Prompt (Phase 3: Memory + Lightweight Skills) ─────
    const memorySection = await buildMemorySectionLightweight(dbAgentId || '');
    const skillSection = await buildSkillSectionLightweight(skillIds, agentData?.boundSkills);
    const personaSection = buildPersonaSection(agentData);
    const methodologySection = buildMethodologySection(!!autonomous);
    const finalSystemPrompt = systemPrompt + personaSection + memorySection + skillSection + methodologySection;

    const modelInfo = getModelInfo(effectiveModelId);

    // ── Build Message History ────────────────────────────────────
    const messages: LLMMessage[] = [{ role: 'system', content: finalSystemPrompt }];
    let dbConversationId: string | null = null;

    if (conversationId) {
      const conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { role: true, content: true, thinking: true, toolCalls: true, toolResults: true },
          },
        },
      });

      if (conversation) {
        dbConversationId = conversation.id;
        for (const msg of conversation.messages) {
          if (msg.role !== 'system' && msg.content) {
            messages.push({ role: msg.role as LLMMessage['role'], content: msg.content });
          }
        }
      }
    }

    messages.push({ role: 'user', content: message });

    // Save user message
    if (dbConversationId) {
      try {
        await db.message.create({
          data: { conversationId: dbConversationId, role: 'user', content: message },
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    // ── Create Agent Loop ────────────────────────────────────────
    const toolContext: ToolContext = {
      agentId: dbAgentId || undefined,
      conversationId: dbConversationId || undefined,
      autonomous: !!autonomous,
    };

    const state = createLoopState(messages, {
      modelId: effectiveModelId,
      autonomous: !!autonomous,
      toolContext,
    });

    // ── SSE ReadableStream ──────────────────────────────────────
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runAgentLoop(state, {
            modelId: effectiveModelId,
            autonomous: !!autonomous,
            toolContext,
          })) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', error: String(error) })}\n\n`,
            ),
          );
        } finally {
          // Save assistant message with full metadata
          if (dbConversationId && (state.fullContent || state.fullThinking)) {
            try {
              const toolCallsJson = state.toolCallsHistory.length > 0
                ? JSON.stringify(state.toolCallsHistory.map(tc => ({
                    id: tc.id,
                    tool: tc.name,
                    input: (() => { try { return JSON.parse(tc.arguments); } catch { return {}; } })(),
                    result: tc.result,
                    status: tc.success ? 'success' : 'error',
                    duration: tc.duration,
                  })))
                : '[]';
              const toolResultsJson = state.toolCallsHistory.length > 0
                ? JSON.stringify(state.toolCallsHistory.map(tc => ({
                    toolCallId: tc.id,
                    name: tc.name,
                    result: tc.result,
                    success: tc.success,
                    duration: tc.duration,
                  })))
                : '[]';

              await db.message.create({
                data: {
                  conversationId: dbConversationId,
                  role: 'assistant',
                  content: state.fullContent,
                  thinking: state.fullThinking,
                  toolCalls: toolCallsJson,
                  toolResults: toolResultsJson,
                  tokenCount: state.usageData?.total_tokens,
                },
              });
            } catch (dbError) {
              console.error('Failed to save assistant message:', dbError);
            }
          }

          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Agent chat stream error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ── System Prompt Builders ──────────────────────────────────────────

function buildBaseSystemPrompt(): string {
  return `You are OpenHarness AI Agent, a highly capable and intelligent assistant designed to help users accomplish complex tasks through systematic reasoning and tool usage.

## Core Identity
- You are honest, thorough, and methodical
- You think step-by-step for complex problems
- You proactively use tools when they add value
- You communicate clearly with markdown formatting

## Response Principles
1. **Think first, then act** — Analyze the request before jumping to execution
2. **Plan complex tasks** — For anything requiring 3+ steps, create a TaskPlan first
3. **Use tools wisely** — Don't use tools unnecessarily, but don't hesitate when they help
4. **Be concise but thorough** — Show your reasoning, don't repeat yourself
5. **Cite your sources** — When using WebSearch, reference the URLs you found
6. **Admit uncertainty** — If you're unsure, say so honestly`;
}

function buildPersonaSection(agentData: { agentMd?: string; soulPrompt?: string } | null): string {
  if (!agentData) return '';
  let section = '';
  if (agentData.agentMd) section += `\n\n## Agent Persona\n${agentData.agentMd}`;
  if (agentData.soulPrompt) section += `\n\n## Core Personality\n${agentData.soulPrompt}`;
  return section;
}

/**
 * buildSkillSectionLightweight — Phase 3: Only inject skill index (name + description),
 * not full content. Saves tokens. Agent uses Skill tool to load content on demand.
 */
async function buildSkillSectionLightweight(skillIds?: string[], boundSkillsStr?: string): Promise<string> {
  const skillIdsToFetch: string[] = [];

  if (Array.isArray(skillIds) && skillIds.length > 0) {
    skillIdsToFetch.push(...skillIds);
  }

  if (boundSkillsStr) {
    try {
      const bound: string[] = JSON.parse(boundSkillsStr);
      if (Array.isArray(bound)) {
        for (const id of bound) {
          if (!skillIdsToFetch.includes(id)) skillIdsToFetch.push(id);
        }
      }
    } catch { /* skip */ }
  }

  if (skillIdsToFetch.length === 0) return '';

  const skills = await db.skill.findMany({
    where: { id: { in: skillIdsToFetch } },
    select: { name: true, description: true, category: true, id: true, isLoaded: true },
  });

  if (skills.length === 0) return '';

  // Lightweight index: name + description only, no content
  const skillIndex = skills.map(s => {
    const status = s.isLoaded ? 'Active' : 'Available';
    const desc = s.description || 'No description';
    return `- **${s.name}** [${s.id}] (${s.category}, ${status}): ${desc}`;
  }).join('\n');

  return `\n\n## Available Skills (${skills.length})\n${skillIndex}\n\nUse the Skill tool with action "load" and the skill ID to load full content on demand.`;
}

function buildMethodologySection(isAutonomous: boolean): string {
  const base = `
## Working Methodology — CRITICAL

### For Complex Tasks (3+ steps, research, multi-tool workflows):
1. **Analyze**: What is the user REALLY asking? What are the implicit requirements?
2. **Plan**: Use the TaskPlan tool to create a structured plan before executing
3. **Execute**: Follow the plan step-by-step, using appropriate tools
4. **Verify**: Check your work for errors and completeness
5. **Summarize**: Provide a clear, actionable summary

### For Simple Tasks (single lookup, quick fact, greeting):
- Respond directly without creating a plan
- Use tools only if they add clear value

### Tool Usage Strategy:
- **WebSearch** → When you need current/external information
- **WebFetch** → When you need to read a specific URL's content
- **TaskPlan** → When the task has 3+ steps (ALWAYS plan first!)
- **TaskCreate/TaskUpdate** → For persistent task tracking
- **Skill** → To load specialized knowledge modules on demand
- **Agent/SendMessage** → For multi-agent collaboration
- **MemorySave/MemorySearch/MemoryList** → To remember and recall information across conversations`

  if (isAutonomous) {
    return base + `

### Autonomous Mode — Active
You are running in autonomous mode. This means:
- Maximum ${10} iterations allowed
- Create a TaskPlan at the very beginning
- Execute each step systematically
- After each major step, briefly report progress
- If a step fails, try an alternative approach before giving up
- Focus on completing the entire task, not just the first part`;
  }

  return base;
}
