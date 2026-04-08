import { NextRequest } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { chatStream, getModelInfo, type LLMMessage } from '@/lib/llm';
import { getToolDefinitions, executeTool, type ToolContext } from '@/lib/tools';

export const dynamic = 'force-dynamic';

const MAX_AGENT_LOOP_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { agentId, message, conversationId, modelId, model, skillIds, autonomous } = await req.json();
    const effectiveModelReqId = modelId || model;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Map short agent IDs to DB IDs
    const agentIdMap: Record<string, string> = {
      alpha: 'seed-alpha',
      beta: 'seed-beta',
      gamma: 'seed-gamma',
    };
    const dbAgentId = agentIdMap[agentId] || agentId || null;

    // Determine model
    let effectiveModelId = effectiveModelReqId || 'z-ai/glm4.7';
    let systemPrompt =
      'You are an AI agent powered by OpenHarness. You are a helpful assistant with access to tools like web search, task management, and code analysis. When the user asks a question that requires real-time information, use the WebSearch tool. For complex tasks, break them down into steps and use tools as needed. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    let agentData: { agentMd?: string; soulPrompt?: string; boundSkills?: string } | null = null;

    if (dbAgentId) {
      const agent = await db.agent.findUnique({ where: { id: dbAgentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        agentData = {
          agentMd: agent.agentMd || '',
          soulPrompt: agent.soulPrompt || '',
          boundSkills: agent.boundSkills || '[]',
        };
        if (!modelId && agent.provider && agent.model) {
          if (agent.provider === 'nvidia') {
            effectiveModelId = agent.model;
          }
        }
      }
    }

    // ── Inject skills into system prompt ───────────────────────
    const skillIdsToFetch: string[] = [];

    if (Array.isArray(skillIds) && skillIds.length > 0) {
      skillIdsToFetch.push(...skillIds);
    }

    if (agentData?.boundSkills) {
      try {
        const bound: string[] = JSON.parse(agentData.boundSkills);
        if (Array.isArray(bound)) {
          for (const id of bound) {
            if (!skillIdsToFetch.includes(id)) {
              skillIdsToFetch.push(id);
            }
          }
        }
      } catch { /* skip */ }
    }

    let skillSection = '';
    if (skillIdsToFetch.length > 0) {
      const skills = await db.skill.findMany({
        where: { id: { in: skillIdsToFetch } },
      });

      if (skills.length > 0) {
        const skillLines = skills.map((s) => {
          const cat = s.category || 'general';
          const desc = s.description || '';
          return `- **${s.name}**: ${desc} (${cat})\n  Content: ${s.content}`;
        }).join('\n\n');

        skillSection = `\n\n## Available Skills\nThe following skills are loaded and available to you:\n${skillLines}\n\nYou should use these skills when relevant to the user's request.`;
      }
    }

    // ── Inject agent persona and soul ─────────────────────────
    let personaSection = '';
    if (agentData?.agentMd) {
      personaSection += `\n\n## Agent Persona (agent.md)\n${agentData.agentMd}`;
    }
    if (agentData?.soulPrompt) {
      personaSection += `\n\n## Soul/Core Personality (soul.md)\n${agentData.soulPrompt}`;
    }

    const finalSystemPrompt = systemPrompt + personaSection + skillSection;
    const modelInfo = getModelInfo(effectiveModelId);

    // ── Build messages array ──────────────────────────────────
    const messages: LLMMessage[] = [{ role: 'system', content: finalSystemPrompt }];

    let dbConversationId: string | null = null;
    if (conversationId) {
      const conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { role: true, content: true },
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

    // ── Get tool definitions ──────────────────────────────────
    const toolDefs = getToolDefinitions();

    // ── Create SSE ReadableStream with Agent Loop ─────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        let fullThinking = '';
        let usageData: Record<string, number> | null = null;
        const toolToolContext: ToolContext = { agentId: dbAgentId || undefined, conversationId: dbConversationId || undefined };
        const allExecutedToolCalls: Array<{ id: string; name: string; arguments: string; result: string; success: boolean; duration: number }> = [];
        let loopIteration = 0;

        try {
          // ── Agent Loop ────────────────────────────────────────
          while (loopIteration < MAX_AGENT_LOOP_ITERATIONS) {
            loopIteration++;

            // Notify about loop iteration
            if (loopIteration > 1) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'loop_iteration', iteration: loopIteration, maxIterations: MAX_AGENT_LOOP_ITERATIONS, model: modelInfo.name })}\n\n`
                )
              );
            }

            const providerStream = await chatStream(messages, effectiveModelId, toolDefs);
            const reader = providerStream.getReader();
            let buffer = '';
            const toolCallsAccumulator: Record<string, { id: string; name: string; arguments: string }> = {};
            let iterationThinking = '';
            let iterationContent = '';
            let hasToolCalls = false;

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  if (trimmed === 'data: [DONE]') continue;

                  if (trimmed.startsWith('data: ')) {
                    try {
                      const json = JSON.parse(trimmed.slice(6));
                      const delta = json.choices?.[0]?.delta;

                      // Thinking
                      const thinkingContent = delta?.reasoning_content;
                      if (thinkingContent) {
                        fullThinking += thinkingContent;
                        iterationThinking += thinkingContent;
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                          )
                        );
                      }

                      // Regular content
                      const content = delta?.content;
                      if (content) {
                        fullContent += content;
                        iterationContent += content;
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`
                          )
                        );
                      }

                      // Tool calls
                      const toolCalls = delta?.tool_calls;
                      if (toolCalls && Array.isArray(toolCalls)) {
                        hasToolCalls = true;
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
                            controller.enqueue(
                              encoder.encode(
                                `data: ${JSON.stringify({
                                  type: 'tool_call',
                                  toolCallId: acc.id,
                                  name: acc.name,
                                  arguments: acc.arguments,
                                  done: !tc.function?.arguments,
                                  iteration: loopIteration,
                                })}\n\n`
                              )
                            );
                          }
                        }
                      }

                      if (json.usage) {
                        usageData = json.usage;
                      }
                    } catch {
                      // Not valid JSON
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
                      fullThinking += thinkingContent;
                      iterationThinking += thinkingContent;
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                        )
                      );
                    }
                    const content = delta?.content;
                    if (content) {
                      fullContent += content;
                      iterationContent += content;
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`)
                      );
                    }
                    if (json.usage) usageData = json.usage;
                  } catch { /* skip */ }
                }
              }
            } finally {
              reader.releaseLock();
            }

            // ── If no tool calls, we're done ──────────────────
            const completedToolCalls = Object.values(toolCallsAccumulator);
            if (completedToolCalls.length === 0) {
              break;
            }

            // ── Execute tool calls ─────────────────────────────
            // Add assistant message with tool_calls to conversation
            messages.push({
              role: 'assistant',
              content: iterationContent || '',
              tool_calls: completedToolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });

            // Execute each tool call
            for (const tc of completedToolCalls) {
              const startTime = Date.now();
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_executing', toolCallId: tc.id, name: tc.name })}\n\n`
                )
              );

              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.arguments);
              } catch { /* keep empty */ }

              const result = await executeTool(tc.name, parsedArgs, toolToolContext);
              const duration = Date.now() - startTime;

              allExecutedToolCalls.push({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                result: result.success ? result.result : result.error || 'Unknown error',
                success: result.success,
                duration,
              });

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'tool_result',
                    toolCallId: tc.id,
                    name: tc.name,
                    result: result.success ? result.result : result.error || 'Unknown error',
                    success: result.success,
                    duration,
                    iteration: loopIteration,
                  })}\n\n`
                )
              );

              // Add tool result to messages
              messages.push({
                role: 'tool',
                content: result.success ? result.result : `Error: ${result.error || 'Unknown error'}`,
                tool_call_id: tc.id,
              });
            }
          }

          // ── Send final done event ────────────────────────────
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                usage: usageData,
                model: modelInfo.name,
                modelId: modelInfo.id,
                provider: modelInfo.provider,
                thinkingLength: fullThinking.length,
                toolCalls: allExecutedToolCalls.length > 0 ? allExecutedToolCalls : undefined,
                loopIterations: loopIteration,
                autonomous: !!autonomous,
              })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', error: String(error) })}\n\n`
            )
          );
        } finally {
          // Save assistant message
          if (dbConversationId && fullContent) {
            try {
              await db.message.create({
                data: {
                  conversationId: dbConversationId,
                  role: 'assistant',
                  content: fullContent,
                  tokenCount: usageData?.total_tokens,
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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
