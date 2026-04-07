import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await db.task.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, type: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/tasks/[id] - Update a task (status, progress, result, etc.)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, progress, result, title, description, priority, agentId, teamId } = body;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const task = await db.task.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(progress !== undefined && { progress: Math.min(100, Math.max(0, progress)) }),
        ...(result !== undefined && { result: result ? JSON.stringify(result) : null }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(priority !== undefined && { priority }),
        ...(agentId !== undefined && { agentId: agentId || null }),
        ...(teamId !== undefined && { teamId: teamId || null }),
      },
      include: {
        agent: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    await db.task.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
