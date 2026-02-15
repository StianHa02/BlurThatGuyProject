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

  // Use refs to always get the latest values (fixes stale closure bug)
  const selectedTrackIdsRef = useRef(selectedTrackIds);
  const tracksRef = useRef(tracks);

  useEffect(() => {
    console.log('🔄 useVideoExport: selectedTrackIds updated to:', selectedTrackIds);
    selectedTrackIdsRef.current = selectedTrackIds;
    tracksRef.current = tracks;
  }, [selectedTrackIds, tracks]);

  const exportVideo = useCallback(async () => {
    console.log('🚀 exportVideo called');
    console.log('📦 Props selectedTrackIds:', selectedTrackIds);
    console.log('📌 Ref selectedTrackIds:', selectedTrackIdsRef.current);
    console.log('🎬 videoId:', videoId);
    console.log('📊 tracks length:', tracks.length);

    // Get the latest values from refs (not from closure)
    const currentSelectedIds = selectedTrackIdsRef.current;
    const currentTracks = tracksRef.current;

    console.log('✅ Using currentSelectedIds:', currentSelectedIds);
    console.log('✅ Length check:', currentSelectedIds.length);

    if (!videoId) {
      console.error('❌ No videoId');
      onError('No video uploaded.');
      return false;
    }

    if (currentSelectedIds.length === 0) {
      console.error('❌ No faces selected. currentSelectedIds:', currentSelectedIds);
      onError('Please select at least one face to blur before exporting.');
      return false;
    }

    console.log('✅ Validation passed, starting export...');
    setExporting(true);
    setExportProgress(10);

    try {
      const payload = {
        tracks: currentTracks,
        selectedTrackIds: currentSelectedIds,
        padding: 0.4,
        blurAmount: 12,
      };
      console.log('📤 Sending payload:', payload);

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
        console.error('❌ Export failed:', errorData);
        throw new Error(errorData.error || 'Export failed');
      }

      console.log('✅ Export successful, downloading...');
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
      console.log('✅ Download complete');
      return true;
    } catch (error) {
      console.error('❌ Export error:', error);
      onError(error instanceof Error ? error.message : 'Failed to export video. Make sure the backend is running.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [videoId, fileName, onError, selectedTrackIds, tracks]); // Include them to force recreation on change

  return {
    exporting,
    exportProgress,
    exportVideo,
  };
}