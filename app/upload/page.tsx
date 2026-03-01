'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Users, UserX, Info, Film, Download, Loader2 } from 'lucide-react';
import { useVideoUpload, useFaceDetection, useVideoExport } from './hooks';
import { Header, DropZone, ProgressBar, ErrorAlert, FaceGallery } from './components';
import { BackgroundBlobs } from '../(landing)/components';

const PlayerWithMask = dynamic(() => import('./components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select';

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

  return (
    <div className="min-h-screen bg-[#070f1c] text-white">

      <BackgroundBlobs />

      <Header currentStep={currentStep} onUploadNew={handleReset} />

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {upload.error && (
          <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />
        )}

        {/* ===== UPLOAD STEP ===== */}
        {currentStep === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
                Upload your video
              </h1>
              <p className="text-slate-400">Select or drag a video file to get started</p>
            </div>
            <DropZone onFileSelect={handleFileSelect} />
          </div>
        )}

        {/* ===== DETECT STEP ===== */}
        {currentStep === 'detect' && upload.fileUrl && (
          <div className="max-w-4xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8 items-stretch">
              <div className="flex flex-col min-h-0">
                <div className="rounded-2xl p-2 mb-4 flex-1 min-h-0 flex flex-col bg-white/5 border border-white/8 backdrop-blur-sm">
                  <video src={upload.fileUrl} controls className="w-full h-full min-h-[240px] object-contain rounded-xl" />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Film className="w-4 h-4" />
                  <span className="truncate">{upload.fileName}</span>
                </div>
              </div>

              <div className="flex flex-col">
                <div className="rounded-2xl p-6 flex-1 bg-white/5 border border-white/8 backdrop-blur-sm">
                  <h2 className="text-xl font-semibold mb-2">Detect Faces</h2>
                  <p className="text-slate-400 text-sm mb-6">
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
                      className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
                    >
                      <Eye className="w-5 h-5" />
                      Start Detection
                    </button>
                  )}
                </div>

                <div className="mt-4 p-4 rounded-xl bg-white/4 border border-white/8">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="relative group">
                      <span className="inline-flex cursor-help text-slate-500 hover:text-blue-400 transition-colors">
                        <Info className="w-4 h-4" />
                      </span>
                      <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-3 text-sm text-left text-slate-300 bg-[#0d1b2e] border border-white/10 rounded-lg shadow-xl pointer-events-none">
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
                  <div className="mt-4 flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                    <label className="text-xs text-slate-400">Sample rate:</label>
                    <input
                      type="range" min={1} max={10} value={sampleRate}
                      onChange={e => setSampleRate(Number(e.target.value))}
                      className="w-24 accent-blue-500"
                    />
                    <span className="text-xs font-mono w-6 text-white">{sampleRate}</span>
                    <span className="text-xs text-slate-500">frames</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SELECT STEP ===== */}
        {currentStep === 'select' && upload.fileUrl && (
          <div className="max-w-6xl mx-auto">
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