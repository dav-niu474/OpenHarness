import { NextRequest } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { chatStream, getModelInfo, type LLMMessage } from '@/lib/llm';
import { getToolDefinitions, executeTool, type ToolContext } from '@/lib/tools';

export const dynamic = 'force-dynamic';

const MAX_TOOL_LOOP_ITERATIONS = 3;

const agentIdMap: Record<string, string> = {
  alpha: 'seed-alpha',
  beta: 'seed-beta',
  gamma: 'seed-gamma',
};

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { message, agentIds, conversationId, modelId, skillIds } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least 2 agentIds are required for collaborative mode' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const effectiveModelId = modelId || 'z-ai/glm4.7';
    const modelInfo = getModelInfo(effectiveModelId);
    const toolDefs = getToolDefinitions();

    // ── Load agent configs from DB ───────────────────────────────
    const agentConfigs: Array<{
      shortId: string;
      dbId: string;
      name: string;
      systemPrompt: string;
      agentMd: string;
      soulPrompt: string;
      boundSkills: string[];
    }> = [];

    for (const shortId of agentIds) {
      const dbId = agentIdMap[shortId] || shortId;
      const agent = await db.agent.findUnique({ where: { id: dbId } });
      if (agent) {
        let boundSkills: string[] = [];
        try {
          const parsed = JSON.parse(agent.boundSkills || '[]');
          if (Array.isArray(parsed)) boundSkills = parsed;
        } catch { /* skip */ }

        agentConfigs.push({
          shortId,
          dbId,
          name: agent.name,
          systemPrompt: agent.systemPrompt || '',
          agentMd: agent.agentMd || '',
          soulPrompt: agent.soulPrompt || '',
          boundSkills,
        });
      }
    }

    if (agentConfigs.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not load at least 2 agent configs from DB' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Resolve conversation ─────────────────────────────────────
    let dbConversationId: string | null = null;
    const existingMessages: LLMMessage[] = [];

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
            existingMessages.push({ role: msg.role as LLMMessage['role'], content: msg.content });
          }
        }
      }
    }

    // ── Save user message ────────────────────────────────────────
    if (dbConversationId) {
      try {
        await db.message.create({
          data: { conversationId: dbConversationId, role: 'user', content: message },
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    // ── Inject skills into system prompt ─────────────────────────
    const skillIdsToFetch: string[] = Array.isArray(skillIds) ? [...skillIds] : [];
    for (const ac of agentConfigs) {
      for (const id of ac.boundSkills) {
        if (!skillIdsToFetch.includes(id)) skillIdsToFetch.push(id);
      }
    }

    let skillSection = '';
    if (skillIdsToFetch.length > 0) {
      const skills = await db.skill.findMany({
        where: { id: { in: skillIdsToFetch } },
      });
      if (skills.length > 0) {
        const skillLines = skills.map((s) => {
          return `- **${s.name}**: ${s.description || ''} (${s.category})\n  Content: ${s.content}`;
        }).join('\n\n');
        skillSection = `\n\n## Available Skills\n${skillLines}`;
      }
    }

    // ── Create SSE ReadableStream ────────────────────────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        let totalUsage: Record<string, number> = {};
        let totalLoopIterations = 0;
        const agentResponses: Array<{ agentId: string; content: string; thinking: string }> = [];

        // Helper to send SSE event
        const send = (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          // ═══════════════════════════════════════════════════════
          // PHASE 1: COORDINATOR
          // ═══════════════════════════════════════════════════════
          send({ type: 'phase', phase: 'coordinating' });

          const coordinatorPrompt = `You are a collaborative multi-agent coordinator. Your job is to analyze the user's request and create a brief work plan that assigns specific aspects to each agent.

The available agents are:
${agentConfigs.map((ac) => `- **${ac.name}** (${ac.shortId}): ${ac.systemPrompt.split('.')[0]}`).join('\n')}

Given the following user request, create a brief work plan. For each agent, describe in one sentence what they should focus on. Be concise — just 2-3 sentences total.

User request: ${message}

Respond with ONLY the work plan, nothing else. Format:
- **AgentName**: task description`;

          const coordinatorMessages: LLMMessage[] = [
            { role: 'system', content: coordinatorPrompt },
            { role: 'user', content: message },
          ];

          let coordinatorPlan = '';
          try {
            const coordStream = await chatStream(coordinatorMessages, effectiveModelId);
            const coordReader = coordStream.getReader();
            let coordBuffer = '';

            while (true) {
              const { done, value } = await coordReader.read();
              if (done) break;
              coordBuffer += decoder.decode(value, { stream: true });
              const lines = coordBuffer.split('\n');
              coordBuffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    coordinatorPlan += content;
                    send({ type: 'coordinator_plan', content, model: modelInfo.name });
                  }
                  if (json.usage) totalUsage = { ...totalUsage, ...json.usage };
                } catch { /* skip */ }
              }
            }

            // Process remaining buffer
            if (coordBuffer.trim()) {
              const trimmed = coordBuffer.trim();
              if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) coordinatorPlan += content;
                } catch { /* skip */ }
              }
            }

            coordReader.releaseLock();
          } catch (err) {
            console.error('Coordinator error:', err);
            coordinatorPlan = `Collaborative plan: ${agentConfigs.map((a) => `${a.name} will analyze the request`).join(', ')}.`;
          }

          // Save coordinator plan to DB
          if (dbConversationId && coordinatorPlan) {
            try {
              await db.message.create({
                data: {
                  conversationId: dbConversationId,
                  role: 'assistant',
                  content: `[Coordinator Plan]\n${coordinatorPlan}`,
                },
              });
            } catch (err) {
              console.error('Failed to save coordinator plan:', err);
            }
          }

          // ═══════════════════════════════════════════════════════
          // PHASE 2: SEQUENTIAL COLLABORATIVE EXECUTION
          // ═════════════════════════════════════════════════════════
          send({ type: 'phase', phase: 'executing' });

          for (let agentIdx = 0; agentIdx < agentConfigs.length; agentIdx++) {
            const agentConf = agentConfigs[agentIdx];
            const previousContext = agentResponses.map((r) => {
              const prevAgentConf = agentConfigs.find((ac) => ac.shortId === r.agentId);
              return `**${prevAgentConf?.name || r.agentId}** said:\n${r.content}`;
            }).join('\n\n---\n\n');

            send({ type: 'phase', phase: 'executing', agentId: agentConf.shortId, agentIndex: agentIdx, totalAgents: agentConfigs.length });

            // Build system prompt for this agent
            let agentSystemPrompt = agentConf.systemPrompt;
            if (agentConf.agentMd) agentSystemPrompt += `\n\n## Agent Persona\n${agentConf.agentMd}`;
            if (agentConf.soulPrompt) agentSystemPrompt += `\n\n## Core Personality\n${agentConf.soulPrompt}`;
            agentSystemPrompt += skillSection;

            // Add collaborative context for non-first agents
            if (agentIdx > 0 && previousContext) {
              agentSystemPrompt += `\n\n## Collaborative Context\nYou are working as part of a multi-agent team on the user's request. The following agents have already contributed their work. You should build upon their findings, expand on their insights, and add your unique perspective. You may reference, correct, or extend their work.\n\n### Previous Agent Contributions:\n${previousContext}`;
            } else if (agentIdx === 0 && coordinatorPlan) {
              agentSystemPrompt += `\n\n## Collaborative Context\nYou are the first agent in a collaborative multi-agent workflow. The coordinator has created this plan:\n${coordinatorPlan}\n\nFocus on your assigned task. Your work will be passed to the next agent who will build upon it.`;
            } else {
              agentSystemPrompt += `\n\n## Collaborative Context\nYou are participating in a multi-agent collaborative workflow. Other agents will build upon your response.`;
            }

            const agentMessages: LLMMessage[] = [
              { role: 'system', content: agentSystemPrompt },
              ...existingMessages,
              { role: 'user', content: message },
            ];

            // Stream agent response with tool loop
            let agentFullContent = '';
            let agentFullThinking = '';
            let agentLoopIteration = 0;
            const agentToolCalls: Array<{ id: string; name: string; arguments: string; result: string; success: boolean; duration: number }> = [];
            const toolContext: ToolContext = { agentId: agentConf.dbId, conversationId: dbConversationId || undefined };

            while (agentLoopIteration < MAX_TOOL_LOOP_ITERATIONS) {
              agentLoopIteration++;
              totalLoopIterations++;

              const providerStream = await chatStream(agentMessages, effectiveModelId, toolDefs);
              const agentReader = providerStream.getReader();
              let buffer = '';
              const tcAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
              let iterationThinking = '';
              let iterationContent = '';
              let hasToolCalls = false;

              try {
                while (true) {
                  const { done, value } = await agentReader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() ?? '';

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;

                    try {
                      const json = JSON.parse(trimmed.slice(6));
                      const delta = json.choices?.[0]?.delta;

                      // Thinking
                      const thinkingContent = delta?.reasoning_content;
                      if (thinkingContent) {
                        agentFullThinking += thinkingContent;
                        iterationThinking += thinkingContent;
                        send({ type: 'thinking', content: thinkingContent, agentId: agentConf.shortId, model: modelInfo.name });
                      }

                      // Regular content
                      const content = delta?.content;
                      if (content) {
                        agentFullContent += content;
                        iterationContent += content;
                        send({ type: 'token', content, agentId: agentConf.shortId, model: modelInfo.name });
                      }

                      // Tool calls
                      const toolCalls = delta?.tool_calls;
                      if (toolCalls && Array.isArray(toolCalls)) {
                        hasToolCalls = true;
                        for (const tc of toolCalls) {
                          const idx = tc.index ?? 0;
                          if (tc.id) {
                            tcAccumulator[idx] = {
                              id: tc.id,
                              name: tc.function?.name || 'unknown',
                              arguments: tc.function?.arguments || '',
                            };
                          } else if (tcAccumulator[idx]) {
                            tcAccumulator[idx].arguments += (tc.function?.arguments || '');
                          }

                          const acc = tcAccumulator[idx];
                          if (acc) {
                            send({
                              type: 'tool_call',
                              toolCallId: acc.id,
                              name: acc.name,
                              arguments: acc.arguments,
                              done: !tc.function?.arguments,
                              agentId: agentConf.shortId,
                              iteration: agentLoopIteration,
                            });
                          }
                        }
                      }

                      if (json.usage) totalUsage = { ...totalUsage, ...json.usage };
                    } catch { /* skip */ }
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
                        agentFullThinking += thinkingContent;
                        iterationThinking += thinkingContent;
                        send({ type: 'thinking', content: thinkingContent, agentId: agentConf.shortId, model: modelInfo.name });
                      }
                      const content = delta?.content;
                      if (content) {
                        agentFullContent += content;
                        iterationContent += content;
                        send({ type: 'token', content, agentId: agentConf.shortId, model: modelInfo.name });
                      }
                      if (json.usage) totalUsage = { ...totalUsage, ...json.usage };
                    } catch { /* skip */ }
                  }
                }
              } finally {
                agentReader.releaseLock();
              }

              // If no tool calls, break
              const completedTcs = Object.values(tcAccumulator);
              if (completedTcs.length === 0) break;

              // Add assistant message with tool_calls to conversation
              agentMessages.push({
                role: 'assistant',
                content: iterationContent || '',
                tool_calls: completedTcs.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              });

              // Execute tool calls
              for (const tc of completedTcs) {
                const startTime = Date.now();
                send({ type: 'tool_executing', toolCallId: tc.id, name: tc.name, agentId: agentConf.shortId });

                let parsedArgs: Record<string, unknown> = {};
                try { parsedArgs = JSON.parse(tc.arguments); } catch { /* keep empty */ }

                const result = await executeTool(tc.name, parsedArgs, toolContext);
                const duration = Date.now() - startTime;

                agentToolCalls.push({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                  result: result.success ? result.result : result.error || 'Unknown error',
                  success: result.success,
                  duration,
                });

                send({
                  type: 'tool_result',
                  toolCallId: tc.id,
                  name: tc.name,
                  result: result.success ? result.result : result.error || 'Unknown error',
                  success: result.success,
                  duration,
                  agentId: agentConf.shortId,
                  iteration: agentLoopIteration,
                });

                agentMessages.push({
                  role: 'tool',
                  content: result.success ? result.result : `Error: ${result.error || 'Unknown error'}`,
                  tool_call_id: tc.id,
                });
              }
            }

            // Notify agent done
            send({
              type: 'agent_done',
              agentId: agentConf.shortId,
              content: agentFullContent,
              thinkingLength: agentFullThinking.length,
              toolCalls: agentToolCalls.length > 0 ? agentToolCalls : undefined,
            });

            agentResponses.push({
              agentId: agentConf.shortId,
              content: agentFullContent,
              thinking: agentFullThinking,
            });

            // Save agent response to DB
            if (dbConversationId && agentFullContent) {
              try {
                const toolCallsJson = agentToolCalls.length > 0
                  ? JSON.stringify(agentToolCalls.map(tc => ({
                      id: tc.id, tool: tc.name, result: tc.result, status: tc.success ? 'success' : 'error', duration: tc.duration,
                    })))
                  : '[]';
                await db.message.create({
                  data: {
                    conversationId: dbConversationId,
                    role: 'assistant',
                    content: `[${agentConf.name}] ${agentFullContent}`,
                    thinking: agentFullThinking,
                    toolCalls: toolCallsJson,
                  },
                });
              } catch (err) {
                console.error('Failed to save agent message:', err);
              }
            }
          }

          // ═══════════════════════════════════════════════════════
          // PHASE 3: SYNTHESIS
          // ═════════════════════════════════════════════════════════
          send({ type: 'phase', phase: 'synthesizing' });

          const synthesisPrompt = `You are a synthesis agent. Your job is to combine the work of multiple AI agents into a single, coherent, and comprehensive response to the user's original question.

## User's Request
${message}

## Coordinator's Plan
${coordinatorPlan}

## Agent Contributions
${agentResponses.map((r) => {
            const conf = agentConfigs.find((a) => a.shortId === r.agentId);
            return `### ${conf?.name || r.agentId} (${r.agentId})\n${r.content}`;
          }).join('\n\n---\n\n')}

## Instructions
- Combine all agent contributions into a coherent final answer
- Resolve any contradictions between agents
- Remove redundancies
- Present the information in a clear, well-structured format
- Ensure the response directly addresses the user's request
- Use markdown formatting for clarity

Provide the final synthesized response:`;

          const synthesisMessages: LLMMessage[] = [
            { role: 'system', content: synthesisPrompt },
            { role: 'user', content: message },
          ];

          let synthesisContent = '';
          try {
            const synthStream = await chatStream(synthesisMessages, effectiveModelId);
            const synthReader = synthStream.getReader();
            let synthBuffer = '';

            while (true) {
              const { done, value } = await synthReader.read();
              if (done) break;
              synthBuffer += decoder.decode(value, { stream: true });
              const lines = synthBuffer.split('\n');
              synthBuffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    synthesisContent += content;
                    send({ type: 'synthesis', content, model: modelInfo.name });
                  }
                  if (json.usage) totalUsage = { ...totalUsage, ...json.usage };
                } catch { /* skip */ }
              }
            }

            // Process remaining buffer
            if (synthBuffer.trim()) {
              const trimmed = synthBuffer.trim();
              if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) synthesisContent += content;
                } catch { /* skip */ }
              }
            }

            synthReader.releaseLock();
          } catch (err) {
            console.error('Synthesis error:', err);
            synthesisContent = agentResponses.map((r) => {
              const conf = agentConfigs.find((a) => a.shortId === r.agentId);
              return `### ${conf?.name || r.agentId}\n${r.content}`;
            }).join('\n\n');
          }

          // Save synthesis to DB
          if (dbConversationId && synthesisContent) {
            try {
              await db.message.create({
                data: {
                  conversationId: dbConversationId,
                  role: 'assistant',
                  content: `[Synthesis]\n${synthesisContent}`,
                },
              });
            } catch (err) {
              console.error('Failed to save synthesis:', err);
            }
          }

          // ═══════════════════════════════════════════════════════
          // DONE
          // ═══════════════════════════════════════════════════════
          send({
            type: 'done',
            usage: totalUsage,
            agentCount: agentConfigs.length,
            loopIterations: totalLoopIterations,
            model: modelInfo.name,
          });

        } catch (error) {
          send({ type: 'done', error: String(error) });
        } finally {
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
    console.error('Collaborative agent chat error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
