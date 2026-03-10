// lib/faceClient.ts
// Face detection via Python backend (YuNet), proxied through Next.js API routes.
// Tracking now happens server-side. Detection stream returns Track objects directly.

import { API_URL } from './config';
import { Track } from './tracker';

let isReady = false;

export async function loadModels(): Promise<void> {
  if (isReady) return;
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error('Backend not responding');
  const data = await response.json();
  console.log(`Connected to backend: ${data.model}`);
  isReady = true;
}

/**
 * Stream detection progress from backend.
 * Tracking is server-side — results are Track[] not raw detections.
 */
export async function detectFacesInVideo(
  videoId: string,
  sampleRate = 3,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  if (!isReady) throw new Error('Face detector not loaded. Call loadModels() first.');

  const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Video detection failed: ${response.status} ${body.detail || body.error || ''}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  signal?.addEventListener('abort', () => reader.cancel(), { once: true });

  let tracks: Track[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const data = JSON.parse(trimmed);
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'results') tracks = data.results as Track[];
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

  return tracks;
}

/**
 * @deprecated No-op stub.
 */
export async function detectFacesInBatch(
  batch: { frameIndex: number; image: string }[]
): Promise<{ frameIndex: number; faces: { bbox: [number, number, number, number]; score: number }[] }[]> {
  return batch.map(b => ({ frameIndex: b.frameIndex, faces: [] }));
}

/** @deprecated No-op. */
export function resetTrackers(): void {}