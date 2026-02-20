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

export function FaceGallery({ tracks, selectedTrackIds, onToggleTrack, videoUrl }: FaceGalleryProps) {
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
      await new Promise<void>(resolve => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const newThumbnails = new Map<number, string>();
      for (const track of tracks) {
        const frame = track.frames[Math.floor(track.frames.length / 2)];
        if (!frame) continue;
        video.currentTime = frame.frameIndex / 30;
        await new Promise<void>(resolve => {
          video.addEventListener('seeked', () => {
            const [x, y, w, h] = frame.bbox;
            const pad = 0.3;
            const px = Math.max(0, x - w * pad), py = Math.max(0, y - h * pad);
            const pw = Math.min(w * (1 + pad * 2), video.videoWidth - px);
            const ph = Math.min(h * (1 + pad * 2), video.videoHeight - py);
            canvas.width = 96; canvas.height = 96;
            ctx.drawImage(video, px, py, pw, ph, 0, 0, 96, 96);
            newThumbnails.set(track.id, canvas.toDataURL('image/jpeg', 0.6));
            setThumbnails(new Map(newThumbnails));
            resolve();
          }, { once: true });
        });
      }
      setLoading(false);
    };
    extractThumbnails().catch(() => setLoading(false));
  }, [tracks, videoUrl]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-serif)' }}>
          All Detected Faces ({tracks.length})
          {loading && <span style={{ fontSize: 12, color: 'var(--subtle)', marginLeft: 8, fontFamily: 'var(--font-sans)' }}>(Loading thumbnails...)</span>}
        </h3>
        <span style={{ fontSize: 13, color: 'var(--subtle)' }}>Click to select for blurring</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
        {[...tracks].sort((a, b) => (a.frames[0]?.frameIndex ?? 0) - (b.frames[0]?.frameIndex ?? 0)).map((track, index) => {
          const isSelected = selectedTrackIds.includes(track.id);
          const thumbnail = thumbnails.get(track.id);
          return (
            <button
              key={track.id}
              onClick={() => onToggleTrack(track.id)}
              title={`Face ${index + 1} — ${track.frames.length} frames`}
              style={{
                position: 'relative', aspectRatio: '1', borderRadius: 4, overflow: 'hidden',
                border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                background: 'var(--card)', cursor: 'pointer',
                transition: 'all 0.2s', outline: 'none',
                boxShadow: isSelected ? '0 0 0 3px rgba(200,245,90,0.15)' : 'none',
              }}
              onMouseOver={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(245,240,232,0.25)'; }}
              onMouseOut={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {thumbnail ? (
                <img src={thumbnail} alt={`Face ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'var(--subtle)' }}>
                  {loading ? '…' : index + 1}
                </div>
              )}
              {isSelected && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(200,245,90,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check style={{ width: 14, height: 14, color: 'var(--background)' }} strokeWidth={3} />
                  </div>
                </div>
              )}
              <div style={{
                position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
                background: isSelected ? 'var(--primary)' : 'rgba(14,26,19,0.7)',
                color: isSelected ? 'var(--background)' : 'var(--subtle)',
              }}>
                {index + 1}
              </div>
            </button>
          );
        })}
      </div>

      {tracks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--subtle)', border: '2px dashed var(--border)', borderRadius: 6 }}>
          <Users style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No faces detected yet</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>Run detection to see faces here</p>
        </div>
      )}
    </div>
  );
}