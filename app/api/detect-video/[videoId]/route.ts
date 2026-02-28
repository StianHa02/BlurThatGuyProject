/**
 * Video face detection API route - proxies to backend
 * Detects faces directly from a video file already on the backend
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

/**
 * POST /api/detect-video/[videoId]
 * Detect faces in an uploaded video file
 * @param request - The incoming request
 * @param params - Route parameters containing videoId
 * @returns Array of results with frameIndex and detected faces
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get sample_rate from query params
    const { searchParams } = new URL(request.url);
    const sampleRate = searchParams.get('sample_rate') || '3';

    const headers: HeadersInit = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
      console.error('Upstream /detect-video returned non-OK', { 
        status: response.status, 
        detail: error.detail 
      });
      return NextResponse.json(
        { error: error.detail || 'Detection failed' },
        { status: response.status }
      );
    }

    // Return the streaming response from the backend directly to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Video detection proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to detect faces in video' },
      { status: 500 }
    );
  }
}
