import { useState, useEffect } from 'react';
import type { Track } from '@/types';
import { frameToTime, isBlackFrame, padBBox } from '../utils/videoUtils';

export function useThumbnailExtraction(
  tracks: Track[],
  videoUrl: string,
  fps: number
): { thumbnails: Map<number, string>; loading: boolean } {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const extractThumbnails = async () => {
      setThumbnails(new Map());
      if (tracks.length === 0) return;
      setLoading(true);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';

      const cleanupVideo = () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      };

      // Phase 1: Wait for metadata (fast — just HTTP headers for dimensions/duration)
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) { resolve(); return; }
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Video load error')), { once: true });
        setTimeout(resolve, 5000);
        video.load();
      });
      if (signal.aborted) { cleanupVideo(); return; }

      // Phase 2: Wait for first frame to be decodable (needed before seeking works)
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) { resolve(); return; }
        video.addEventListener('canplay', () => resolve(), { once: true });
        setTimeout(resolve, 15000);
      });
      if (signal.aborted) { cleanupVideo(); return; }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { cleanupVideo(); return; }

      const newThumbnails = new Map<number, string>();

      const seekTo = (time: number): Promise<void> =>
        new Promise<void>((resolve) => {
          const TIMEOUT_MS = 8000;
          let settled = false;

          const settle = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => settle();

          const onSeeked = () => {
            if (video.readyState >= 2) {
              settle();
            } else {
              const dataTimer = setTimeout(settle, 5000);
              video.addEventListener('canplay', () => {
                clearTimeout(dataTimer);
                settle();
              }, { once: true });
            }
          };

          const timer = setTimeout(settle, TIMEOUT_MS);
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onError, { once: true });

          if (Math.abs(video.currentTime - time) < 0.001) {
            if (video.readyState >= 2) {
              settle();
            } else {
              const dataTimer = setTimeout(settle, 5000);
              video.addEventListener('canplay', () => {
                clearTimeout(dataTimer);
                settle();
              }, { once: true });
            }
          } else {
            video.currentTime = time;
          }
        });

      // Sort by seek time for sequential access (reduces HTTP range request thrashing)
      const sortedTracks = [...tracks].sort((a, b) => {
        const aMid = a.frames[Math.floor(a.frames.length / 2)]?.frameIndex ?? 0;
        const bMid = b.frames[Math.floor(b.frames.length / 2)]?.frameIndex ?? 0;
        return aMid - bMid;
      });

      for (const track of sortedTracks) {
        if (signal.aborted) break;

        const middleIndex = Math.floor(track.frames.length / 2);
        const frame = track.frames[middleIndex];
        if (!frame) continue;

        const frameTime = frameToTime(frame.frameIndex, fps);
        await seekTo(frameTime);
        if (signal.aborted) break;

        const { x, y, w, h } = padBBox(frame.bbox, 0.3, video.videoWidth, video.videoHeight);

        const thumbSize = 96;
        canvas.width = thumbSize;
        canvas.height = thumbSize;

        ctx.drawImage(video, x, y, w, h, 0, 0, thumbSize, thumbSize);

        // Retry up to 2 times if we got a black frame (likely unbuffered)
        if (isBlackFrame(ctx, thumbSize)) {
          for (let retry = 0; retry < 2; retry++) {
            if (signal.aborted) break;
            await new Promise<void>((resolve) => {
              if (video.readyState >= 2) {
                setTimeout(resolve, 300);
              } else {
                const t = setTimeout(resolve, 2000);
                video.addEventListener('canplay', () => { clearTimeout(t); setTimeout(resolve, 100); }, { once: true });
              }
            });
            await seekTo(frameTime);
            ctx.drawImage(video, x, y, w, h, 0, 0, thumbSize, thumbSize);
            if (!isBlackFrame(ctx, thumbSize)) break;
          }
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        newThumbnails.set(track.id, dataUrl);
        if (!signal.aborted) setThumbnails(new Map(newThumbnails));
      }

      cleanupVideo();
      if (!signal.aborted) setLoading(false);
    };

    extractThumbnails().catch(err => {
      if (signal.aborted) return;
      console.error('Thumbnail extraction failed:', err);
      setLoading(false);
    });

    return () => { controller.abort(); };
  }, [tracks, videoUrl, fps]);

  return { thumbnails, loading };
}
