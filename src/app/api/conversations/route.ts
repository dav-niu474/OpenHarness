export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/conversations - List all conversations, optionally filtered by agentId
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const conversations = await db.conversation.findMany({
      where: {
        ...(agentId ? { agentId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        agent: {
          select: { id: true, name: true, status: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { agentId, title, status } = body;

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'agentId is required' },
        { status: 400 }
      );
    }

    // Verify agent exists
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    const conversation = await db.conversation.create({
      data: {
        agentId,
        title: title || 'New Conversation',
        status: status || 'active',
      },
      include: {
        agent: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: conversation },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
