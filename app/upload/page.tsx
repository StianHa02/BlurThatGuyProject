'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Users, Info, Download, Loader2, Upload as UploadIcon, Save, CheckCircle, Lock } from 'lucide-react';
import { useVideoUpload, useFaceDetection, useVideoExport } from './hooks';
import { DropZone, ProgressBar, ErrorAlert, FaceGallery, Bentobox } from './components';
import type { BlurMode } from '@/types';
import { BackgroundBlobs, Header } from '@/components';
import { formatFileSize, formatDuration } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';

const PlayerWithMask = dynamic(() => import('./components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select';

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [sampleRate, setSampleRate] = useState(3);
  const [blurMode, setBlurMode] = useState<BlurMode>('pixelate');
  const [abortController, setAbortController] = useState(() => new AbortController());
  const [saved, setSaved] = useState(false);

  const userIntegration = process.env.NEXT_PUBLIC_USER_INTEGRATION === '1';
  const [user, setUser] = useState<User | null>(null);
  const canSave = userIntegration && !!user;

  useEffect(() => {
    if (!userIntegration) return;
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    });
  }, [userIntegration]);

  const upload = useVideoUpload();
  const detection = useFaceDetection({
    sampleRate,
    videoId: upload.videoId,
    onError: upload.setError,
    signal: abortController.signal,
  });
  const exportHook = useVideoExport({
    videoId: upload.videoId,
    fileName: upload.fileName,
    selectedTrackIds: detection.selectedTrackIds,
    sampleRate,
    blurMode,
    onError: upload.setError,
    signal: abortController.signal,
  });

  async function handleFileSelect(file: File) {
    setUploadingFileName(file.name);
    setUploading(true);
    const result = await upload.handleFile(file);
    setUploading(false);
    if (result) { detection.reset(); setCurrentStep('detect'); }
  }

  async function handleStartDetection() {
    const success = await detection.runDetection();
    if (success) setCurrentStep('select');
  }

  function handleReset() {
    abortController.abort();
    setAbortController(new AbortController());
    upload.reset();
    detection.reset();
    setCurrentStep('upload');
  }
  const shortName = upload.fileName.length > 28
    ? upload.fileName.slice(0, 25) + '...'
    : upload.fileName;

  const fileSize = upload.fileRef?.current?.size ?? null;
  const durationSecs = upload.videoMetadata
    ? upload.videoMetadata.frameCount / upload.videoMetadata.fps
    : null;

  return (
    <div className="min-h-screen bg-[#070f1c] text-white flex flex-col">

      <BackgroundBlobs />

      <Header currentStep={currentStep} />

      <main className="relative z-10 flex-1 flex flex-col max-w-6xl w-full mx-auto px-6 py-8">
        {upload.error && (
          <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />
        )}

        {/* ===== UPLOADING STATE ===== */}
        {currentStep === 'upload' && uploading && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full gap-6">
            <div className="relative flex items-center justify-center w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
              <div className="w-6 h-6 text-blue-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold mb-1">Uploading video…</p>
              <p className="text-slate-500 text-sm truncate max-w-xs">
                {uploadingFileName.length > 36 ? uploadingFileName.slice(0, 33) + '…' : uploadingFileName}
              </p>
            </div>
            <div className="w-full h-1 rounded-full bg-white/6 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-blue-500 animate-[slide_1.4s_ease-in-out_infinite]"
                style={{ animation: 'upload-slide 1.4s ease-in-out infinite' }} />
            </div>
            <style>{`
              @keyframes upload-slide {
                0%   { transform: translateX(-100%); }
                50%  { transform: translateX(200%); }
                100% { transform: translateX(200%); }
              }
            `}</style>
          </div>
        )}

        {/* ===== UPLOAD STEP ===== */}
        {currentStep === 'upload' && !uploading && (
          <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 bg-linear-to-b from-white to-slate-300 bg-clip-text text-transparent">
                Upload your video
              </h1>
              <p className="text-slate-400">Select or drag a video file to get started</p>
            </div>
            <DropZone onFileSelect={handleFileSelect} />
          </div>
        )}

        {/* ===== DETECT STEP ===== */}
        {currentStep === 'detect' && upload.fileUrl && (
          <div className="flex-1 flex flex-col gap-4">

            {/* Top row — constrained height on large screens; allow natural flow on mobile */}
            <div className="grid lg:grid-cols-2 gap-4 min-h-0 lg:max-h-[70vh]">

              {/* Left: video player */}
              <Bentobox className="flex flex-col min-h-0">
                <div className="relative flex-1 flex items-center p-3 min-h-0">
                  <video
                    src={upload.fileUrl}
                    controls
                    playsInline
                    disablePictureInPicture
                    controlsList="nodownload"
                    className="w-full h-full max-h-[55vh] rounded-xl object-contain bg-black"
                  />
                </div>
              </Bentobox>

              {/* Right: detect controls */}
              <Bentobox className="flex flex-col min-h-0">
                <div className="relative p-7 flex flex-col flex-1 overflow-auto">
                  <h2 className="text-2xl font-semibold mb-2 text-white">Detect Faces</h2>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                    Our AI will scan through your video and identify all faces that appear.
                  </p>
                  {detection.processing ? (
                    detection.queued ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                          <span className="text-sm text-white">
                            {typeof detection.queuePosition === 'number'
                              ? `You're #${detection.queuePosition} in queue`
                              : 'You are in queue'}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                          <div className="h-full w-1/3 rounded-full bg-blue-500 animate-[queue-slide_1.4s_ease-in-out_infinite]" />
                        </div>
                        <p className="text-xs text-slate-500">Waiting for an available processing slot...</p>
                        <style>{`
                          @keyframes queue-slide {
                            0%   { transform: translateX(-100%); }
                            50%  { transform: translateX(220%); }
                            100% { transform: translateX(220%); }
                          }
                        `}</style>
                      </div>
                    ) : (
                      <ProgressBar
                        progress={detection.progress}
                        status={detection.status}
                        hint="This may take a minute depending on video length"
                      />
                    )
                  ) : (
                    <button
                      onClick={handleStartDetection}
                      className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20 text-base"
                    >
                      <Eye className="w-5 h-5" />
                      Start Detection
                    </button>
                  )}

                  <div className="flex-1" />

                  <div className="h-px bg-white/6 my-6" />

                  <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                    <span className="relative group/tip">
                      <span className="inline-flex cursor-help text-slate-500 hover:text-blue-400 transition-colors">
                        <Info className="w-4 h-4" />
                      </span>
                      <span className="absolute left-0 bottom-full mb-2 hidden group-hover/tip:block z-10 w-64 p-3 text-sm text-left text-slate-300 bg-[#0d1b2e] border border-white/10 rounded-lg shadow-xl pointer-events-none">
                        <span className="font-medium text-white">Frame sampling</span>
                        <br />
                        <span className="text-slate-400 text-xs">1 check per {sampleRate} frames</span>
                        <br /><br />
                        Faces are only searched at these intervals, not every frame.
                        <br /><br />
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-blue-400">Low = thorough</span>
                          <span className="text-amber-400">High = fast</span>
                        </div>
                      </span>
                    </span>
                    <span>Sample every <strong className="text-white">{sampleRate}</strong> frames</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-3">
                    <label className="text-xs text-slate-400 shrink-0">Sample rate:</label>
                    <input
                      type="range" min={1} max={10} value={sampleRate}
                      onChange={e => setSampleRate(Number(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <span className="text-sm font-mono w-5 text-white text-right">{sampleRate}</span>
                  </div>
                </div>
              </Bentobox>
            </div>

            {/* Bottom: Video Details full width */}
            <Bentobox>
              <div className="relative px-6 py-4 border-b border-white/6">
                <h3 className="font-bold text-white text-base">Video Details</h3>
              </div>
              <div className="relative grid grid-cols-3 divide-x divide-white/6">
                <div className="flex flex-col px-6 py-4">
                  <span className="text-xs text-slate-500 mb-1.5">Filename</span>
                  <span className="text-sm text-white font-semibold truncate">{shortName}</span>
                </div>
                <div className="flex flex-col px-6 py-4">
                  <span className="text-xs text-slate-500 mb-1.5">Size</span>
                  <span className="text-sm text-white font-semibold">
                    {fileSize !== null ? formatFileSize(fileSize) : '—'}
                  </span>
                </div>
                <div className="flex flex-col px-6 py-4">
                  <span className="text-xs text-slate-500 mb-1.5">Duration</span>
                  <span className="text-sm text-white font-semibold">
                    {durationSecs !== null ? formatDuration(durationSecs) : '—'}
                  </span>
                </div>
              </div>
            </Bentobox>

          </div>
        )}

        {/* ===== SELECT STEP ===== */}
        {currentStep === 'select' && upload.fileUrl && (
          <div className="max-w-6xl mx-auto w-full">
            {/* ── Toolbar: stats + actions ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              {/* Stats pill */}
              <div className="flex w-full sm:w-fit items-stretch rounded-2xl overflow-hidden border border-white/10 shrink-0 text-xs font-semibold">
                <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-slate-500/20 text-slate-200 whitespace-nowrap">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>{detection.tracks.length}</strong> detected</span>
                </div>
                <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-red-500/20 text-red-300 border-x border-white/10 whitespace-nowrap">
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>{detection.selectedTrackIds.length}</strong> blurred</span>
                </div>
                <div className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-emerald-500/20 text-emerald-300 whitespace-nowrap">
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>{detection.tracks.length - detection.selectedTrackIds.length}</strong> visible</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex w-full sm:w-auto items-center gap-1 sm:gap-2 justify-end">
                {/* Upload new file */}
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  <UploadIcon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Upload new file</span>
                  <span className="sm:hidden">New</span>
                </button>

                {/* Download */}
                <button
                  onClick={() => exportHook.exportVideo()}
                  disabled={exportHook.exporting || exportHook.saving || detection.selectedTrackIds.length === 0}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white text-sm transition-colors cursor-pointer relative overflow-hidden whitespace-nowrap"
                >
                  {exportHook.exporting && <span className="absolute inset-0 bg-white/10 transition-all duration-500" style={{ width: `${exportHook.exportProgress}%` }} />}
                  <span className="relative flex items-center gap-2">
                    {exportHook.exporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">{exportHook.exportProgress}%</span></>
                      : <><Download className="w-4 h-4" /><span className="hidden sm:inline">Download</span></>
                    }
                  </span>
                </button>

                {/* Save Video */}
                <button
                  onClick={async () => {
                    if (!canSave) {
                      upload.setError(!userIntegration ? 'Save is not available.' : 'Please log in to save videos.');
                      return;
                    }
                    setSaved(false);
                    const ok = await exportHook.saveVideo();
                    if (ok) setSaved(true);
                  }}
                  disabled={exportHook.saving || exportHook.exporting || detection.selectedTrackIds.length === 0 || saved}
                  className={`flex items-center justify-center gap-2 w-28 sm:w-36 py-2 rounded-xl font-semibold text-white text-sm transition-colors cursor-pointer relative overflow-hidden whitespace-nowrap ${
                    canSave
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-blue-600/40 hover:bg-blue-600/50'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {exportHook.saving && <span className="absolute inset-0 bg-white/10 transition-all duration-500" style={{ width: `${exportHook.saveProgress}%` }} />}
                  <span className="relative flex items-center gap-2">
                    {exportHook.saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Saving... {exportHook.saveProgress}%</span></>
                      : saved
                        ? <><CheckCircle className="w-4 h-4 text-emerald-300" /><span className="hidden sm:inline">Saved!</span></>
                        : !canSave
                          ? <><Lock className="w-4 h-4 opacity-60" /><span className="hidden sm:inline">Save Video</span></>
                          : <><Save className="w-4 h-4" /><span className="hidden sm:inline">Save Video</span></>
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

            <div className="rounded-2xl p-2 mb-6 bg-white/5 border border-white/8">
              <PlayerWithMask
                videoUrl={upload.fileUrl}
                tracks={detection.tracks}
                selectedTrackIds={detection.selectedTrackIds}
                onToggleTrack={detection.toggleTrack}
                blurMode={blurMode}
                sampleRate={sampleRate}
                fps={upload.videoMetadata?.fps || 30}
                padding={0.4}
                targetBlocks={12}
              />
            </div>

            <div className="rounded-2xl p-6 bg-white/5 border border-white/8">
              <FaceGallery
                tracks={detection.tracks}
                selectedTrackIds={detection.selectedTrackIds}
                onToggleTrack={detection.toggleTrack}
                onSelectAll={detection.selectAll}
                onDeselectAll={detection.deselectAll}
                blurMode={blurMode}
                onBlurModeChange={setBlurMode}
                videoUrl={upload.fileUrl}
                fps={upload.videoMetadata?.fps || 30}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <div className="text-sm text-slate-600">{upload.fileName}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
