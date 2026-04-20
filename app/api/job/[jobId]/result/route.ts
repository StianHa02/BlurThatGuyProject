/* Fetches the final result of a completed backend job by jobId. Proxies GET /job/:jobId/result. */
import { NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const response = await fetch(`${BACKEND_URL}/job/${jobId}/result`, {
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || 'Failed to fetch job result' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Job result proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch job result' }, { status: 500 });
  }
}
