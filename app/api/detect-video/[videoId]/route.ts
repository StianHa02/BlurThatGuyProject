/* Proxies face detection and ReID to the backend and streams NDJSON results back. Accepts optional ?sample_rate query param. Forwards X-Job-Id header for cancellation. Timeout is 30 minutes. */
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

const DETECT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
        signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
        keepalive: true,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
      return NextResponse.json(
        { error: error.detail || 'Detection failed' },
        { status: response.status }
      );
    }

    if (response.status === 202) {
      const queued = await response.json().catch(() => ({ status: 'queued' }));
      return NextResponse.json(queued, { status: 202 });
    }

    // Forward X-Job-Id header so the client can cancel even before the first chunk arrives.
    const jobId = response.headers.get('x-job-id') ?? '';

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Job-Id': jobId,
        'Access-Control-Expose-Headers': 'X-Job-Id',
      },
    });
  } catch (error) {
    console.error('Detect-video proxy error:', error);
    return NextResponse.json({ error: 'Failed to detect faces in video' }, { status: 500 });
  }
}