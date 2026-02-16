'use client';

import { useState, useCallback } from 'react';
import { loadModels, detectFacesInBatch, resetTrackers } from '@/lib/faceClient';
import { trackDetections } from '@/lib/tracker';

interface UseDetectionOptions {
  sampleRate: number;
  fileUrl: string | null;
  fileRef: React.RefObject<File | null>;
  onError: (error: string) => void;
}

export function useFaceDetection({ sampleRate, fileUrl, fileRef, onError }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const runDetection = useCallback(async () => {
    const f = fileRef.current;
    if (!f || !fileUrl) return false;

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

    setStatus('Preparing video...');
    const video = document.createElement('video');
    video.src = fileUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;
    const frameRate = 30;
    const totalFrames = Math.ceil(duration * frameRate);
    const framesToScan = Math.ceil(totalFrames / sampleRate);

    setStatus(`Scanning ${framesToScan} frames...`);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};

    // BATCH PROCESSING: Process up to 150 frames at a time (maximum allowed by backend)
    const BATCH_SIZE = 150;
    const frameIndices: number[] = [];
    for (let fi = 0; fi < totalFrames; fi += sampleRate) {
      frameIndices.push(fi);
    }

    let framesProcessed = 0;

    // Process in batches
    for (let batchStart = 0; batchStart < frameIndices.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, frameIndices.length);
      const batchFrames = frameIndices.slice(batchStart, batchEnd);

      // Extract frames for this batch
      const batch: { frameIndex: number; image: string }[] = [];

      for (const fi of batchFrames) {
        await new Promise<void>((resolve) => {
          video.currentTime = fi / frameRate;
          const onSeek = () => {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = canvas.toDataURL('image/jpeg', 0.8); // Slightly lower quality for speed
            batch.push({ frameIndex: fi, image: imageData });
            resolve();
          };
          video.addEventListener('seeked', onSeek, { once: true });
        });
      }

      // Send batch to backend
      try {
        const results = await detectFacesInBatch(batch);

        // Store results
        for (const result of results) {
          if (result.faces && result.faces.length > 0) {
            detectionsPerFrame[result.frameIndex] = result.faces.map(d => ({
              bbox: d.bbox as [number, number, number, number],
              score: d.score
            }));
          }
        }
      } catch (e) {
        console.error('Batch detection error:', e);
      }

      framesProcessed += batchFrames.length;
      const currentProgress = Math.round((framesProcessed / framesToScan) * 100);
      setProgress(currentProgress);
      setStatus(`Analyzing video... ${currentProgress}%`);
    }

    setStatus('Building face tracks...');
    setProgress(100);

    const builtTracks = trackDetections(detectionsPerFrame, {
      iouThreshold: 0.15,
      maxMisses: 20,
      minTrackLength: 3
    });

    const totalSampledFrames = Math.ceil(totalFrames / sampleRate);
    const filteredTracks = builtTracks.filter(track => {
      const minDetections = Math.max(5, Math.floor(totalSampledFrames * 0.05));
      return track.frames.length >= Math.min(minDetections, 10);
    });

    filteredTracks.sort((a, b) => b.frames.length - a.frames.length);

    setTracks(filteredTracks);
    setSelectedTrackIds([]);

    if (filteredTracks.length === 0) {
      setStatus('No faces detected');
      onError('No faces were detected in this video. Try adjusting the sample rate or use a video with visible faces.');
    } else if (filteredTracks.length === 1) {
      setStatus('1 person detected');
    } else {
      setStatus(`${filteredTracks.length} people detected`);
    }

    setProcessing(false);
    return filteredTracks.length > 0;
  }, [fileUrl, fileRef, sampleRate, onError]);

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