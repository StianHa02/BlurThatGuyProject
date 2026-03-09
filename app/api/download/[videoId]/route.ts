// app/api/download/[videoId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const response = await fetch(`${BACKEND_URL}/download/${videoId}`, {
      headers: backendHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Download failed' }));
      return NextResponse.json({ error: error.detail || 'Download failed' }, { status: response.status });
    }
    // Stream the video bytes straight through — no buffering
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="blurred-video.mp4"',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Failed to download video' }, { status: 500 });
  }
}

