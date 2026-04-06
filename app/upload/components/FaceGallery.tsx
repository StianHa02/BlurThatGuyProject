/* Grid of detected face thumbnails. Extracts thumbnails by seeking an offscreen video element to each track's midpoint frame. Supports blur-all, clear, and individual toggle. */
'use client';

import Image from 'next/image';
import { Check, Users, UserX, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BlurModeToggle } from './BlurModeToggle';
import type { BlurMode, Track } from '@/types';

interface FaceGalleryProps {
  tracks: Track[];
  selectedTrackIds: number[];
  onToggleTrack: (trackId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  blurMode: BlurMode;
  onBlurModeChange: (mode: BlurMode) => void;
  videoUrl: string;
  fps: number;
}

export function FaceGallery({
  tracks,
  selectedTrackIds,
  onToggleTrack,
  onSelectAll,
  onDeselectAll,
  blurMode,
  onBlurModeChange,
  videoUrl,
  fps,
}: FaceGalleryProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tracks.length === 0) return;

    const waitForVisible = (): Promise<void> => {
      if (!document.hidden) return Promise.resolve();
      return new Promise((resolve) => {
        const handler = () => {
          if (!document.hidden) {
            document.removeEventListener('visibilitychange', handler);
            resolve();
          }
        };
        document.addEventListener('visibilitychange', handler);
      });
    };

    const isBlackFrame = (ctx: CanvasRenderingContext2D, size: number): boolean => {
      const data = ctx.getImageData(0, 0, size, size).data;
      for (let i = 0; i < data.length; i += 400) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return false;
      }
      return true;
    };

    const extractThumbnails = async () => {
      setLoading(true);
      await waitForVisible();
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('canplaythrough', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Video load error')), { once: true });
        setTimeout(resolve, 8000);
        video.load();
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const newThumbnails = new Map<number, string>();

      const seekTo = (time: number): Promise<void> =>
        new Promise<void>((resolve) => {
          const TIMEOUT_MS = 3000;
          let settled = false;

          const settle = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onSeeked);
            resolve();
          };

          const onSeeked = () => settle();
          const timer = setTimeout(settle, TIMEOUT_MS);

          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onSeeked, { once: true });

          if (Math.abs(video.currentTime - time) < 0.001) {
            settle();
          } else {
            video.currentTime = time;
          }
        });

      for (const track of tracks) {
        const middleIndex = Math.floor(track.frames.length / 2);
        const frame = track.frames[middleIndex];
        if (!frame) continue;

        const videoFps = fps > 0 ? fps : 30;
        const frameTime = frame.frameIndex / videoFps;
        await seekTo(frameTime);

        const [x, y, w, h] = frame.bbox;
        const padding = 0.3;
        const paddedX = Math.max(0, x - w * padding);
        const paddedY = Math.max(0, y - h * padding);
        const paddedW = Math.min(w * (1 + padding * 2), video.videoWidth - paddedX);
        const paddedH = Math.min(h * (1 + padding * 2), video.videoHeight - paddedY);

        const thumbSize = 96;
        canvas.width = thumbSize;
        canvas.height = thumbSize;

        ctx.drawImage(video, paddedX, paddedY, paddedW, paddedH, 0, 0, thumbSize, thumbSize);

        if (isBlackFrame(ctx, thumbSize)) {
          await waitForVisible();
          await seekTo(frameTime);
          ctx.drawImage(video, paddedX, paddedY, paddedW, paddedH, 0, 0, thumbSize, thumbSize);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        newThumbnails.set(track.id, dataUrl);
        setThumbnails(new Map(newThumbnails));
      }

      setLoading(false);
    };

    extractThumbnails().catch(err => {
      console.error('Thumbnail extraction failed:', err);
      setLoading(false);
    });
  }, [tracks, videoUrl, fps]);

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:gap-3">
        <h3 className="text-lg font-semibold text-white shrink-0">
          All Detected Faces ({tracks.length})
          {loading && <span className="text-sm text-slate-500 ml-2 font-normal">(Loading thumbnails...)</span>}
        </h3>

        {/* Controls: on mobile two rows — [Blur All + Clear] on top, [BlurModeToggle] below */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:ml-auto sm:gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onSelectAll}
              className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserX className="w-3.5 h-3.5 shrink-0" /> Blur All
            </button>
            <button
              onClick={onDeselectAll}
              className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" /> Clear
            </button>
          </div>
          <BlurModeToggle value={blurMode} onChange={onBlurModeChange} />
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
        {[...tracks]
          .sort((a, b) => (a.frames[0]?.frameIndex ?? 0) - (b.frames[0]?.frameIndex ?? 0))
          .map((track, index) => {
            const isSelected = selectedTrackIds.includes(track.id);
            const thumbnail = thumbnails.get(track.id);

            return (
              <button
                key={track.id}
                onClick={() => onToggleTrack(track.id)}
                aria-label={`Face ${index + 1} – ${isSelected ? 'selected for blur, click to unblur' : 'click to select for blur'}. Appears in ${track.frames.length} frames`}
                aria-pressed={isSelected}
                className={`
                  relative aspect-square rounded-lg overflow-hidden border-2 transition-all group
                  ${isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/15'
                    : 'border-white/10 hover:border-white/25 hover:scale-105'
                  }
                `}
                title={`Face ${index + 1} - Appears in ${track.frames.length} frames${(track.mergedFrom?.length ?? 1) > 1 ? ` · ${track.mergedFrom!.length} scenes merged` : ''}`}
              >
                {thumbnail ? (
                  <Image
                    src={thumbnail}
                    alt={`Face ${index + 1}`}
                    width={96}
                    height={96}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`
                    w-full h-full flex items-center justify-center text-2xl font-bold transition-colors
                    ${isSelected ? 'bg-blue-900/30 text-blue-300' : 'bg-white/5 text-slate-600 group-hover:text-slate-400'}
                  `}>
                    {loading ? '...' : index + 1}
                  </div>
                )}

                {isSelected && (
                  <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                      <Check className="w-6 h-6 text-white" strokeWidth={3} />
                    </div>
                  </div>
                )}

                <div className={`
                  absolute top-1 left-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center backdrop-blur-sm
                  ${isSelected ? 'bg-blue-500 text-white' : 'bg-black/50 text-slate-400'}
                `}>
                  {index + 1}
                </div>

                {(track.mergedFrom?.length ?? 1) > 1 && (
                  <div className="absolute bottom-1 right-1 px-1 rounded text-[9px] font-bold bg-teal-500/80 text-white backdrop-blur-sm leading-4">
                    {track.mergedFrom!.length}×
                  </div>
                )}
              </button>
            );
          })}
      </div>

      {tracks.length === 0 && (
        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-white/8 rounded-xl">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No faces detected yet</p>
          <p className="text-xs mt-1">Run detection to see faces here</p>
        </div>
      )}
    </div>
  );
}
