'use client';

import { useState, useCallback } from 'react';

const API_URL = 'http://localhost:8000';

interface UseExportOptions {
  videoId: string | null;
  fileName: string;
  tracks: any[];
  selectedTrackIds: number[];
  onError: (error: string) => void;
}

export function useVideoExport({ videoId, fileName, tracks, selectedTrackIds, onError }: UseExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const exportVideo = useCallback(async () => {
    if (!videoId || selectedTrackIds.length === 0) {
      onError('Please select at least one face to blur before exporting.');
      return false;
    }

    setExporting(true);
    setExportProgress(10);

    try {
      const response = await fetch(`${API_URL}/export/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks,
          selectedTrackIds,
          padding: 0.4,
          blurAmount: 12,
        }),
      });

      setExportProgress(80);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `blurred-${fileName || 'video.mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      return true;
    } catch (error) {
      console.error('Export error:', error);
      onError('Failed to export video. Make sure the backend is running.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, tracks, selectedTrackIds, onError]);

  return {
    exporting,
    exportProgress,
    exportVideo,
  };
}
