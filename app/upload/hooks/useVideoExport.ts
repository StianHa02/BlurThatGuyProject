'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/config';

interface UseExportOptions {
  videoId: string | null;
  fileName: string;
  tracks: any[];
  selectedTrackIds: number[];
  sampleRate: number;
  onError: (error: string) => void;
}

export function useVideoExport({ videoId, fileName, tracks, selectedTrackIds, sampleRate, onError }: UseExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Use refs to always get the latest values (fixes stale closure bug)
  const selectedTrackIdsRef = useRef(selectedTrackIds);
  const tracksRef = useRef(tracks);
  const sampleRateRef = useRef(sampleRate);

  useEffect(() => {
    selectedTrackIdsRef.current = selectedTrackIds;
    tracksRef.current = tracks;
    sampleRateRef.current = sampleRate;
  }, [selectedTrackIds, tracks, sampleRate]);

  const exportVideo = useCallback(async () => {
    // Get the latest values from refs (not from closure)
    const currentSelectedIds = selectedTrackIdsRef.current;
    const currentTracks = tracksRef.current;
    const currentSampleRate = sampleRateRef.current;

    if (!videoId) {
      onError('No video uploaded.');
      return false;
    }

    if (currentSelectedIds.length === 0) {
      onError('Please select at least one face to blur before exporting.');
      return false;
    }

    setExporting(true);
    setExportProgress(10);

    try {
      const payload = {
        tracks: currentTracks,
        selectedTrackIds: currentSelectedIds,
        padding: 0.4,
        blurAmount: 12,
        sampleRate: currentSampleRate,
      };

      // Use the proxied API route
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
      console.error('❌ Export error:', error);
      onError(error instanceof Error ? error.message : 'Failed to export video. Make sure the backend is running.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, onError]); // Simplified deps since we use refs

  return {
    exporting,
    exportProgress,
    exportVideo,
  };
}