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
 * Detect faces in a canvas element (single frame)
 * @param canvas - The canvas containing the video frame
 * @returns Array of detected faces with bounding boxes and confidence scores
 */
export async function detectFacesInCanvas(
  canvas: HTMLCanvasElement
): Promise<{ bbox: [number, number, number, number]; score: number }[]> {
  if (!isReady) {
    throw new Error('Face detector not loaded. Call loadModels() first.');
  }

  // Convert canvas to base64
  const imageData = canvas.toDataURL('image/jpeg', 0.9);

  try {
    const response = await fetch(`${API_URL}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageData }),
    });

    if (!response.ok) {
      throw new Error(`Detection failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.faces.map((face: { bbox: number[]; score: number }) => ({
      bbox: face.bbox as [number, number, number, number],
      score: face.score,
    }));
  } catch (error) {
    console.error('Face detection error:', error);
    return [];
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

  try {
    const response = await fetch(`${API_URL}/detect-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batch }),
    });

    if (!response.ok) {
      throw new Error(`Batch detection failed: ${response.statusText}`);
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