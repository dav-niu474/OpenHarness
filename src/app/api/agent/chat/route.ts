import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chat, getModelInfo, type LLMMessage } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationId, modelId } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Determine model
    let effectiveModelId = modelId || 'default';
    let systemPrompt = 'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        if (!modelId && agent.provider === 'nvidia' && agent.model) {
          effectiveModelId = agent.model;
        }
      }
    }

    // Build messages
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

    // Call LLM
    const result = await chat(messages, effectiveModelId);
    const modelInfo = getModelInfo(effectiveModelId);

    // Save messages to DB
    if (conversationId) {
      await db.message.create({
        data: { conversationId, role: 'user', content: message },
      });
      await db.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: result.content,
          tokenCount: result.usage?.total_tokens,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        reply: result.content,
        usage: result.usage,
        model: modelInfo.name,
        modelId: modelInfo.id,
        provider: modelInfo.provider,
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
