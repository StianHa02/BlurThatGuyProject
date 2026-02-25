/**
 * Video detection API route - proxies to backend
 * Server-side frame extraction and face detection
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

/**
 * POST /api/detect-video/[videoId]
 * Run face detection on an already-uploaded video
 * @param request - The incoming request (no body needed)
 * @param params - Route parameters containing videoId
 * @returns fps, totalFrames, and per-frame face detection results
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const sampleRate = request.nextUrl.searchParams.get('sample_rate') ?? '2';

    const headers: HeadersInit = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
      method: 'POST',
      headers,
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('Upstream /detect-video returned non-OK', { status: response.status, body: text });
      try {
        const json = JSON.parse(text);
        return NextResponse.json(json, { status: response.status });
      } catch {
        return new NextResponse(text || 'Detection failed', { status: response.status });
      }
    }

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return new NextResponse(text, { status: 200 });
    }
  } catch (error) {
    console.error('Detection proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to detect faces in video' },
      { status: 500 }
    );
  }
}
