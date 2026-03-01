// app/api/export/[videoId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/export/${videoId}`, {
      method: 'POST',
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      return NextResponse.json({ error: error.detail || 'Export failed' }, { status: response.status });
    }
    return new NextResponse(await response.blob(), {
      headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="blurred-video.mp4"' },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export video' }, { status: 500 });
  }
}