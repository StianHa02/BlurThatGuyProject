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

  const exportVideo = useCallback(async () => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    if (selectedTrackIds.length === 0) { onError('Please select at least one face to blur.'); return false; }

    setExporting(true);
    setExportProgress(0);

    try {
      const response = await fetch(`${API_URL}/export/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedTrackIds,
          padding: 0.4,
          targetBlocks: 12,
          sampleRate,
          blurMode,
        }),
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

      if (!response.body) {
        throw new Error('No response stream');
      }

      // Read the NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'progress') {
              setExportProgress(event.progress);
            } else if (event.type === 'done') {
              setExportProgress(100);
              // Trigger download via the new download endpoint — no buffering
              const a = Object.assign(document.createElement('a'), {
                href: `${API_URL}/download/${videoId}`,
                download: `blurred-${fileName || 'video.mp4'}`,
              });
              document.body.appendChild(a);
              a.click();
              a.remove();
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

      // If we exited the loop without a 'done' event
      throw new Error('Export stream ended unexpectedly');
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      onError(error instanceof Error ? error.message : 'Failed to export video.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, selectedTrackIds, sampleRate, blurMode, onError]);

  return { exporting, exportProgress, exportVideo };
}