import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationId } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Build messages array ────────────────────────────────────
    const messages: Array<{ role: string; content: string }> = [];

    // Load system prompt from agent or use default
    let systemPrompt =
      'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
      }
    }

    messages.push({ role: 'system', content: systemPrompt });

    // Load conversation history
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
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }
    }

    // Add the new user message
    messages.push({ role: 'user', content: message });

    // Save user message to DB if conversationId is provided
    if (conversationId) {
      await db.message.create({
        data: {
          conversationId,
          role: 'user',
          content: message,
        },
      });
    }

    // ── Create streaming completion via z-ai-web-dev-sdk ────────
    const zai = await ZAI.create();
    const sdkStream = await zai.chat.completions.create({
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      stream: true,
      thinking: { type: 'disabled' },
    });

    // ── Build SSE ReadableStream ────────────────────────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullContent = '';
    let usageData: Record<string, number> | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        // Get a reader from the SDK stream (it's a native ReadableStream)
        const reader = (sdkStream as unknown as ReadableStream<Uint8Array>).getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode the chunk and append to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines from the buffer
            const lines = buffer.split('\n');
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              // Handle stream termination signal
              if (trimmed === 'data: [DONE]') continue;

              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    // Send content chunk as SSE
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ content })}\n\n`
                      )
                    );
                  }

                  // Capture usage data from the final chunk (if present)
                  if (json.usage) {
                    usageData = json.usage;
                  }
                } catch {
                  // Not valid JSON — skip
                }
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
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

          // Send final done event with usage
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, usage: usageData })}\n\n`
            )
          );
        } catch (error) {
          // Send error event then close
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, error: String(error) })}\n\n`
            )
          );
        } finally {
          // Release the reader lock
          reader.releaseLock();

          // Save the full assistant reply to DB
          if (conversationId && fullContent) {
            try {
              await db.message.create({
                data: {
                  conversationId,
                  role: 'assistant',
                  content: fullContent,
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

    // Return SSE response
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
