'use client';

import { Check, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface Track {
  id: number;
  frames: Array<{
    frameIndex: number;
    bbox: [number, number, number, number];
    score: number;
  }>;
  mergedFrom?: number[];
}

interface FaceGalleryProps {
  tracks: Track[];
  selectedTrackIds: number[];
  onToggleTrack: (trackId: number) => void;
  videoUrl: string;
  fps: number;
}

export function FaceGallery({
  tracks,
  selectedTrackIds,
  onToggleTrack,
  videoUrl,
  fps,
}: FaceGalleryProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tracks.length === 0) return;

    const extractThumbnails = async () => {
      setLoading(true);
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
  }, [tracks, videoUrl]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          All Detected Faces ({tracks.length})
          {loading && <span className="text-sm text-slate-500 ml-2">(Loading thumbnails...)</span>}
        </h3>
        <p className="text-sm text-slate-500">Click to select/deselect for blurring</p>
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
                  <img src={thumbnail} alt={`Face ${index + 1}`} className="w-full h-full object-cover" />
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

                {/* Badge: number of scenes this identity spans */}
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