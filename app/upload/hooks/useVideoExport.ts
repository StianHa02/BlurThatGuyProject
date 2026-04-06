'use client';

import { useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';
import type { Track } from '@/types';

interface UseExportOptions {
  videoId: string | null;
  fileName: string;
  selectedTrackIds: number[];
  sampleRate: number;
  blurMode: 'pixelate' | 'blackout';
  tracks: Track[];
  videoMetadata: { fps: number; frameCount: number; width: number; height: number } | null;
  fileRef: React.MutableRefObject<File | null>;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export function useVideoExport({ videoId, fileName, selectedTrackIds, sampleRate, blurMode, tracks, videoMetadata, fileRef, onError, signal }: UseExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [savingProject, setSavingProject] = useState(false);
  const [saveProjectProgress, setSaveProjectProgress] = useState(0);

  // Shared by exportVideo and saveProject (export phase)
  const runExport = useCallback(async (onProgress: (p: number) => void): Promise<boolean> => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    if (selectedTrackIds.length === 0) { onError('Please select at least one face to blur.'); return false; }

    onProgress(0);

    const response = await fetch(`${API_URL}/export/${videoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedTrackIds, padding: 0.4, targetBlocks: 12, sampleRate, blurMode }),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const message = typeof err.detail === 'string'
        ? err.detail
        : Array.isArray(err.detail)
        ? err.detail.map((e: { msg: string }) => e.msg).join(', ')
        : err.error || 'Export failed';
      throw new Error(message);
    }

    if (!response.body) throw new Error('No response stream');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type === 'progress') {
            onProgress(event.progress);
          } else if (event.type === 'done') {
            onProgress(100);
            return true;
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Export failed');
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    throw new Error('Export stream ended unexpectedly');
  }, [videoId, selectedTrackIds, sampleRate, blurMode, onError, signal]);

  /** Download: export then trigger browser download */
  const exportVideo = useCallback(async () => {
    setExporting(true);
    try {
      const ok = await runExport(setExportProgress);
      if (!ok) return false;
      const a = Object.assign(document.createElement('a'), {
        href: `${API_URL}/download/${videoId}`,
        download: `blurred-${fileName || 'video.mp4'}`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      onError(error instanceof Error ? error.message : 'Failed to export video.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [runExport, videoId, fileName, onError]);

  /** Save Project: upload original video + tracks JSON to S3, save metadata to Supabase.
   *  Does NOT render a blurred video — the original is saved so the user can re-edit later. */
  const saveProject = useCallback(async () => {
    if (!videoId) { onError('No video uploaded.'); return false; }
    if (tracks.length === 0) { onError('No faces detected. Run detection before saving.'); return false; }
    if (!fileRef.current) { onError('Original video file is no longer available.'); return false; }

    setSavingProject(true);
    try {
      const file = fileRef.current;
      const saveFileName = fileName || 'video.mp4';

      // 1. Presign original video upload (0–10%)
      setSaveProjectProgress(5);
      const presignRes = await fetch('/api/projects/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: saveFileName, contentType: file.type || 'video/mp4', fileSize: file.size }),
        signal,
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get upload URL. Are you signed in?');
      }
      const { uploadUrl: originalUploadUrl, key: originalKey } = await presignRes.json();

      // 2. Upload original video to S3 (10–70%)
      setSaveProjectProgress(15);
      const videoUploadRes = await fetch(originalUploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'video/mp4' },
        signal,
      });
      if (!videoUploadRes.ok) {
        const xml = await videoUploadRes.text().catch(() => '');
        const match = xml.match(/<Message>(.*?)<\/Message>/);
        const code  = xml.match(/<Code>(.*?)<\/Code>/);
        const s3Msg = match?.[1] ?? `HTTP ${videoUploadRes.status}`;
        const s3Code = code?.[1] ? ` (${code[1]})` : '';
        throw new Error(`S3 upload failed${s3Code}: ${s3Msg}`);
      }
      setSaveProjectProgress(70);

      // 3. Presign tracks JSON upload (70–75%)
      const tracksPresignRes = await fetch('/api/projects/presign-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: saveFileName }),
        signal,
      });
      if (!tracksPresignRes.ok) {
        const err = await tracksPresignRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get tracks upload URL.');
      }
      const { uploadUrl: tracksUploadUrl, key: tracksKey } = await tracksPresignRes.json();

      // 4. Upload tracks JSON to S3 (75–90%)
      setSaveProjectProgress(78);
      const tracksBlob = new Blob([JSON.stringify(tracks)], { type: 'application/json' });
      const tracksUploadRes = await fetch(tracksUploadUrl, {
        method: 'PUT',
        body: tracksBlob,
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (!tracksUploadRes.ok) {
        throw new Error(`Failed to upload tracks data: HTTP ${tracksUploadRes.status}`);
      }
      setSaveProjectProgress(90);

      // 5. Save project metadata to Supabase (90–100%)
      const saveRes = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalKey,
          tracksKey,
          filename: saveFileName,
          fps: videoMetadata?.fps ?? 30,
          frameCount: videoMetadata?.frameCount ?? 0,
          width: videoMetadata?.width ?? null,
          height: videoMetadata?.height ?? null,
          sampleRate,
          trackCount: tracks.length,
          fileSize: file.size,
        }),
        signal,
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(`Failed to save project: ${err.error ?? saveRes.status}`);
      }

      setSaveProjectProgress(100);
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      onError(error instanceof Error ? error.message : 'Failed to save project.');
      return false;
    } finally {
      setSavingProject(false);
    }
  }, [videoId, fileName, tracks, videoMetadata, fileRef, sampleRate, onError, signal]);

  return { exporting, exportProgress, exportVideo, savingProject, saveProjectProgress, saveProject };
}
