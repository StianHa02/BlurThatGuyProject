'use client';

import { useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';

interface UseExportOptions {
  videoId: string | null;
  fileName: string;
  selectedTrackIds: number[];
  sampleRate: number;
  blurMode: 'pixelate' | 'blackout';
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export function useVideoExport({ videoId, fileName, selectedTrackIds, sampleRate, blurMode, onError, signal }: UseExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  /** Shared: run the export pipeline on the backend, stream progress, resolve with true on done */
  const runExport = useCallback(async (onProgress: (p: number) => void): Promise<boolean> => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    if (selectedTrackIds.length === 0) { onError('Please select at least one face to blur.'); return false; }

    onProgress(0);

    const response = await fetch(`${API_URL}/export/${videoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedTrackIds, padding: 0.4, targetBlocks: 12, sampleRate, blurMode }),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const message = typeof err.detail === 'string'
        ? err.detail
        : Array.isArray(err.detail)
        ? err.detail.map((e: { msg: string }) => e.msg).join(', ')
        : err.error || 'Export failed';
      throw new Error(message);
    }

    if (!response.body) throw new Error('No response stream');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type === 'progress') {
            onProgress(event.progress);
          } else if (event.type === 'done') {
            onProgress(100);
            return true;
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Export failed');
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    throw new Error('Export stream ended unexpectedly');
  }, [videoId, selectedTrackIds, sampleRate, blurMode, onError, signal]);

  /** Download: export then trigger browser download */
  const exportVideo = useCallback(async () => {
    setExporting(true);
    try {
      const ok = await runExport(setExportProgress);
      if (!ok) return false;
      const a = Object.assign(document.createElement('a'), {
        href: `${API_URL}/download/${videoId}`,
        download: `blurred-${fileName || 'video.mp4'}`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      onError(error instanceof Error ? error.message : 'Failed to export video.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [runExport, videoId, fileName, onError]);

  /** Save: export → fetch blob → upload to S3 → save metadata to Supabase */
  const saveVideo = useCallback(async () => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    setSaving(true);
    try {
      // 1. Export (progress 0–60)
      const ok = await runExport((p) => setSaveProgress(Math.round(p * 0.6)));
      if (!ok) return false;

      // 2. Fetch the exported blob (60–70)
      setSaveProgress(65);
      const blobRes = await fetch(`${API_URL}/download/${videoId}`, { signal });
      if (!blobRes.ok) throw new Error('Failed to fetch exported video');
      const blob = await blobRes.blob();
      const saveFileName = `blurred-${fileName || 'video.mp4'}`;

      // 3. Get pre-signed upload URL (70)
      setSaveProgress(70);
      const presignRes = await fetch('/api/videos/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: saveFileName, contentType: 'video/mp4', fileSize: blob.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get upload URL. Are you signed in?');
      }
      const { uploadUrl, key } = await presignRes.json();

      // 4. Upload to S3 (70–90)
      setSaveProgress(80);
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'video/mp4' },
      });
      if (!uploadRes.ok) throw new Error('Failed to upload to S3');

      // 5. Save metadata to Supabase (90–100)
      setSaveProgress(90);
      const saveRes = await fetch('/api/videos/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, filename: saveFileName, fileSize: blob.size }),
      });
      if (!saveRes.ok) throw new Error('Failed to save video metadata');

      setSaveProgress(100);
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      onError(error instanceof Error ? error.message : 'Failed to save video.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [runExport, videoId, fileName, onError, signal]);

  return { exporting, exportProgress, exportVideo, saving, saveProgress, saveVideo };
}
