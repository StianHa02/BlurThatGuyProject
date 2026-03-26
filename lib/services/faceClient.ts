import { API_URL } from '@/lib/config';
import type { Track, BlurMode } from '@/types';

export type DetectResult =
  | { kind: 'immediate'; tracks: Track[]; jobId: string }
  | { kind: 'queued'; jobId: string };

export interface JobStatusResponse {
  status: 'queued' | 'running' | 'done' | 'error' | null;
  position: number | null;
  thread_budget: number | null;
  progress: number | null;
}

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
  signal?: AbortSignal,
  onJobId?: (jobId: string) => void,
): Promise<DetectResult> {
  if (!isReady) throw new Error('Face detector not loaded. Call loadModels() first.');

  const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok && response.status !== 202) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Video detection failed: ${response.status} ${body.detail || body.error || ''}`);
  }

  if (response.status === 202) {
    const body = await response.json().catch(() => ({}));
    const queuedJobId = body.job_id || body.jobId;
    if (!queuedJobId) {
      throw new Error('Detection queued, but no job id was returned by backend.');
    }
    return { kind: 'queued', jobId: queuedJobId };
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  let tracks: Track[] = [];
  let streamJobId = '';
  const decoder = new TextDecoder();

  // Read job_id from header immediately — fires before any chunk arrives,
  // so activeJobIdRef is set even if the user reloads before the first NDJSON line.
  const headerJobId = response.headers.get('x-job-id');
  if (headerJobId) { streamJobId = headerJobId; onJobId?.(headerJobId); }

  signal?.addEventListener('abort', () => reader.cancel(), { once: true });
  let buffer = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const data = JSON.parse(trimmed);
      if (data.type === 'job_id') { streamJobId = data.job_id; onJobId?.(data.job_id); }
      else if (data.type === 'progress') onProgress?.(data.progress);
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

  return { kind: 'immediate', tracks, jobId: streamJobId };
}

export async function cancelJob(jobId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/job/${jobId}/cancel`, {
      method: 'POST',
      keepalive: true,
    });
  } catch {

  }
}


export async function getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobStatusResponse> {
  const response = await fetch(`${API_URL}/job/${jobId}/status`, {
    method: 'GET',
    signal,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || body.error || 'Failed to get job status');
  }
  return body as JobStatusResponse;
}

export async function getJobResult(jobId: string, signal?: AbortSignal): Promise<Track[]> {
  const response = await fetch(`${API_URL}/job/${jobId}/result`, {
    method: 'GET',
    signal,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || body.error || 'Failed to get job result');
  }
  return (body.results || []) as Track[];
}

// BlurMode re-exported from @/types for backwards compatibility
export type { BlurMode } from '@/types';

/**
 * Stream export progress from backend, returns the download URL when done.
 */
export async function exportVideo(
  videoId: string,
  selectedTrackIds: number[],
  options: {
    padding?: number;
    targetBlocks?: number;
    sampleRate?: number;
    blurMode?: BlurMode;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const { padding = 0.4, targetBlocks = 8, sampleRate = 1, blurMode = 'pixelate', onProgress, signal } = options;

  const response = await fetch(`${API_URL}/export/${videoId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedTrackIds, padding, targetBlocks, sampleRate, blurMode }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Export failed: ${response.status} ${body.detail || body.error || ''}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  signal?.addEventListener('abort', () => reader.cancel(), { once: true });

  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const data = JSON.parse(trimmed);
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'error') throw new Error(data.error || 'Export failed');
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
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