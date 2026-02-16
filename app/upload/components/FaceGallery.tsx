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
}

interface FaceGalleryProps {
  tracks: Track[];
  selectedTrackIds: number[];
  onToggleTrack: (trackId: number) => void;
  videoUrl: string;
}

export function FaceGallery({
  tracks,
  selectedTrackIds,
  onToggleTrack,
  videoUrl,
}: FaceGalleryProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);

  // Extract thumbnails from video when tracks change
  useEffect(() => {
    if (tracks.length === 0) return;

    console.log('🖼️ Starting thumbnail extraction for', tracks.length, 'faces');

    const extractThumbnails = async () => {
      setLoading(true);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;

      console.log('📹 Loading video:', videoUrl);

      await new Promise<void>((resolve) => {
        video.addEventListener('loadedmetadata', () => {
          console.log('✅ Video loaded:', video.videoWidth, 'x', video.videoHeight);
          resolve();
        }, { once: true });
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('❌ Could not get canvas context');
        return;
      }

      const newThumbnails = new Map<number, string>();

      for (const track of tracks) {
        // Use middle frame for best representation
        const middleIndex = Math.floor(track.frames.length / 2);
        const frame = track.frames[middleIndex];

        if (!frame) {
          console.warn('⚠️ No frame found for track', track.id);
          continue;
        }

        console.log(`📸 Extracting thumbnail for face ${track.id} at frame ${frame.frameIndex}`);

        // Seek to frame
        const frameTime = frame.frameIndex / 30; // Assuming 30fps
        video.currentTime = frameTime;

        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', async () => {
            const [x, y, w, h] = frame.bbox;

            console.log(`  Face bbox: x=${x}, y=${y}, w=${w}, h=${h}`);

            // Add padding around face
            const padding = 0.3;
            const paddedX = Math.max(0, x - w * padding);
            const paddedY = Math.max(0, y - h * padding);
            const paddedW = Math.min(w * (1 + padding * 2), video.videoWidth - paddedX);
            const paddedH = Math.min(h * (1 + padding * 2), video.videoHeight - paddedY);

            // Create square thumbnail
            const thumbSize = 120;
            canvas.width = thumbSize;
            canvas.height = thumbSize;

            // Draw face to canvas (centered and cropped)
            ctx.drawImage(
              video,
              paddedX,
              paddedY,
              paddedW,
              paddedH,
              0,
              0,
              thumbSize,
              thumbSize
            );

            // Convert to data URL
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            console.log(`  ✅ Thumbnail created for face ${track.id}`);
            newThumbnails.set(track.id, dataUrl);

            resolve();
          }, { once: true });
        });
      }

      console.log('🎉 All thumbnails extracted:', newThumbnails.size);
      setThumbnails(newThumbnails);
      setLoading(false);
    };

    extractThumbnails().catch(err => {
      console.error('❌ Thumbnail extraction failed:', err);
      setLoading(false);
    });
  }, [tracks, videoUrl]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          All Detected Faces ({tracks.length})
          {loading && <span className="text-sm text-zinc-500 ml-2">(Loading thumbnails...)</span>}
        </h3>
        <p className="text-sm text-zinc-500">Click to select/deselect for blurring</p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
        {tracks.map((track, index) => {
          const isSelected = selectedTrackIds.includes(track.id);
          const thumbnail = thumbnails.get(track.id);

          return (
            <button
              key={track.id}
              onClick={() => onToggleTrack(track.id)}
              className={`
                relative aspect-square rounded-lg overflow-hidden
                border-2 transition-all group
                ${isSelected 
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/20' 
                  : 'border-zinc-700 hover:border-zinc-600 hover:scale-105'
                }
              `}
              title={`Face ${index + 1} - Appears in ${track.frames.length} frames`}
            >
              {/* Face Thumbnail or Placeholder */}
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={`Face ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={`
                  w-full h-full flex items-center justify-center text-2xl font-bold transition-colors
                  ${isSelected ? 'bg-indigo-900/30 text-indigo-300' : 'bg-zinc-800 text-zinc-600 group-hover:text-zinc-500'}
                `}>
                  {loading ? '...' : index + 1}
                </div>
              )}

              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute inset-0 bg-indigo-500/30 flex items-center justify-center backdrop-blur-[2px]">
                  <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg">
                    <Check className="w-6 h-6 text-white" strokeWidth={3} />
                  </div>
                </div>
              )}

              {/* Frame Count Badge */}
              <div className={`
                absolute bottom-1 right-1 px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-sm
                ${isSelected ? 'bg-indigo-500 text-white' : 'bg-black/70 text-zinc-300'}
              `}>
                {track.frames.length}f
              </div>

              {/* Face Number Badge */}
              <div className={`
                absolute top-1 left-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center backdrop-blur-sm
                ${isSelected ? 'bg-indigo-500 text-white' : 'bg-zinc-900/70 text-zinc-400'}
              `}>
                {index + 1}
              </div>
            </button>
          );
        })}
      </div>

      {tracks.length === 0 && (
        <div className="text-center py-12 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No faces detected yet</p>
          <p className="text-xs mt-1">Run detection to see faces here</p>
        </div>
      )}
    </div>
  );
}