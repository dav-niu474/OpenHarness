export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/agents - List all agents
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const agents = await db.agent.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(type && type !== 'all' ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            conversations: true,
            tasks: true,
            memories: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    console.error('List agents error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/agents - Create a new agent
export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { name, description, type, systemPrompt, provider, model, status, config, soulPrompt, agentMd, boundSkills } = body;

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { success: false, error: 'Name and systemPrompt are required' },
        { status: 400 }
      );
    }

    const agent = await db.agent.create({
      data: {
        name,
        description: description || null,
        type: type || 'react',
        systemPrompt,
        provider: provider || 'openai',
        model: model || 'gpt-4',
        status: status || 'active',
        config: config ? JSON.stringify(config) : '{}',
        soulPrompt: soulPrompt || '',
        agentMd: agentMd || '',
        boundSkills: boundSkills ? JSON.stringify(boundSkills) : '[]',
      },
    });

    return NextResponse.json(
      { success: true, data: agent },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create agent error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
