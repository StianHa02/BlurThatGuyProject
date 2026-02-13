/**
 * Video export API route - proxies to backend
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

interface ExportRequestBody {
  tracks: Array<{
    id: number;
    frames: Array<{
      frameIndex: number;
      bbox: [number, number, number, number];
      score: number;
    }>;
  }>;
  selectedTrackIds: number[];
  padding?: number;
  blurAmount?: number;
}

/**
 * POST /api/export/[videoId]
 * Export video with blurred faces
 * @param request - The incoming request with track data
 * @param params - Route parameters containing videoId
 * @returns The processed video file as a blob
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const body: ExportRequestBody = await request.json();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/export/${videoId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      return NextResponse.json(
        { error: error.detail || 'Export failed' },
        { status: response.status }
      );
    }

    // Stream the video file back to the client
    const blob = await response.blob();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="blurred-video.mp4"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export video' },
      { status: 500 }
    );
  }
}
