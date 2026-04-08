export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { chat, getModelInfo, type LLMMessage } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { agentId, message, conversationId, modelId, model } = await req.json();
    const effectiveModelReqId = modelId || model;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Map short agent IDs to DB IDs
    const agentIdMap: Record<string, string> = {
      alpha: 'seed-alpha',
      beta: 'seed-beta',
      gamma: 'seed-gamma',
    };
    const dbAgentId = agentIdMap[agentId] || agentId || null;

    // Determine model - default to NVIDIA GLM 4.7 for Vercel compatibility
    let effectiveModelId = effectiveModelReqId || 'z-ai/glm4.7';
    let systemPrompt = 'You are an AI agent powered by OpenHarness. You are a helpful coding assistant with access to tools like file operations, web search, and code analysis. Respond concisely and helpfully. Use markdown formatting when appropriate.';

    if (dbAgentId) {
      const agent = await db.agent.findUnique({ where: { id: dbAgentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        if (!modelId && agent.provider === 'nvidia' && agent.model) {
          effectiveModelId = agent.model;
        }
      }
    }

    // Build messages
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    // If conversationId is provided, try to load history from DB
    // If conversation doesn't exist, we'll skip DB persistence (supports client-only mode)
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
      // If conversation not found, it's a client-only conversation — continue without DB persistence
    }

    messages.push({ role: 'user', content: message });

    // Call LLM
    const result = await chat(messages, effectiveModelId);
    const modelInfo = getModelInfo(effectiveModelId);

    // Save messages to DB only if conversation exists
    if (dbConversationId) {
      try {
        await db.message.create({
          data: { conversationId: dbConversationId, role: 'user', content: message },
        });
        await db.message.create({
          data: {
            conversationId: dbConversationId,
            role: 'assistant',
            content: result.content,
            tokenCount: result.usage?.total_tokens,
          },
        });
      } catch (err) {
        console.error('Failed to save messages:', err);
      }
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
