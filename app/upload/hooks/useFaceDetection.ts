'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { loadModels, detectFacesInVideo, getJobStatus, getJobResult, cancelJob } from '@/lib/services/faceClient';
import type { Track } from '@/types';

interface UseDetectionOptions {
  sampleRate: number;
  videoId: string | null;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useFaceDetection({ sampleRate, videoId, onError, signal }: UseDetectionOptions) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [queued, setQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  const lastProgressRef = useRef<number>(0);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleUnload = () => {
      if (activeJobIdRef.current) {
        navigator.sendBeacon(`/api/job/${activeJobIdRef.current}/cancel`);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const runDetection = useCallback(async () => {
    if (!videoId) {
      onError('Video must be uploaded before detection.');
      return false;
    }

    setProcessing(true);
    setQueued(false);
    setQueuePosition(null);
    setProgress(0);
    lastProgressRef.current = 0;
    setStatus('Connecting to face detector...');

    try {
      await loadModels();
      setStatus('Detecting faces...');
      setProgress(0);
      lastProgressRef.current = 0;
    } catch {
      onError('Failed to connect to face detector. Make sure the Python backend is running.');
      setProcessing(false);
      setStatus('');
      return false;
    }

    try {
      const result = await detectFacesInVideo(videoId, sampleRate, (p) => {
        const num = Math.max(0, Math.min(100, Number(p) || 0));
        setProgress((prev) => {
          const next = Math.max(prev, Math.round(num));
          lastProgressRef.current = next;
          return next;
        });

        if (num < 85) setStatus('Detecting faces...');
        else setStatus('Building face tracks...');
      }, signal, (jobId) => {
        activeJobIdRef.current = jobId;
      });

      let builtTracks: Track[] = [];

      if (result.kind === 'queued') {
        activeJobIdRef.current = result.jobId;
        setQueued(true);
        setProgress(0);
        setStatus('Queued for processing...');

        let runningSeen = false;
        while (true) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

          const job = await getJobStatus(result.jobId, signal);
          if (job.status === 'queued') {
            setQueued(true);
            setQueuePosition(job.position ?? null);
            setStatus('Queued for processing...');
          } else if (job.status === 'running') {
            if (!runningSeen) {
              // Reset progress floor so promoted jobs start cleanly from backend progress.
              setProgress(0);
              lastProgressRef.current = 0;
              runningSeen = true;
            }
            setQueued(false);
            setQueuePosition(null);
            if (job.progress != null) {
              setProgress((prev) => Math.max(prev, Math.round(job.progress!)));
              setStatus(job.progress < 85 ? 'Detecting faces...' : 'Building face tracks...');
            } else {
              setStatus('Detecting faces...');
            }
          } else if (job.status === 'done') {
            if (!runningSeen) {
              setQueued(false);
            }
            builtTracks = await getJobResult(result.jobId, signal);
            break;
          } else if (job.status === 'error') {
            throw new Error('Detection job failed while processing in queue.');
          }

          const pollMs = job.status === 'running' ? 1000 : 2000;
          await sleep(pollMs);
        }
      } else {
        activeJobIdRef.current = result.jobId;
        builtTracks = result.tracks;
      }

      setTracks(builtTracks);
      setSelectedTrackIds([]);

      if (builtTracks.length === 0) {
        setStatus('No faces detected');
        onError('No faces were detected. Try adjusting the sample rate.');
      } else {
        setStatus(`${builtTracks.length} ${builtTracks.length === 1 ? 'person' : 'people'} detected`);
      }

      setProgress(100);
      lastProgressRef.current = 100;
      activeJobIdRef.current = null;
      setProcessing(false);
      setQueued(false);
      setQueuePosition(null);
      return builtTracks.length > 0;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (activeJobIdRef.current) {
          cancelJob(activeJobIdRef.current);
          activeJobIdRef.current = null;
        }
        setProcessing(false);
        setQueued(false);
        setQueuePosition(null);
        setStatus('');
        return false;
      }
      onError(err instanceof Error ? err.message : 'An error occurred during face detection.');
      setProcessing(false);
      setQueued(false);
      setQueuePosition(null);
      setStatus('');
      return false;
    }
  }, [videoId, sampleRate, onError, signal]);

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
    setQueued(false);
    setQueuePosition(null);
    activeJobIdRef.current = null;
  }, []);

  return {
    tracks,
    selectedTrackIds,
    processing,
    progress,
    status,
    queued,
    queuePosition,
    runDetection,
    toggleTrack,
    selectAll,
    deselectAll,
    reset,
  };
}