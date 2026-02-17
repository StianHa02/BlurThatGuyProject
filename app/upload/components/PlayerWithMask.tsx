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
}

// Pre-create reusable canvas for pixelation (performance optimization)
let pixelCanvas: HTMLCanvasElement | null = null;
let pixelCtx: CanvasRenderingContext2D | null = null;

function getPixelCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!pixelCanvas) {
    pixelCanvas = document.createElement('canvas');
    pixelCtx = pixelCanvas.getContext('2d');
  }
  if (!pixelCtx) return null;

  if (pixelCanvas.width !== w || pixelCanvas.height !== h) {
    pixelCanvas.width = w;
    pixelCanvas.height = h;
  }
  return { canvas: pixelCanvas, ctx: pixelCtx };
}

/**
 * Find detection for frame - simplified for speed
 */
function findDetectionForFrame(
  frames: Detection[],
  frameIndex: number,
  sampleRate: number
): { bbox: BBox; score: number } | null {
  if (!frames || frames.length === 0) return null;

  const firstFrame = frames[0].frameIndex;
  const lastFrame = frames[frames.length - 1].frameIndex;
  const tolerance = sampleRate * 2;

  if (frameIndex < firstFrame - tolerance || frameIndex > lastFrame + tolerance) {
    return null;
  }

  // Quick binary-ish search for nearest frame
  let best: Detection | null = null;
  let bestDiff = Infinity;

  for (const f of frames) {
    const diff = Math.abs(f.frameIndex - frameIndex);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
    // Early exit if we found exact match
    if (diff === 0) break;
  }

  if (best && bestDiff <= sampleRate * 2) {
    return { bbox: best.bbox, score: best.score };
  }

  return null;
}

export default function PlayerWithMask({
  videoUrl,
  tracks,
  selectedTrackIds,
  onToggleTrack,
  blur,
  sampleRate
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

      const frameIndex = Math.round(video.currentTime * 30);

      // Skip if same frame (optimization)
      const frameChanged = frameIndex !== lastFrameRef.current;
      lastFrameRef.current = frameIndex;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentVisibleFaces: {trackId: number, bbox: BBox, isSelected: boolean}[] = [];
      const padding = 0.4;
      const blurAmount = 12;

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
          // Draw blur/pixelation for selected faces
          if (!blur) {
            ctx.fillStyle = 'black';
            ctx.fillRect(x, y, w, h);
          } else {
            const tmpW = Math.max(1, Math.floor(w / blurAmount));
            const tmpH = Math.max(1, Math.floor(h / blurAmount));

            const pixel = getPixelCanvas(tmpW, tmpH);
            if (pixel) {
              try {
                pixel.ctx.drawImage(video, x, y, w, h, 0, 0, tmpW, tmpH);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(pixel.canvas, 0, 0, tmpW, tmpH, x, y, w, h);
              } catch {
                ctx.fillStyle = 'black';
                ctx.fillRect(x, y, w, h);
              }
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
  }, [tracksMap, selectedSet, blur, sampleRate]);

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