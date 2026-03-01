'use client';

import { useState, useCallback } from 'react';
import { loadModels, detectFacesInVideo } from '@/lib/faceClient';
import { trackDetections, Track } from '@/lib/tracker';

interface UseDetectionOptions {
  sampleRate: number;
  videoId: string | null;
  onError: (error: string) => void;
}

export function useFaceDetection({ sampleRate, videoId, onError }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<Track[]>([]);
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

    try {
      await loadModels();
      setStatus('Detecting faces...');
      setProgress(10);
    } catch {
      onError('Failed to connect to face detector. Make sure the Python backend is running.');
      setProcessing(false);
      setStatus('');
      return false;
    }

    try {
      const allResults = await detectFacesInVideo(videoId, sampleRate, (p) => {
        setProgress(Math.round(10 + p * 0.7));
      });

      setProgress(80);
      setStatus('Building face tracks...');

      const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};
      for (const res of allResults) {
        if (res.faces.length > 0) {
          detectionsPerFrame[res.frameIndex] = res.faces;
        }
      }

      const builtTracks = trackDetections(detectionsPerFrame, {
        iouThreshold: 0.1,
        maxMisses: 20,
        minTrackLength: 5, // Raised from 2 — filters out brief false detections
      }).sort((a, b) => b.frames.length - a.frames.length);

      setTracks(builtTracks);
      setSelectedTrackIds([]);

      if (builtTracks.length === 0) {
        setStatus('No faces detected');
        onError('No faces were detected. Try adjusting the sample rate.');
      } else {
        setStatus(`${builtTracks.length} ${builtTracks.length === 1 ? 'person' : 'people'} detected`);
      }

      setProgress(100);
      setProcessing(false);
      return builtTracks.length > 0;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'An error occurred during face detection.');
      setProcessing(false);
      setStatus('');
      return false;
    }
  }, [videoId, sampleRate, onError]);

  const toggleTrack = useCallback((trackId: number) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }, []);

  const selectAll = useCallback(() => setSelectedTrackIds(tracks.map(t => t.id)), [tracks]);
  const deselectAll = useCallback(() => setSelectedTrackIds([]), []);
  const reset = useCallback(() => {
    setTracks([]);
    setSelectedTrackIds([]);
    setProgress(0);
    setStatus('');
  }, []);

  return { tracks, selectedTrackIds, processing, progress, status, runDetection, toggleTrack, selectAll, deselectAll, reset };
}