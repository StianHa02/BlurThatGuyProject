'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Users } from 'lucide-react';

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
  selectedTrackIds: number[]; // Changed to array for multiple selections
  onToggleTrack: (trackId: number) => void; // Callback to toggle track selection
  blur: boolean;
  sampleRate: number;
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
  const tracksMapRef = useRef<Map<number, Track>>(new Map());
  const [visibleFaces, setVisibleFaces] = useState<{trackId: number, bbox: BBox}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const m = new Map<number, Track>();
    for (const t of tracks) m.set(t.id, t);
    tracksMapRef.current = m;
  }, [tracks]);

  // Handle click on canvas to select/deselect faces
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if click is inside any visible face
    for (const face of visibleFaces) {
      const [x, y, w, h] = face.bbox;
      // Add padding to make clicking easier
      const padding = 0.2;
      const px = x - w * padding;
      const py = y - h * padding;
      const pw = w * (1 + padding * 2);
      const ph = h * (1 + padding * 2);

      if (clickX >= px && clickX <= px + pw && clickY >= py && clickY <= py + ph) {
        onToggleTrack(face.trackId);
        return;
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const syncCanvasSize = () => {
      const rect = video.getBoundingClientRect();
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    };

    video.addEventListener('loadedmetadata', syncCanvasSize);
    video.addEventListener('resize', syncCanvasSize);
    window.addEventListener('resize', syncCanvasSize);
    video.addEventListener('play', () => { syncCanvasSize(); setIsPlaying(true); });
    video.addEventListener('pause', () => setIsPlaying(false));
    video.addEventListener('ended', () => setIsPlaying(false));

    function draw() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTime = video.currentTime;
      const frameRate = 30;
      const frameIndex = Math.round(currentTime * frameRate);

      const currentVisibleFaces: {trackId: number, bbox: BBox}[] = [];

      // Go through all tracks
      for (const [trackId, track] of tracksMapRef.current) {
        const det = findDetectionForFrame(track.frames, frameIndex);
        if (!det) continue;

        const isSelected = selectedTrackIds.includes(trackId);
        const padding = 0.4;
        const [ox, oy, ow, oh] = det.bbox;
        const x = Math.max(0, ox - ow * padding);
        const y = Math.max(0, oy - oh * padding);
        const w = ow * (1 + padding * 2);
        const h = oh * (1 + padding * 2);

        // Store visible face for click detection
        currentVisibleFaces.push({ trackId, bbox: [x, y, w, h] });

        if (isSelected) {
          // Draw blur or black box for selected faces
          if (!blur) {
            ctx.fillStyle = 'black';
            ctx.fillRect(x, y, w, h);
          } else {
            const tmp = document.createElement('canvas');
            const blurAmount = 12;
            tmp.width = Math.max(1, Math.floor(w / blurAmount));
            tmp.height = Math.max(1, Math.floor(h / blurAmount));
            const tctx = tmp.getContext('2d');
            if (tctx) {
              try {
                tctx.drawImage(video, x, y, w, h, 0, 0, tmp.width, tmp.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
              } catch (e) {
                ctx.fillStyle = 'black';
                ctx.fillRect(x, y, w, h);
              }
            }
          }
        } else {
          // Draw red frame for unselected faces (so user can click to select)
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
        }
      }

      setVisibleFaces(currentVisibleFaces);
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      video.removeEventListener('loadedmetadata', syncCanvasSize);
      video.removeEventListener('resize', syncCanvasSize);
      window.removeEventListener('resize', syncCanvasSize);
    };
  }, [selectedTrackIds, blur, sampleRate]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full block"
      />
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'none', // Allow video controls to work
          width: '100%',
          height: '100%'
        }}
      />
      {/* Invisible click layer only over face areas */}
      {visibleFaces.map((face, i) => {
        const video = videoRef.current;
        if (!video) return null;
        const rect = video.getBoundingClientRect?.() || { width: 1, height: 1 };
        const scaleX = rect.width / (video.videoWidth || 1);
        const scaleY = rect.height / (video.videoHeight || 1);
        const [x, y, w, h] = face.bbox;
        const isSelected = selectedTrackIds.includes(face.trackId);
        return (
          <div
            key={i}
            onClick={() => onToggleTrack(face.trackId)}
            className={`absolute transition-all duration-150 ${
              isSelected 
                ? 'ring-2 ring-indigo-500/50 bg-indigo-500/10' 
                : 'hover:bg-white/5 cursor-pointer'
            }`}
            style={{
              left: x * scaleX,
              top: y * scaleY,
              width: w * scaleX,
              height: h * scaleY,
              borderRadius: '4px',
            }}
            title={isSelected ? 'Click to unblur' : 'Click to blur'}
          />
        );
      })}
      {/* Status overlay */}
      {selectedTrackIds.length > 0 && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm pointer-events-none border border-white/10">
          <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
          <span>{selectedTrackIds.length === 1 ? '1 face blurred' : `${selectedTrackIds.length} faces blurred`}</span>
        </div>
      )}
      {/* Face count overlay */}
      {visibleFaces.length > 0 && !isPlaying && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm pointer-events-none border border-white/10">
          <Users className="w-3.5 h-3.5 text-green-400" />
          <span>{visibleFaces.length} visible</span>
        </div>
      )}
    </div>
  );
}

function findDetectionForFrame(frames: Detection[], frameIndex: number): Detection | null {
  if (!frames || frames.length === 0) return null;

  const firstFrame = frames[0].frameIndex;
  const lastFrame = frames[frames.length - 1].frameIndex;

  const tolerance = 5;
  if (frameIndex < firstFrame - tolerance || frameIndex > lastFrame + tolerance) {
    return null;
  }

  let best: Detection | null = null;
  let bestDiff = Infinity;

  for (const f of frames) {
    const diff = Math.abs(f.frameIndex - frameIndex);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
  }

  const maxGap = 15;
  if (bestDiff > maxGap) {
    return null;
  }

  return best;
}
