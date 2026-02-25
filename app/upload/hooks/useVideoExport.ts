'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/config';

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

  // Refs always hold the latest values, avoiding stale closures
  const selectedTrackIdsRef = useRef(selectedTrackIds);
  const tracksRef = useRef(tracks);

  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
    tracksRef.current = tracks;
  }, [selectedTrackIds, tracks]);

  const exportVideo = useCallback(async () => {
    const currentSelectedIds = selectedTrackIdsRef.current;
    const currentTracks = tracksRef.current;

    if (!videoId) {
      onError('No video uploaded.');
      return false;
    }

    if (currentSelectedIds.length === 0) {
      onError('Please select at least one face to blur before exporting.');
      return false;
    }

    setExportProgress(0);
    setExporting(true);
    setExportProgress(10);

    try {
      const payload = {
        tracks: currentTracks,
        selectedTrackIds: currentSelectedIds,
        padding: 0.4,
        blurAmount: 12,
      };

      const response = await fetch(`${API_URL}/export/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      setExportProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Export failed');
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
      onError(error instanceof Error ? error.message : 'Failed to export video. Make sure the backend is running.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, onError]); // Refs handle tracks/selectedTrackIds — no stale closure

  return {
    exporting,
    exportProgress,
    exportVideo,
  };
}