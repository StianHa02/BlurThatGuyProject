/* Cancels a running backend job by jobId. Proxies POST /job/:jobId/cancel to the backend. */
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';
import { requireAuth } from '@/lib/server/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { jobId } = await params;
    const response = await fetch(`${BACKEND_URL}/job/${jobId}/cancel`, {
      method: 'POST',
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || 'Failed to cancel job' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Job cancel proxy error:', error);
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
