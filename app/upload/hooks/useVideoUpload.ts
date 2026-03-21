'use client';

import { useState, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/config';

export function useVideoUpload() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    fps: number;
    width: number;
    height: number;
    frameCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);

  const handleFile = useCallback(async (f: File): Promise<{ videoId: string; metadata: typeof videoMetadata } | null> => {
    if (!f.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, WebM, etc.)');
      return null;
    }

    setError(null);
    fileRef.current = f;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    setFileUrl(url);

    // Upload video to backend (via API proxy)
    try {
      const formData = new FormData();
      formData.append('file', f);
      const response = await fetch(`${API_URL}/upload-video`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setVideoId(data.videoId);
        const meta = data.metadata || null;
        setVideoMetadata(meta);
        return { videoId: data.videoId, metadata: meta };
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Upload failed:', errorData.error || response.statusText);
        setError(errorData.error || 'Upload failed');
        return null;
      }
    } catch (err) {
      console.error('Failed to upload video to backend:', err);
      setError('Failed to upload video to backend');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setFileName('');
    setVideoId(null);
    setVideoMetadata(null);
    setError(null);
    fileRef.current = null;
  }, [fileUrl]);

  return {
    fileUrl,
    fileName,
    videoId,
    videoMetadata,
    error,
    setError,
    fileRef,
    handleFile,
    reset,
  };
}