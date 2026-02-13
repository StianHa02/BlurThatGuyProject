'use client';

import { useState, useRef, useCallback } from 'react';

const API_URL = 'http://localhost:8000';

export function useVideoUpload() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [videoId, setVideoId] = useState<string | null>(null);
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

    // Upload video to backend for later export
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
      }
    } catch (err) {
      console.error('Failed to upload video to backend:', err);
    }

    return true;
  }, []);

  const reset = useCallback(() => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setFileName('');
    setVideoId(null);
    setError(null);
    fileRef.current = null;
  }, [fileUrl]);

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
