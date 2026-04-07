import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/skills - List all skills, optionally filtered by category
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const loadedOnly = searchParams.get('loadedOnly') === 'true';

    const skills = await db.skill.findMany({
      where: {
        ...(category && category !== 'all' ? { category } : {}),
        ...(loadedOnly ? { isLoaded: true } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: skills });
  } catch (error) {
    console.error('List skills error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/skills - Create a new skill or toggle skill loaded state
export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { id, isLoaded, name, description, content, category } = body;

    // If id is provided, toggle the loaded state
    if (id) {
      const existing = await db.skill.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Skill not found' },
          { status: 404 }
        );
      }

      const skill = await db.skill.update({
        where: { id },
        data: {
          ...(isLoaded !== undefined && { isLoaded }),
        },
      });

      return NextResponse.json({ success: true, data: skill });
    }

    // Otherwise create a new skill
    if (!name || !content) {
      return NextResponse.json(
        { success: false, error: 'Skill name and content are required' },
        { status: 400 }
      );
    }

    const skill = await db.skill.create({
      data: {
        name,
        description: description || null,
        content,
        category: category || 'general',
        isLoaded: false,
      },
    });

    return NextResponse.json({ success: true, data: skill }, { status: 201 });
  } catch (error) {
    console.error('Create/toggle skill error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/skills - Update a skill
export async function PUT(req: NextRequest) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Skill id is required' },
        { status: 400 }
      );
    }

    const existing = await db.skill.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 }
      );
    }

    const skill = await db.skill.update({
      where: { id },
      data: {
        ...(updateFields.name !== undefined && { name: updateFields.name }),
        ...(updateFields.description !== undefined && { description: updateFields.description || null }),
        ...(updateFields.content !== undefined && { content: updateFields.content }),
        ...(updateFields.category !== undefined && { category: updateFields.category }),
        ...(updateFields.isLoaded !== undefined && { isLoaded: updateFields.isLoaded }),
      },
    });

    return NextResponse.json({ success: true, data: skill });
  } catch (error) {
    console.error('Update skill error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
