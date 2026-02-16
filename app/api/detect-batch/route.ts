/**
 * Batch face detection API route - proxies to backend
 * Processes multiple frames in a single request
 * Keeps API key server-side only
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

interface BatchDetectRequestBody {
  batch: { frameIndex: number; image: string }[];
}

/**
 * POST /api/detect-batch
 * Detect faces in multiple base64-encoded images at once
 * @param request - The incoming request with batch of images
 * @returns Array of results with frameIndex and detected faces for each image
 */
export async function POST(request: NextRequest) {
  try {
    const body: BatchDetectRequestBody = await request.json();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await fetch(`${API_URL}/detect-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      // Try to parse JSON, otherwise return text. Forward backend status and body as-is.
      console.error('Upstream /detect-batch returned non-OK', { status: response.status, body: text });
      try {
        const json = JSON.parse(text);
        return NextResponse.json(json, { status: response.status });
      } catch (e) {
        return new NextResponse(text || 'Batch detection failed', { status: response.status });
      }
    }

    // Success - forward parsed JSON
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch (e) {
      // Unexpected non-JSON success body
      return new NextResponse(text, { status: 200 });
    }
  } catch (error) {
    console.error('Batch detection proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to detect faces in batch' },
      { status: 500 }
    );
  }
}