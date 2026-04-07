import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/permissions - List all permission rules, optionally filtered by mode
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode');

    const rules = await db.permissionRule.findMany({
      where: {
        ...(mode && mode !== 'all' ? { mode } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    console.error('List permission rules error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/permissions - Create a new permission rule
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, pathPattern, isAllowed, commandDenyList } = body;

    if (!pathPattern) {
      return NextResponse.json(
        { success: false, error: 'pathPattern is required' },
        { status: 400 }
      );
    }

    if (!mode || !['allow', 'deny', 'ask'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: 'mode must be one of: allow, deny, ask' },
        { status: 400 }
      );
    }

    const rule = await db.permissionRule.create({
      data: {
        mode,
        pathPattern,
        isAllowed: isAllowed !== undefined ? isAllowed : true,
        commandDenyList: Array.isArray(commandDenyList)
          ? JSON.stringify(commandDenyList)
          : commandDenyList || '[]',
      },
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    console.error('Create permission rule error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/permissions - Update a permission rule
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, mode, isAllowed, commandDenyList } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rule id is required' },
        { status: 400 }
      );
    }

    const existing = await db.permissionRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Permission rule not found' },
        { status: 404 }
      );
    }

    const rule = await db.permissionRule.update({
      where: { id },
      data: {
        ...(mode !== undefined && { mode }),
        ...(isAllowed !== undefined && { isAllowed }),
        ...(commandDenyList !== undefined && {
          commandDenyList: Array.isArray(commandDenyList)
            ? JSON.stringify(commandDenyList)
            : commandDenyList,
        }),
      },
    });

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Update permission rule error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/permissions - Delete a permission rule
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rule id is required' },
        { status: 400 }
      );
    }

    const existing = await db.permissionRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Permission rule not found' },
        { status: 404 }
      );
    }

    await db.permissionRule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete permission rule error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
