import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/agents/[id] - Get a single agent by ID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;
    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            conversations: true,
            tasks: true,
            memories: true,
            teamMemberships: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    console.error('Get agent error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/agents/[id] - Update an agent
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;
    const body = await req.json();
    const { name, description, type, systemPrompt, provider, model, status, config } = body;

    // Verify agent exists
    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    const agent = await db.agent.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(type !== undefined && { type }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(provider !== undefined && { provider }),
        ...(model !== undefined && { model }),
        ...(status !== undefined && { status }),
        ...(config !== undefined && { config: JSON.stringify(config) }),
      },
    });

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    console.error('Update agent error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;

    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    await db.agent.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete agent error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
