import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/tasks - List all tasks, optionally filtered by status/agentId/teamId
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const agentId = searchParams.get('agentId');
    const teamId = searchParams.get('teamId');
    const priority = searchParams.get('priority');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const tasks = await db.task.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(agentId ? { agentId } : {}),
        ...(teamId ? { teamId } : {}),
        ...(priority && priority !== 'all' ? { priority } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        agent: {
          select: { id: true, name: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('List tasks error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create a new task
export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { agentId, teamId, title, description, status, priority, result } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Task title is required' },
        { status: 400 }
      );
    }

    // Verify agent exists if provided
    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (!agent) {
        return NextResponse.json(
          { success: false, error: 'Agent not found' },
          { status: 404 }
        );
      }
    }

    // Verify team exists if provided
    if (teamId) {
      const team = await db.agentTeam.findUnique({ where: { id: teamId } });
      if (!team) {
        return NextResponse.json(
          { success: false, error: 'Team not found' },
          { status: 404 }
        );
      }
    }

    const task = await db.task.create({
      data: {
        agentId: agentId || null,
        teamId: teamId || null,
        title,
        description: description || null,
        status: status || 'pending',
        priority: priority || 'medium',
        progress: 0,
        result: result ? JSON.stringify(result) : null,
      },
      include: {
        agent: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
