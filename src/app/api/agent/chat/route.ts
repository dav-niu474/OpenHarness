import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationId } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];

    // Load system prompt from agent or use default
    let systemPrompt = 'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
      }
    }

    messages.push({ role: 'system', content: systemPrompt });

    // If conversationId is provided, load conversation history
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

    // Call z-ai-web-dev-sdk
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      thinking: { type: 'disabled' },
    });

    const reply = completion.choices[0]?.message?.content || 'No response generated.';

    // Save messages to database if conversationId is provided
    if (conversationId) {
      // Save user message
      await db.message.create({
        data: {
          conversationId,
          role: 'user',
          content: message,
        },
      });

      // Save assistant reply
      await db.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: reply,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        reply,
        usage: completion.usage,
      },
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
