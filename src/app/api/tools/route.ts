export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/tools - List all tools, optionally filtered by category
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const enabledOnly = searchParams.get('enabledOnly') === 'true';

    const tools = await db.tool.findMany({
      where: {
        ...(category && category !== 'all' ? { category } : {}),
        ...(enabledOnly ? { isEnabled: true } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: tools });
  } catch (error) {
    console.error('List tools error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/tools - Create a new tool
export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { name, description, category, inputSchema, permissionMode, isEnabled } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Tool name is required' },
        { status: 400 }
      );
    }

    const tool = await db.tool.create({
      data: {
        name,
        description: description || null,
        category: category || 'system',
        inputSchema: inputSchema ? JSON.stringify(inputSchema) : '{}',
        permissionMode: permissionMode || 'open',
        isEnabled: isEnabled !== undefined ? isEnabled : true,
      },
    });

    return NextResponse.json({ success: true, data: tool }, { status: 201 });
  } catch (error) {
    console.error('Create tool error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/tools - Toggle tool enabled state or update a tool
export async function PUT(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { id, isEnabled, ...updateFields } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Tool id is required' },
        { status: 400 }
      );
    }

    const existing = await db.tool.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Tool not found' },
        { status: 404 }
      );
    }

    const tool = await db.tool.update({
      where: { id },
      data: {
        ...(isEnabled !== undefined && { isEnabled }),
        ...(updateFields.name !== undefined && { name: updateFields.name }),
        ...(updateFields.description !== undefined && { description: updateFields.description || null }),
        ...(updateFields.category !== undefined && { category: updateFields.category }),
        ...(updateFields.inputSchema !== undefined && { inputSchema: JSON.stringify(updateFields.inputSchema) }),
        ...(updateFields.permissionMode !== undefined && { permissionMode: updateFields.permissionMode }),
      },
    });

    return NextResponse.json({ success: true, data: tool });
  } catch (error) {
    console.error('Update tool error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
