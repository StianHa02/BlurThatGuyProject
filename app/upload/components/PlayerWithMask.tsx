'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export type BBox = [number, number, number, number];

export interface Detection {
  frameIndex: number;
  bbox: BBox;
  score: number;
}

export interface Track {
  id: number;
  frames: Detection[];
  startFrame: number;
  endFrame: number;
  thumbnailFrameIndex: number;
}

interface Props {
  videoUrl: string;
  tracks: Track[];
  selectedTrackIds: number[];
  onToggleTrack: (trackId: number) => void;
  blur: boolean;
  sampleRate: number;
  fps: number;
}

/**
 * Find detection for frame - with interpolation for smoother playback
 */
function findDetectionForFrame(
  frames: Detection[],
  frameIndex: number,
  sampleRate: number
): { bbox: BBox; score: number } | null {
  if (!frames || frames.length === 0) return null;

  // Binary search for the interval containing frameIndex
  let left = 0;
  let right = frames.length - 1;

  if (frameIndex < frames[0].frameIndex - 20) return null;
  if (frameIndex > frames[frames.length - 1].frameIndex + 20) return null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (frames[mid].frameIndex === frameIndex) {
      return { bbox: frames[mid].bbox, score: frames[mid].score };
    }
    if (frames[mid].frameIndex < frameIndex) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  // If not found, left is the index of the first element greater than frameIndex
  const prev = frames[left - 1];
  const next = frames[left];

  const maxGap = 20; // Match tracker maxMisses

  // No padding for first/last detections as per user request to avoid "ghost" masks.
  const padding = 0;

  if (prev && !next) {
    return (frameIndex - prev.frameIndex <= padding) ? { bbox: prev.bbox, score: prev.score } : null;
  }
  if (!prev && next) {
    return (next.frameIndex - frameIndex <= padding) ? { bbox: next.bbox, score: next.score } : null;
  }

  if (prev && next) {
    const gap = next.frameIndex - prev.frameIndex;
    if (gap > maxGap) {
      if (frameIndex === prev.frameIndex) return { bbox: prev.bbox, score: prev.score };
      if (frameIndex === next.frameIndex) return { bbox: next.bbox, score: next.score };
      return null;
    }

    // Interpolate
    const t = (frameIndex - prev.frameIndex) / gap;
    return {
      bbox: [
        prev.bbox[0] + (next.bbox[0] - prev.bbox[0]) * t,
        prev.bbox[1] + (next.bbox[1] - prev.bbox[1]) * t,
        prev.bbox[2] + (next.bbox[2] - prev.bbox[2]) * t,
        prev.bbox[3] + (next.bbox[3] - prev.bbox[3]) * t,
      ],
      score: prev.score * (1 - t) + next.score * t
    };
  }

  return null;
}

export default function PlayerWithMask({
  videoUrl,
  tracks,
  selectedTrackIds,
  onToggleTrack,
  blur,
  sampleRate,
  fps
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(-1);
  const [visibleFaces, setVisibleFaces] = useState<{trackId: number, bbox: BBox, isSelected: boolean}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Memoize tracks map
  const tracksMap = useMemo(() => {
    const m = new Map<number, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  // Memoize selected set for O(1) lookup
  const selectedSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);

  // Main drawing effect
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const syncCanvasSize = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      const rect = video.getBoundingClientRect();
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setVideoReady(true);
    };

    const handlePlay = () => { syncCanvasSize(); setIsPlaying(true); };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', syncCanvasSize);
    video.addEventListener('resize', syncCanvasSize);
    video.addEventListener('canplay', syncCanvasSize);
    window.addEventListener('resize', syncCanvasSize);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    if (video.readyState >= 1) syncCanvasSize();

    function draw() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const frameIndex = Math.round(video.currentTime * fps);

      // Skip if same frame (optimization)
      const frameChanged = frameIndex !== lastFrameRef.current;
      lastFrameRef.current = frameIndex;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentVisibleFaces: {trackId: number, bbox: BBox, isSelected: boolean}[] = [];
      const padding = 0.4;

      // Process all tracks
      for (const [trackId, track] of tracksMap) {
        const det = findDetectionForFrame(track.frames, frameIndex, sampleRate);
        if (!det) continue;

        const isSelected = selectedSet.has(trackId);
        const [ox, oy, ow, oh] = det.bbox;
        const x = Math.max(0, ox - ow * padding);
        const y = Math.max(0, oy - oh * padding);
        const w = Math.min(ow * (1 + padding * 2), canvas.width - x);
        const h = Math.min(oh * (1 + padding * 2), canvas.height - y);

        currentVisibleFaces.push({ trackId, bbox: [x, y, w, h], isSelected });

        if (isSelected) {
          // Blur matching backend _blur_frame_worker:
          // Backend uses GaussianBlur with k=blur_amount*4+1, sigma=blur_amount*3
          // We replicate this with downscale + CSS blur + upscale
          if (!blur) {
            ctx.fillStyle = 'black';
            ctx.fillRect(x, y, w, h);
          } else {
            const blurAmount = 12; // matches backend default
            // Downscale factor mirrors the large kernel effect
            const downscale = Math.max(blurAmount, 8);
            const tmpW = Math.max(1, Math.floor(w / downscale));
            const tmpH = Math.max(1, Math.floor(h / downscale));

            // Use an offscreen canvas to pixelate + blur the region
            const offscreen = new OffscreenCanvas(tmpW, tmpH);
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              // Step 1: draw downscaled (pixelation — destroys detail)
              offCtx.drawImage(video, x, y, w, h, 0, 0, tmpW, tmpH);

              // Step 2: apply Gaussian blur on the tiny image
              offCtx.filter = 'blur(2px)';
              offCtx.drawImage(offscreen, 0, 0);
              offCtx.filter = 'none';

              // Step 3: draw back to main canvas at full size (nearest-neighbor upscale)
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(offscreen, 0, 0, tmpW, tmpH, x, y, w, h);
              ctx.imageSmoothingEnabled = true;
            } else {
              // Fallback if OffscreenCanvas not supported
              ctx.fillStyle = 'black';
              ctx.fillRect(x, y, w, h);
            }
          }
        } else {
          // Draw red outline for unselected faces (visible but not harsh)
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; // red-500 with opacity
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        }
      }

      // Only update state if faces changed (reduces re-renders)
      if (frameChanged) {
        setVisibleFaces(currentVisibleFaces);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      video.removeEventListener('loadedmetadata', syncCanvasSize);
      video.removeEventListener('resize', syncCanvasSize);
      video.removeEventListener('canplay', syncCanvasSize);
      window.removeEventListener('resize', syncCanvasSize);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [tracksMap, selectedSet, blur, sampleRate, fps]);

  // Calculate scale for overlay positioning
  const getOverlayStyle = useCallback((bbox: BBox) => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const rect = video.getBoundingClientRect();
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;
    const [x, y, w, h] = bbox;

    return {
      left: x * scaleX,
      top: y * scaleY,
      width: w * scaleX,
      height: h * scaleY,
    };
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full block"
        playsInline
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          width: '100%',
          height: '100%'
        }}
      />

      {/* Clickable face overlays */}
      {videoReady && visibleFaces.map((face, i) => {
        const style = getOverlayStyle(face.bbox);
        if (!style) return null;

        return (
          <div
            key={`${face.trackId}-${i}`}
            onClick={() => onToggleTrack(face.trackId)}
            className="absolute cursor-pointer hover:bg-white/10 transition-colors"
            style={{
              ...style,
              borderRadius: '4px',
              zIndex: 10,
            }}
            title={face.isSelected ? 'Click to unblur' : 'Click to blur'}
          />
        );
      })}
    </div>
  );
}