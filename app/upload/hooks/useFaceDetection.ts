'use client';

import { useState, useCallback, useRef } from 'react';
import { trackDetections } from '@/lib/tracker';
import { API_URL } from '@/lib/config';

interface UseDetectionOptions {
  sampleRate: number;
  fileUrl: string | null;
  fileRef: React.RefObject<File | null>;
  videoId: string | null;
  onError: (error: string) => void;
}

export function useFaceDetection({ sampleRate, fileUrl, videoId, onError }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentProgressRef = useRef(0);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  // Tick progress toward a ceiling, slowing down as it approaches
  // Never reaches the ceiling — leaves room for the real completion snap
  const startProgressTicker = useCallback((ceiling: number, totalMs: number) => {
    stopProgressTimer();
    currentProgressRef.current = 10;
    setProgress(10);

    const intervalMs = 500;
    const totalSteps = totalMs / intervalMs;
    let step = 0;

    progressTimerRef.current = setInterval(() => {
      step++;
      // Ease-out: progress slows as it approaches ceiling
      const ratio = step / totalSteps;
      const eased = 1 - Math.pow(1 - Math.min(ratio, 0.99), 2);
      const next = 10 + (ceiling - 10) * eased;
      currentProgressRef.current = next;
      setProgress(Math.round(next));

      // Hard stop just below ceiling — never overshoot
      if (next >= ceiling - 1) {
        stopProgressTimer();
      }
    }, intervalMs);
  }, [stopProgressTimer]);

  const runDetection = useCallback(async () => {
    if (!videoId || !fileUrl) return false;

    setProcessing(true);
    setProgress(0);
    setStatus('Reading video info...');

    // Get real video duration from the browser so we can estimate detection time accurately
    let estimatedMs = 20000; // fallback 20s
    try {
      const videoDuration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.src = fileUrl;
        v.muted = true;
        v.addEventListener('loadedmetadata', () => {
          resolve(v.duration);
          v.src = '';
        }, { once: true });
        // Timeout fallback
        setTimeout(() => resolve(30), 3000);
      });

      // Estimate: ~37ms per frame on 2 workers, at 30fps sampled every N frames
      const framesToProcess = Math.ceil((videoDuration * 30) / sampleRate);
      const msPerFrame = 37; // measured from your logs
      estimatedMs = (framesToProcess * msPerFrame) / 2; // 2 parallel workers
    } catch {
      // use fallback
    }

    try {
      setStatus('Detecting faces...');
      // Animate toward 88% over the estimated duration, easing out so it
      // naturally slows before the response arrives
      startProgressTicker(88, estimatedMs);

      const response = await fetch(`${API_URL}/detect-video/${videoId}?sample_rate=${sampleRate}`, {
        method: 'POST',
      });

      // Backend done — stop ticker, snap to 90%
      stopProgressTimer();
      setProgress(90);
      setStatus('Building face tracks...');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Detection failed');
      }

      const data: {
        fps: number;
        totalFrames: number;
        results: { frameIndex: number; faces: { bbox: [number, number, number, number]; score: number }[] }[];
      } = await response.json();

      const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};
      for (const result of data.results) {
        if (result.faces && result.faces.length > 0) {
          detectionsPerFrame[result.frameIndex] = result.faces.map(f => ({
            bbox: f.bbox,
            score: f.score,
          }));
        }
      }

      const builtTracks = trackDetections(detectionsPerFrame, {
        iouThreshold: 0.15,
        maxMisses: 20,
        minTrackLength: 3,
      });

      const totalSampledFrames = Math.ceil(data.totalFrames / sampleRate);
      const filteredTracks = builtTracks.filter(track => {
        const minDetections = Math.max(5, Math.floor(totalSampledFrames * 0.05));
        return track.frames.length >= Math.min(minDetections, 10);
      });

      filteredTracks.sort((a, b) => b.frames.length - a.frames.length);

      setTracks(filteredTracks);
      setSelectedTrackIds([]);
      setProgress(100);

      if (filteredTracks.length === 0) {
        setStatus('No faces detected');
        onError('No faces were detected in this video. Try adjusting the sample rate or use a video with visible faces.');
        setProcessing(false);
        return false;
      }

      setStatus(filteredTracks.length === 1 ? '1 person detected' : `${filteredTracks.length} people detected`);
      setProcessing(false);
      return true;

    } catch (err) {
      stopProgressTimer();
      console.error('Detection error:', err);
      onError(err instanceof Error ? err.message : 'Failed to run face detection. Make sure the backend is running.');
      setProcessing(false);
      setStatus('');
      return false;
    }
  }, [videoId, fileUrl, sampleRate, onError, startProgressTicker, stopProgressTimer]);

  const toggleTrack = useCallback((trackId: number) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTrackIds(tracks.map(t => t.id));
  }, [tracks]);

  const deselectAll = useCallback(() => {
    setSelectedTrackIds([]);
  }, []);

  const reset = useCallback(() => {
    stopProgressTimer();
    setTracks([]);
    setSelectedTrackIds([]);
    setProgress(0);
    setStatus('');
  }, [stopProgressTimer]);

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