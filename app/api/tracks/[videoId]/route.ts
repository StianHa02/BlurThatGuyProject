import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const response = await fetch(`${BACKEND_URL}/tracks/${videoId}`, {
      headers: backendHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Tracks not found' }));
      return NextResponse.json({ error: error.detail || 'Tracks not found' }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Tracks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
  }
}
