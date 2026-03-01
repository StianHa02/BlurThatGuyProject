'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Users, UserX, Info, Download, Loader2 } from 'lucide-react';
import { useVideoUpload, useFaceDetection, useVideoExport } from './hooks';
import { Header, DropZone, ProgressBar, ErrorAlert, FaceGallery, SpotlightCard } from './components';
import { BackgroundBlobs} from '../(landing)/components';

const PlayerWithMask = dynamic(() => import('./components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select';

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sampleRate, setSampleRate] = useState(3);

  const upload = useVideoUpload();
  const detection = useFaceDetection({
    sampleRate,
    videoId: upload.videoId,
    onError: upload.setError,
  });
  const exportHook = useVideoExport({
    videoId: upload.videoId,
    fileName: upload.fileName,
    selectedTrackIds: detection.selectedTrackIds,
    sampleRate,
    onError: upload.setError,
  });

  async function handleFileSelect(file: File) {
    const success = await upload.handleFile(file);
    if (success) { detection.reset(); setCurrentStep('detect'); }
  }

  async function handleStartDetection() {
    const success = await detection.runDetection();
    if (success) setCurrentStep('select');
  }

  function handleReset() {
    upload.reset();
    detection.reset();
    setCurrentStep('upload');
  }

  const fileSize = upload.fileRef?.current?.size ?? null;
  const durationSecs = upload.videoMetadata
    ? upload.videoMetadata.frameCount / upload.videoMetadata.fps
    : null;
  const shortName = upload.fileName.length > 28
    ? upload.fileName.slice(0, 25) + '...'
    : upload.fileName;

  return (
    <div className="min-h-screen bg-[#070f1c] text-white flex flex-col">

      <BackgroundBlobs />

      <Header currentStep={currentStep} onUploadNew={handleReset} />

      <main className="relative z-10 flex-1 flex flex-col max-w-6xl w-full mx-auto px-6 py-8">
        {upload.error && (
          <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />
        )}

        {/* ===== UPLOAD STEP ===== */}
        {currentStep === 'upload' && (
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
              <SpotlightCard className="flex flex-col min-h-0" color="blue">
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
              </SpotlightCard>

              {/* Right: detect controls */}
              <SpotlightCard className="flex flex-col min-h-0" color="blue">
                <div className="relative p-7 flex flex-col flex-1 overflow-auto">
                  <h2 className="text-2xl font-semibold mb-2 text-white">Detect Faces</h2>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                    Our AI will scan through your video and identify all faces that appear.
                  </p>
                  {detection.processing ? (
                    <ProgressBar
                      progress={detection.progress}
                      status={detection.status}
                      hint="This may take a minute depending on video length"
                    />
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
              </SpotlightCard>
            </div>

            {/* Bottom: Video Details full width */}
            <SpotlightCard color="blue">
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
            </SpotlightCard>

          </div>
        )}

        {/* ===== SELECT STEP ===== */}
        {currentStep === 'select' && upload.fileUrl && (
          <div className="max-w-6xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
              <div className="flex flex-row flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span><strong className="text-white">{detection.tracks.length}</strong> people detected</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs sm:text-sm">
                  <EyeOff className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300"><strong>{detection.selectedTrackIds.length}</strong> selected for blur</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">
                    <strong>{detection.tracks.length - detection.selectedTrackIds.length}</strong>{' '}
                    face{detection.tracks.length - detection.selectedTrackIds.length !== 1 ? 's' : ''} visible
                  </span>
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 shrink-0">
                <button onClick={detection.selectAll} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm transition-colors cursor-pointer">
                  <UserX className="w-4 h-4" /> Blur All
                </button>
                <button onClick={detection.deselectAll} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm transition-colors cursor-pointer">
                  <Eye className="w-4 h-4" /> Clear
                </button>
                <button
                  onClick={() => exportHook.exportVideo()}
                  disabled={exportHook.exporting || detection.selectedTrackIds.length === 0}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/8 disabled:text-slate-500 font-medium text-white transition-all text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed relative overflow-hidden shadow-lg shadow-emerald-600/20"
                >
                  {exportHook.exporting && (
                    <span
                      className="absolute inset-0 bg-emerald-400/20 transition-all duration-500"
                      style={{ width: `${exportHook.exportProgress}%` }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    {exportHook.exporting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Exporting... {exportHook.exportProgress}%</>
                    ) : (
                      <><Download className="w-4 h-4" /> Download Video</>
                    )}
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
                blur={true}
                sampleRate={sampleRate}
                fps={upload.videoMetadata?.fps || 30}
              />
            </div>

            <div className="rounded-2xl p-6 bg-white/5 border border-white/8">
              <FaceGallery
                tracks={detection.tracks}
                selectedTrackIds={detection.selectedTrackIds}
                onToggleTrack={detection.toggleTrack}
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