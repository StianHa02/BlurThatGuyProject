/* Proxies a blur-export job to the backend and streams NDJSON progress back to the client. Expects export config in the JSON body. Timeout is 30 minutes for large videos. */
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

const EXPORT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
      signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
      keepalive: true,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      return NextResponse.json({ error: error.detail || 'Export failed' }, { status: response.status });
    }
    // Stream the NDJSON straight through — no buffering
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export video' }, { status: 500 });
  }
}
