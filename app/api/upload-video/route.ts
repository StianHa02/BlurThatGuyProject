/**
 * Video upload API route - proxies to backend
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

/**
 * POST /api/upload-video
 * Upload a video file for processing
 * @param request - The incoming request with video file in FormData
 * @returns The video ID for later export
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const headers: HeadersInit = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/upload-video`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      return NextResponse.json(
        { error: error.detail || 'Upload failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 }
    );
  }
}

// Configure body size limit for video uploads (100MB)
export const config = {
  api: {
    bodyParser: false,
  },
};
