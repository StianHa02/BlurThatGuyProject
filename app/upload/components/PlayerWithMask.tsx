'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { BBox, Detection, Track } from '@/types';

interface Props {
  videoUrl: string;
  tracks: Track[];
  selectedTrackIds: number[];
  onToggleTrack: (trackId: number) => void;
  blurMode: 'pixelate' | 'blackout';
  sampleRate: number;
  fps: number;
  padding?: number;
  targetBlocks?: number;
}

/**
 * Find detection for frame - with interpolation for smoother playback
 */
function findDetectionForFrame(
  frames: Detection[],
  frameIndex: number
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
  blurMode,
  sampleRate,
  fps,
  padding = 0.4,
  targetBlocks = 8,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(-1);
  const [visibleFaces, setVisibleFaces] = useState<{trackId: number, bbox: BBox, isSelected: boolean}[]>([]);
  const [videoScale, setVideoScale] = useState<{ scaleX: number; scaleY: number } | null>(null);
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
      setVideoScale({
        scaleX: rect.width / video.videoWidth,
        scaleY: rect.height / video.videoHeight,
      });
      setVideoReady(true);
    };

    video.addEventListener('loadedmetadata', syncCanvasSize);
    video.addEventListener('resize', syncCanvasSize);
    video.addEventListener('canplay', syncCanvasSize);
    window.addEventListener('resize', syncCanvasSize);

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

      // Process all tracks
      for (const [trackId, track] of tracksMap) {
        const det = findDetectionForFrame(track.frames, frameIndex);
        if (!det) continue;

        const isSelected = selectedSet.has(trackId);
        const [ox, oy, ow, oh] = det.bbox;
        const x = Math.max(0, ox - ow * padding);
        const y = Math.max(0, oy - oh * padding);
        const w = Math.min(ow * (1 + padding * 2), canvas.width - x);
        const h = Math.min(oh * (1 + padding * 2), canvas.height - y);

        currentVisibleFaces.push({ trackId, bbox: [x, y, w, h], isSelected });

        if (isSelected) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.clip();

          if (blurMode === 'blackout') {
            ctx.fillStyle = 'black';
            ctx.fill();
          } else {
            const blockSize = Math.max(1, Math.floor(Math.min(w, h) / targetBlocks));
            const tmpW = Math.max(1, Math.floor(w / blockSize));
            const tmpH = Math.max(1, Math.floor(h / blockSize));

            if (!offscreenRef.current || offscreenRef.current.width < tmpW || offscreenRef.current.height < tmpH) {
              offscreenRef.current = new OffscreenCanvas(tmpW, tmpH);
            }
            const offscreen = offscreenRef.current;
            offscreen.width = tmpW;
            offscreen.height = tmpH;
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              offCtx.imageSmoothingEnabled = true;
              offCtx.drawImage(video, x, y, w, h, 0, 0, tmpW, tmpH);
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(offscreen, 0, 0, tmpW, tmpH, x, y, w, h);
              ctx.imageSmoothingEnabled = true;
            } else {
              ctx.fillStyle = 'black';
              ctx.fill();
            }
          }

          ctx.restore();
        }

        // Red ellipse outline for all detected faces
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
        ctx.stroke();
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
    };
  }, [tracksMap, selectedSet, blurMode, sampleRate, fps, padding, targetBlocks]);

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
      {videoReady && videoScale && visibleFaces.map((face, i) => {
        const [x, y, w, h] = face.bbox;

        return (
          <div
            key={`${face.trackId}-${i}`}
            onClick={() => onToggleTrack(face.trackId)}
            className="absolute cursor-pointer hover:bg-white/10 transition-colors"
            style={{
              left: x * videoScale.scaleX,
              top: y * videoScale.scaleY,
              width: w * videoScale.scaleX,
              height: h * videoScale.scaleY,
              borderRadius: '50%',
              zIndex: 10,
            }}
            title={face.isSelected ? 'Click to unblur' : 'Click to blur'}
          />
        );
      })}
    </div>
  );
}