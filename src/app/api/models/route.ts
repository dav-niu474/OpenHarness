import { NextResponse } from 'next/server';
import { AVAILABLE_MODELS } from '@/lib/llm';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: AVAILABLE_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        description: m.description,
        maxTokens: m.maxTokens,
      })),
    });
  } catch (error) {
    console.error('Models list error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
