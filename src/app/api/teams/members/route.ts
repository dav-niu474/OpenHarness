import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/teams/members - Add member to team
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamId, agentId, role } = body;

    if (!teamId || !agentId) {
      return NextResponse.json(
        { success: false, error: 'teamId and agentId are required' },
        { status: 400 }
      );
    }

    // Verify team exists
    const team = await db.agentTeam.findUnique({ where: { id: teamId } });
    if (!team) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
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

    const member = await db.teamMember.create({
      data: {
        teamId,
        agentId,
        role: role || 'worker',
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: member },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Add team member error:', error);
    const message = error instanceof Error && error.message.includes('Unique')
      ? 'Agent is already a member of this team'
      : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/members - Remove a member
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Member id is required' },
        { status: 400 }
      );
    }

    await db.teamMember.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove team member error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
