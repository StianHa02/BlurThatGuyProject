// lib/faceClient.ts
// Face detection via Python backend (YuNet), proxied through Next.js API routes.
// detectFacesInBatch is kept as a no-op stub — all detection now happens
// server-side via detectFacesInVideo. FaceGallery thumbnails use track data directly.

import { API_URL } from './config';

let isReady = false;

export async function loadModels(): Promise<void> {
  if (isReady) return;
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error('Backend not responding');
  const data = await response.json();
  console.log(`Connected to backend: ${data.model}`);
  isReady = true;
}

export async function detectFacesInVideo(
  videoId: string,
  sampleRate = 3,
  onProgress?: (progress: number) => void
): Promise<{ frameIndex: number; faces: { bbox: [number, number, number, number]; score: number }[] }[]> {
  if (!isReady) throw new Error('Face detector not loaded. Call loadModels() first.');

  const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Video detection failed: ${response.status} ${body.detail || body.error || ''}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  let results: any[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const data = JSON.parse(trimmed);
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'results') results = data.results;
      else if (data.type === 'error') throw new Error(data.error || 'Detection failed');
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error('Failed to parse NDJSON line:', trimmed);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    }
    if (done) break;
  }

  if (buffer.trim()) processLine(buffer);

  return results.map((r: any) => ({
    frameIndex: r.frameIndex,
    faces: r.faces.map((f: { bbox: number[]; score: number }) => ({
      bbox: f.bbox as [number, number, number, number],
      score: f.score,
    })),
  }));
}

/**
 * @deprecated No-op stub. All detection is server-side via detectFacesInVideo.
 * Kept to avoid breaking FaceGallery until it is updated to use track data directly.
 */
export async function detectFacesInBatch(
  batch: { frameIndex: number; image: string }[]
): Promise<{ frameIndex: number; faces: { bbox: [number, number, number, number]; score: number }[] }[]> {
  // Returns empty results immediately — zero API calls made.
  return batch.map(b => ({ frameIndex: b.frameIndex, faces: [] }));
}

/** @deprecated No-op. Tracking state is managed in tracker.ts. */
export function resetTrackers(): void {}