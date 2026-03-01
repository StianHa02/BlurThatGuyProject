'use client';

import { useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';
import { Track } from '@/lib/tracker';

interface UseExportOptions {
  videoId: string | null;
  fileName: string;
  tracks: Track[];
  selectedTrackIds: number[];
  sampleRate: number;
  onError: (error: string) => void;
}

export function useVideoExport({ videoId, fileName, tracks, selectedTrackIds, sampleRate, onError }: UseExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const exportVideo = useCallback(async () => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    if (selectedTrackIds.length === 0) { onError('Please select at least one face to blur.'); return false; }

    setExporting(true);
    setExportProgress(10);

    try {
      const response = await fetch(`${API_URL}/export/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, selectedTrackIds, padding: 0.4, blurAmount: 12, sampleRate }),
      });

      setExportProgress(80);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        // Pydantic validation errors use `detail`, other errors use `error`
        const message = typeof err.detail === 'string'
          ? err.detail
          : Array.isArray(err.detail)
          ? err.detail.map((e: { msg: string }) => e.msg).join(', ')
          : err.error || 'Export failed';
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `blurred-${fileName || 'video.mp4'}` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setExportProgress(100);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to export video.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, tracks, selectedTrackIds, sampleRate, onError]);

  return { exporting, exportProgress, exportVideo };
}