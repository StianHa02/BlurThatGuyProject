'use client';

import { useState, useCallback } from 'react';
import { loadModels, detectFacesInVideo, resetTrackers } from '@/lib/faceClient';
import { trackDetections } from '@/lib/tracker';

interface UseDetectionOptions {
  sampleRate: number;
  fileUrl: string | null;
  videoId: string | null;
  fileRef: React.RefObject<File | null>;
  onError: (error: string) => void;
}

export function useFaceDetection({ sampleRate, fileUrl, videoId, fileRef, onError }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const runDetection = useCallback(async () => {
    if (!videoId) {
      onError('Video must be uploaded before detection.');
      return false;
    }

    setProcessing(true);
    setProgress(0);
    setStatus('Connecting to face detector...');

    resetTrackers();

    try {
      await loadModels();
      setStatus('Face detector ready');
    } catch (err) {
      console.error('Failed to load face detector:', err);
      onError('Failed to connect to face detector. Make sure the Python backend is running on port 8000.');
      setProcessing(false);
      setStatus('');
      return false;
    }

    setStatus('Detecting faces (server-side)...');
    setProgress(10);

    try {
      // Use the new server-side detection endpoint with progress support
      const allResults = await detectFacesInVideo(videoId, sampleRate, (p) => {
        // Map 0-100 to 10-80% for smoother integration with existing progress steps
        const scaledProgress = 10 + (p * 0.7);
        setProgress(Math.round(scaledProgress));
      });
      
      setProgress(80);
      setStatus('Building face tracks...');

      const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};
      for (const res of allResults) {
        if (res.faces && res.faces.length > 0) {
          detectionsPerFrame[res.frameIndex] = res.faces.map(d => ({
            bbox: d.bbox as [number, number, number, number],
            score: d.score,
          }));
        }
      }

      const builtTracks = trackDetections(detectionsPerFrame, {
        iouThreshold: 0.1,
        maxMisses: 20,
        minTrackLength: 2,
      });

      const filteredTracks = [...builtTracks];

      filteredTracks.sort((a, b) => b.frames.length - a.frames.length);

      setTracks(filteredTracks);
      setSelectedTrackIds([]);

      if (filteredTracks.length === 0) {
        setStatus('No faces detected');
        onError('No faces were detected in this video. Try adjusting the sample rate.');
      } else {
        setStatus(`${filteredTracks.length} ${filteredTracks.length === 1 ? 'person' : 'people'} detected`);
      }

      setProgress(100);
      setProcessing(false);
      return filteredTracks.length > 0;

    } catch (err) {
      console.error('Detection error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during face detection.';
      onError(errorMessage);
      setProcessing(false);
      setStatus('');
      return false;
    }
  }, [videoId, sampleRate, onError]);

  const toggleTrack = useCallback((trackId: number) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId)
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTrackIds(tracks.map(t => t.id));
  }, [tracks]);

  const deselectAll = useCallback(() => {
    setSelectedTrackIds([]);
  }, []);

  const reset = useCallback(() => {
    setTracks([]);
    setSelectedTrackIds([]);
    setProgress(0);
    setStatus('');
  }, []);

  return {
    tracks,
    selectedTrackIds,
    processing,
    progress,
    status,
    runDetection,
    toggleTrack,
    selectAll,
    deselectAll,
    reset,
  };
}