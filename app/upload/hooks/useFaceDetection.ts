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

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const BATCH_SIZE = 25;
    const frameIndices: number[] = [];
    for (let fi = 0; fi < totalFrames; fi += sampleRate) {
      frameIndices.push(fi);
    }
    const totalFramesToScan = frameIndices.length;

    // STEP 1: Extract all frames sequentially (video seeking must be serial)
    const allFrames: { frameIndex: number; image: string }[] = [];

    for (const fi of frameIndices) {
      await new Promise<void>((resolve) => {
        video.currentTime = fi / frameRate;
        video.addEventListener('seeked', () => {
          ctx.drawImage(video, 0, 0, width, height);
          allFrames.push({
            frameIndex: fi,
            image: canvas.toDataURL('image/jpeg', 0.8),
          });
          resolve();
        }, { once: true });
      });

      const extracted = allFrames.length;
      setProgress(Math.round((extracted / totalFramesToScan) * 40));
      setStatus(`Extracting frames... ${extracted}/${totalFramesToScan}`);
      await new Promise(r => setTimeout(r, 0));
    }

    // STEP 2: Split into batches and fire ALL concurrently
    const batches: { frameIndex: number; image: string }[][] = [];
    for (let i = 0; i < allFrames.length; i += BATCH_SIZE) {
      batches.push(allFrames.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;
    let completedBatches = 0;
    const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};

    setStatus(`Detecting faces... 0/${totalBatches} batches`);

    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        try {
          const results = await detectFacesInBatch(batch);
          completedBatches++;
          setProgress(40 + Math.round((completedBatches / totalBatches) * 60));
          setStatus(`Detecting faces... ${completedBatches}/${totalBatches} batches`);
          return results;
        } catch (e) {
          console.error('Batch detection error:', e);
          completedBatches++;
          return batch.map(b => ({ frameIndex: b.frameIndex, faces: [] }));
        }
      })
    );

    // Merge results
    for (const results of batchResults) {
      for (const result of results) {
        if (result.faces && result.faces.length > 0) {
          detectionsPerFrame[result.frameIndex] = result.faces.map(d => ({
            bbox: d.bbox as [number, number, number, number],
            score: d.score,
          }));
        }
      }
    }

    setStatus('Building face tracks...');
    setProgress(100);

    const builtTracks = trackDetections(detectionsPerFrame, {
      iouThreshold: 0.15,
      maxMisses: 20,
      minTrackLength: 3,
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