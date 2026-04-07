import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { chatStream, getModelInfo, type LLMMessage } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationId, modelId } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine model
    let effectiveModelId = modelId || 'default';
    let systemPrompt =
      'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        // Use agent's configured model if no explicit modelId is provided
        if (!modelId && agent.provider && agent.model) {
          // Check if agent's provider/model maps to a known model
          if (agent.provider === 'nvidia') {
            effectiveModelId = agent.model;
          }
        }
      }
    }

    const modelInfo = getModelInfo(effectiveModelId);

    // ── Build messages array ────────────────────────────────────
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

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
        for (const msg of conversation.messages) {
          if (msg.role !== 'system' && msg.content) {
            messages.push({ role: msg.role as LLMMessage['role'], content: msg.content });
          }
        }
      }
    }

    messages.push({ role: 'user', content: message });

    // Save user message to DB
    if (conversationId) {
      await db.message.create({
        data: { conversationId, role: 'user', content: message },
      });
    }

    // ── Create streaming completion ─────────────────────────────
    const providerStream = await chatStream(messages, effectiveModelId);

    // ── Build SSE ReadableStream ────────────────────────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullContent = '';
    let usageData: Record<string, number> | null = null;

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
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ content, model: modelInfo.name })}\n\n`
                      )
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
          }

          // Process remaining buffer
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content, model: modelInfo.name })}\n\n`)
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
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                usage: usageData,
                model: modelInfo.name,
                modelId: modelInfo.id,
                provider: modelInfo.provider,
              })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, error: String(error) })}\n\n`
            )
          );
        } finally {
          reader.releaseLock();

          if (conversationId && fullContent) {
            try {
              await db.message.create({
                data: {
                  conversationId,
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
