import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/teams - List all teams with members
export async function GET() {
  try {
    const teams = await db.agentTeam.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
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
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: teams,
    });
  } catch (error) {
    console.error('List teams error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/teams - Create a new team
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, config } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Team name is required' },
        { status: 400 }
      );
    }

    const team = await db.agentTeam.create({
      data: {
        name,
        description: description || null,
        config: config ? JSON.stringify(config) : '{}',
      },
    });

    return NextResponse.json(
      { success: true, data: team },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/teams - Update a team
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, config } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Team id is required' },
        { status: 400 }
      );
    }

    const existing = await db.agentTeam.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    const team = await db.agentTeam.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: team,
    });
  } catch (error) {
    console.error('Update team error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/teams - Delete a team
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Team id is required' },
        { status: 400 }
      );
    }

    await db.agentTeam.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete team error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
