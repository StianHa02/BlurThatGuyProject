'use client';

import { useState, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/config';

interface VideoMetadata {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
}

interface UseVideoUploadOptions {
  initialVideoId?: string;
  initialFileUrl?: string;
  initialFileName?: string;
  initialVideoMetadata?: VideoMetadata;
}

export function useVideoUpload({
  initialVideoId,
  initialFileUrl,
  initialFileName,
  initialVideoMetadata,
}: UseVideoUploadOptions = {}) {
  const [fileUrl, setFileUrl] = useState<string | null>(initialFileUrl ?? null);
  const [fileName, setFileName] = useState<string>(initialFileName ?? '');
  const [videoId, setVideoId] = useState<string | null>(initialVideoId ?? null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(initialVideoMetadata ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, WebM, etc.)');
      return false;
    }

    setError(null);
    fileRef.current = f;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    setFileUrl(url);

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
        setVideoMetadata(data.metadata || null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Upload failed:', errorData.error || response.statusText);
        setError(errorData.error || 'Upload failed');
        return false;
      }
    } catch (err) {
      console.error('Failed to upload video to backend:', err);
      setError('Failed to upload video to backend');
      return false;
    }

    return true;
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
