// lib/faceClient.ts
// Face detection using Python backend with OpenCV DNN (YuNet)
// Now using Next.js API routes as proxy (API key stays server-side)
// OPTIMIZED: Batch processing support for faster detection

import { API_URL } from './config';

let isReady = false;

/**
 * Initialize connection to the face detection backend
 * @throws Error if backend is not responding
 */
export async function loadModels(): Promise<void> {
  if (isReady) return;

  // Check if backend is running via our API proxy
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
      throw new Error('Backend not responding');
    }
    const data = await response.json();
    console.log(`Connected to backend: ${data.model}`);
    isReady = true;
  } catch (error) {
    throw new Error(
      'Failed to connect to face detection backend. Make sure the Python server is running on port 8000.'
    );
  }
}

/**
 * Detect faces in multiple frames at once (BATCH PROCESSING)
 * @param batch - Array of frames with frameIndex and base64 image data
 * @returns Array of results with frameIndex and detected faces
 */
export async function detectFacesInBatch(
  batch: { frameIndex: number; image: string }[]
): Promise<{ frameIndex: number; faces: { bbox: [number, number, number, number]; score: number }[] }[]> {
  if (!isReady) {
    throw new Error('Face detector not loaded. Call loadModels() first.');
  }

  // Client-side validation to avoid predictable 422 errors
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new Error('Batch must be a non-empty array');
  }
  if (batch.length > 200) {
    throw new Error('Batch size must not exceed 200 frames');
  }

  for (const item of batch) {
    if (typeof item.frameIndex !== 'number' || item.frameIndex < 0) {
      throw new Error('Each batch item must include a non-negative numeric frameIndex');
    }
    if (typeof item.image !== 'string' || item.image.length < 100) {
      throw new Error('Each batch item must include a base64 image string (min length 100)');
    }
    if (item.image.length > 50_000_000) {
      throw new Error('Image in batch item exceeds maximum allowed size');
    }
  }

  try {
    const response = await fetch(`${API_URL}/detect-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batch }),
    });

    if (!response.ok) {
      // Read response body (JSON or text) to include validation detail
      let body: any = null;
      try {
        body = await response.json();
      } catch (err) {
        try {
          body = await response.text();
        } catch (_) {
          body = null;
        }
      }
      console.error('Batch detection failed', { status: response.status, statusText: response.statusText, body });
      const detail = body && (body.detail || body.error || JSON.stringify(body));
      throw new Error(`Batch detection failed: ${response.status} ${response.statusText}${detail ? ' - ' + detail : ''}`);
    }

    const data = await response.json();
    return data.results.map((result: any) => ({
      frameIndex: result.frameIndex,
      faces: result.faces.map((face: { bbox: number[]; score: number }) => ({
        bbox: face.bbox as [number, number, number, number],
        score: face.score,
      })),
    }));
  } catch (error) {
    console.error('Batch detection error:', error);
    return batch.map(b => ({ frameIndex: b.frameIndex, faces: [] }));
  }
}

/**
 * Reset face trackers (no-op, tracking state is managed in tracker.ts)
 */
export function resetTrackers(): void {
  // No-op - tracking state is managed in tracker.ts
}