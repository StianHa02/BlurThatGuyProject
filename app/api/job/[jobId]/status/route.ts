/* Polls the current status of a backend job by jobId. Proxies GET /job/:jobId/status. */
import { NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';
import { requireAuth } from '@/lib/server/auth';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { jobId } = await params;
    const response = await fetch(`${BACKEND_URL}/job/${jobId}/status`, {
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || 'Failed to fetch job status' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Job status proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch job status' }, { status: 500 });
  }
}
