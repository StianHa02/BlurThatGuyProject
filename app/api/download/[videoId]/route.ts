/* Streams a processed (blurred) video from the backend to the client. Requires authentication. Proxies GET /download/:videoId and forwards the video bytes as video/mp4. */
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

