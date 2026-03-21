'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Users, Download, Loader2, Upload as UploadIcon, Save, CheckCircle } from 'lucide-react';
import { Header } from '@/components';
import { ErrorAlert, FaceGallery } from '../components';
import { useVideoExport } from '../hooks';
import { getVideoStreamUrl, getVideoTracks } from '@/lib/services/faceClient';
import type { BlurMode, Track } from '@/types';

const PlayerWithMask = dynamic(() => import('../components/PlayerWithMask'), { ssr: false });

export default function SelectPage() {
  return (
    <Suspense>
      <SelectPageContent />
    </Suspense>
  );
}

function SelectPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoId = searchParams.get('v');

  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [blurMode, setBlurMode] = useState<BlurMode>('pixelate');
  const [sampleRate, setSampleRate] = useState(3);
  const [saved, setSaved] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fps, setFps] = useState(30);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [abortController] = useState(() => new AbortController());

  const exportHook = useVideoExport({
    videoId,
    fileName,
    selectedTrackIds,
    sampleRate,
    blurMode,
    onError: setError,
    signal: abortController.signal,
  });

  // Load state from sessionStorage and backend
  useEffect(() => {
    if (!videoId) {
      router.replace('/upload');
      return;
    }

    async function loadState() {
      try {
        // Restore cached values
        const cachedMeta = sessionStorage.getItem(`upload:${videoId}:metadata`);
        const cachedName = sessionStorage.getItem(`upload:${videoId}:fileName`);
        const cachedRate = sessionStorage.getItem(`upload:${videoId}:sampleRate`);
        const cachedSelected = sessionStorage.getItem(`upload:${videoId}:selected`);

        if (cachedMeta) {
          const meta = JSON.parse(cachedMeta);
          setFps(meta.fps || 30);
        }
        if (cachedName) setFileName(cachedName);
        if (cachedRate) setSampleRate(Number(cachedRate));
        if (cachedSelected) setSelectedTrackIds(JSON.parse(cachedSelected));

        setVideoUrl(getVideoStreamUrl(videoId!));

        // Fetch detection tracks from backend
        const fetchedTracks = await getVideoTracks(videoId!);
        setTracks(fetchedTracks);

        if (fetchedTracks.length === 0) {
          setError('No detection results found. Please run detection first.');
          router.replace(`/upload/detect?v=${videoId}`);
          return;
        }
      } catch {
        setError('Failed to load video data. The video may have expired.');
        router.replace('/upload');
      } finally {
        setLoading(false);
      }
    }

    loadState();
  }, [videoId, router]);

  // Persist selected track IDs to sessionStorage
  useEffect(() => {
    if (videoId && !loading) {
      sessionStorage.setItem(`upload:${videoId}:selected`, JSON.stringify(selectedTrackIds));
    }
  }, [selectedTrackIds, videoId, loading]);

  const toggleTrack = useCallback((trackId: number) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  }, []);

  const selectAll = useCallback(() => setSelectedTrackIds(tracks.map(t => t.id)), [tracks]);
  const deselectAll = useCallback(() => setSelectedTrackIds([]), []);

  function handleReset() {
    abortController.abort();
    router.push('/upload');
  }

  if (!videoId || loading) return null;

  return (
    <>
      <Header currentStep="select" />

      <main className="relative z-10 flex-1 flex flex-col max-w-6xl w-full mx-auto px-6 py-8">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="max-w-6xl mx-auto w-full">
          {/* Toolbar: stats + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex w-full sm:w-fit items-stretch rounded-2xl overflow-hidden border border-white/10 shrink-0 text-xs font-semibold">
              <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-700 text-slate-100">
                <Users className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <span><strong>{tracks.length}</strong> detected</span>
              </div>
              <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white">
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{selectedTrackIds.length}</strong> blurred</span>
              </div>
              <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{tracks.length - selectedTrackIds.length}</strong> visible</span>
              </div>
            </div>

            <div className="flex w-full sm:w-auto items-center gap-2 justify-between sm:justify-end">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-500/40 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                <UploadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Upload new file</span>
                <span className="sm:hidden">New file</span>
              </button>

              <button
                onClick={() => exportHook.exportVideo()}
                disabled={exportHook.exporting || exportHook.saving || selectedTrackIds.length === 0}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white text-sm transition-colors cursor-pointer relative overflow-hidden"
              >
                {exportHook.exporting && <span className="absolute inset-0 bg-white/10 transition-all duration-500" style={{ width: `${exportHook.exportProgress}%` }} />}
                <span className="relative flex items-center gap-2">
                  {exportHook.exporting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {exportHook.exportProgress}%</>
                    : <><Download className="w-4 h-4" /> Download</>
                  }
                </span>
              </button>

              <button
                onClick={async () => {
                  setSaved(false);
                  const ok = await exportHook.saveVideo();
                  if (ok) setSaved(true);
                }}
                disabled={exportHook.saving || exportHook.exporting || selectedTrackIds.length === 0}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white text-sm transition-colors cursor-pointer relative overflow-hidden"
              >
                {exportHook.saving && <span className="absolute inset-0 bg-white/10 transition-all duration-500" style={{ width: `${exportHook.saveProgress}%` }} />}
                <span className="relative flex items-center gap-2">
                  {exportHook.saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving... {exportHook.saveProgress}%</>
                    : saved
                      ? <><CheckCircle className="w-4 h-4 text-emerald-300" /> Saved!</>
                      : <><Save className="w-4 h-4" /> Save Video</>
                  }
                </span>
              </button>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <p className="text-sm text-slate-400">
              <strong className="text-blue-400">Tip:</strong> Click faces in the gallery or play the video and click faces with{' '}
              <span className="text-red-400">red frames</span> to blur them.
            </p>
          </div>

          {videoUrl && (
            <>
              <div className="rounded-2xl p-2 mb-6 bg-white/5 border border-white/8">
                <PlayerWithMask
                  videoUrl={videoUrl}
                  tracks={tracks}
                  selectedTrackIds={selectedTrackIds}
                  onToggleTrack={toggleTrack}
                  blurMode={blurMode}
                  sampleRate={sampleRate}
                  fps={fps}
                  padding={0.4}
                  targetBlocks={12}
                />
              </div>

              <div className="rounded-2xl p-6 bg-white/5 border border-white/8">
                <FaceGallery
                  tracks={tracks}
                  selectedTrackIds={selectedTrackIds}
                  onToggleTrack={toggleTrack}
                  onSelectAll={selectAll}
                  onDeselectAll={deselectAll}
                  blurMode={blurMode}
                  onBlurModeChange={setBlurMode}
                  videoUrl={videoUrl}
                  fps={fps}
                />
              </div>

              <div className="mt-6 flex justify-end">
                <div className="text-sm text-slate-600">{fileName}</div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
