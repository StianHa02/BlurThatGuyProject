'use client';

import { useState, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/config';

export function useVideoUpload() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const fileUrlRef = useRef<string | null>(null);

  const MAX_UPLOAD_SIZE_MB = 100;

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, WebM, etc.)');
      return false;
    }

    if (f.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB.`);
      return false;
    }

    setError(null);
    fileRef.current = f;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    fileUrlRef.current = url;
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
    // Use ref to avoid stale closure over fileUrl state
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    setFileUrl(null);
    setFileName('');
    setVideoId(null);
    setError(null);
    fileRef.current = null;
  }, []);

  return {
    fileUrl,
    fileName,
    videoId,
    error,
    setError,
    fileRef,
    handleFile,
    reset,
  };
}