import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    // Forward Range header for seeking support
    const range = request.headers.get('range');
    const headers = backendHeaders(range ? { Range: range } : {});

    const response = await fetch(`${BACKEND_URL}/stream/${videoId}`, { headers });

    if (!response.ok && response.status !== 206) {
      const error = await response.json().catch(() => ({ detail: 'Video not found' }));
      return NextResponse.json({ error: error.detail || 'Video not found' }, { status: response.status });
    }

    // Forward relevant headers from backend for range request support
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'video/mp4',
    };

    const contentRange = response.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    const contentLength = response.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Stream error:', error);
    return NextResponse.json({ error: 'Failed to stream video' }, { status: 500 });
  }
}
