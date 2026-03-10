'use client';

import { useState, useCallback, useRef } from 'react';
import { loadModels, detectFacesInVideo } from '@/lib/faceClient';
import { Track } from '@/lib/tracker';

interface UseDetectionOptions {
  sampleRate: number;
  videoId: string | null;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export function useFaceDetection({ sampleRate, videoId, onError, signal }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  // Keep last progress in a ref to prevent regressions
  const lastProgressRef = useRef<number>(0);

  const runDetection = useCallback(async () => {
    if (!videoId) {
      onError('Video must be uploaded before detection.');
      return false;
    }

    setProcessing(true);
    setProgress(0);
    lastProgressRef.current = 0;
    setStatus('Connecting to face detector...');

    try {
      await loadModels();
      setStatus('Detecting faces...');
      setProgress(10);
      lastProgressRef.current = 10;
    } catch {
      onError('Failed to connect to face detector. Make sure the Python backend is running.');
      setProcessing(false);
      setStatus('');
      return false;
    }

    try {
      // Returns Track[] directly — tracking is server-side, no client processing needed
      const builtTracks = await detectFacesInVideo(videoId, sampleRate, (p) => {
        // Ensure progress is numeric and clamped 0-100
        const num = Math.max(0, Math.min(100, Number(p) || 0));
        // Never move backward (except when explicitly reset)
        setProgress((prev) => {
          const next = Math.max(prev, Math.round(num));
          lastProgressRef.current = next;
          return next;
        });

        if (num < 85) setStatus('Detecting faces...');
        else setStatus('Building face tracks...');
      }, signal);

      setTracks(builtTracks);
      setSelectedTrackIds([]);

      if (builtTracks.length === 0) {
        setStatus('No faces detected');
        onError('No faces were detected. Try adjusting the sample rate.');
      } else {
        setStatus(`${builtTracks.length} ${builtTracks.length === 1 ? 'person' : 'people'} detected`);
      }

      // Ensure final progress moves to 100
      setProgress(100);
      lastProgressRef.current = 100;
      setProcessing(false);
      return builtTracks.length > 0;
    } catch (err) {
      if ((err as Error).name === 'AbortError') { setProcessing(false); setStatus(''); return false; }
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
    lastProgressRef.current = 0;
    setStatus('');
  }, []);

  return { tracks, selectedTrackIds, processing, progress, status, runDetection, toggleTrack, selectAll, deselectAll, reset };
}