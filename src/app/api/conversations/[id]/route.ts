import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/conversations/[id] - Get a conversation with its messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        agent: {
          select: { id: true, name: true, type: true, status: true, model: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/conversations/[id] - Update a conversation (title, status)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;
    const body = await req.json();
    const { title, status } = body;

    const existing = await db.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const conversation = await db.conversation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id] - Delete a conversation and its messages
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();
    const { id } = await params;

    const existing = await db.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    await db.conversation.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
