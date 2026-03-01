// app/api/detect-video/[videoId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const { searchParams } = new URL(request.url);
    const sampleRate = searchParams.get('sample_rate') ?? '3';

    const response = await fetch(
      `${BACKEND_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`,
      {
        method: 'POST',
        headers: backendHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
      return NextResponse.json(
        { error: error.detail || 'Detection failed' },
        { status: response.status }
      );
    }

    // Stream the NDJSON response directly back to the client
    return new NextResponse(response.body, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch (error) {
    console.error('Detect-video proxy error:', error);
    return NextResponse.json({ error: 'Failed to detect faces in video' }, { status: 500 });
  }
}