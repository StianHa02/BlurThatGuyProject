/**
 * Face detection API route - proxies to backend
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

interface DetectRequestBody {
  image: string;
}

/**
 * POST /api/detect
 * Detect faces in a base64-encoded image
 * @param request - The incoming request with base64 image data
 * @returns Array of detected faces with bounding boxes and scores
 */
export async function POST(request: NextRequest) {
  try {
    const body: DetectRequestBody = await request.json();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/detect`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
      return NextResponse.json(
        { error: error.detail || 'Detection failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect faces' },
      { status: 500 }
    );
  }
}
