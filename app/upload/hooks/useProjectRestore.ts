import { useState, useEffect } from 'react';
import type { Track } from '@/types';

export interface RestoreData {
  videoId: string;
  fileUrl: string;
  fileName: string;
  metadata: { fps: number; width: number; height: number; frameCount: number };
  tracks: Track[];
  sampleRate: number;
}

export function useProjectRestore(projectId: string | null): {
  restoreData: RestoreData | null;
  restoring: boolean;
  restoreError: string | null;
} {
  const [restoreData, setRestoreData] = useState<RestoreData | null>(null);
  const [restoring, setRestoring] = useState(!!projectId);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    fetch(`/api/projects/${projectId}/restore`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to restore project');
        }
        return res.json();
      })
      .then(async ({ videoId, metadata, tracksSignedUrl, originalSignedUrl, filename, sampleRate }) => {
        const tracksRes = await fetch(tracksSignedUrl);
        if (!tracksRes.ok) throw new Error('Failed to load face tracks');
        const tracks: Track[] = await tracksRes.json();

        setRestoreData({
          videoId,
          fileUrl: originalSignedUrl,
          fileName: filename || '',
          metadata,
          tracks,
          sampleRate: sampleRate ?? 3,
        });
        setRestoring(false);
      })
      .catch((err) => {
        console.error('Restore failed:', err);
        setRestoreError(err.message);
        setRestoring(false);
      });
  }, [projectId]);

  return { restoreData, restoring, restoreError };
}
