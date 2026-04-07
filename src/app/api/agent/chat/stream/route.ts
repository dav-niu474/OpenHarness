import { NextRequest } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { chatStream, getModelInfo, type LLMMessage } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { agentId, message, conversationId, modelId } = await req.json();

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
    let effectiveModelId = modelId || 'default';
    let systemPrompt =
      'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate, including code blocks, tables, and lists.';

    if (dbAgentId) {
      const agent = await db.agent.findUnique({ where: { id: dbAgentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        if (!modelId && agent.provider && agent.model) {
          if (agent.provider === 'nvidia') {
            effectiveModelId = agent.model;
          }
        }
      }
    }

    const modelInfo = getModelInfo(effectiveModelId);

    // ── Build messages array ────────────────────────────────────
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

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

    // Save user message to DB only if conversation exists
    if (dbConversationId) {
      try {
        await db.message.create({
          data: { conversationId: dbConversationId, role: 'user', content: message },
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    // ── Create streaming completion ─────────────────────────────
    const providerStream = await chatStream(messages, effectiveModelId);

    // ── Build SSE ReadableStream ────────────────────────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullContent = '';
    let fullThinking = '';
    let usageData: Record<string, number> | null = null;
    const toolCallsAccumulator: Record<string, { id: string; name: string; arguments: string }> = {};

    const readable = new ReadableStream({
      async start(controller) {
        const reader = providerStream.getReader();
        let buffer = '';

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

                  // Handle thinking/reasoning content (NVIDIA GLM models)
                  const thinkingContent = delta?.reasoning_content;
                  if (thinkingContent) {
                    fullThinking += thinkingContent;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                      )
                    );
                  }

                  // Handle regular content
                  const content = delta?.content;
                  if (content) {
                    fullContent += content;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`
                      )
                    );
                  }

                  // Handle tool calls (OpenAI-compatible format)
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
                        // Append arguments to existing tool call
                        toolCallsAccumulator[tc.index ?? 0].arguments += (tc.function?.arguments || '');
                      }

                      // Emit tool_call event
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
                  fullThinking += thinkingContent;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                    )
                  );
                }

                const content = delta?.content;
                if (content) {
                  fullContent += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`)
                  );
                }
                if (json.usage) {
                  usageData = json.usage;
                }
              } catch {
                // Not valid JSON — skip
              }
            }
          }

          // Send final done event with usage and model info
          const completedToolCalls = Object.values(toolCallsAccumulator);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                usage: usageData,
                model: modelInfo.name,
                modelId: modelInfo.id,
                provider: modelInfo.provider,
                thinkingLength: fullThinking.length,
                toolCalls: completedToolCalls.length > 0 ? completedToolCalls : undefined,
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
          reader.releaseLock();

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
