'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Eye,
  EyeOff,
  Users,
  UserX,
  Info,
  Film,
  Download,
  Loader2,
} from 'lucide-react';

import { useVideoUpload, useFaceDetection, useVideoExport } from './hooks';
import { Header, DropZone, ProgressBar, ErrorAlert, FaceGallery } from './components';

const PlayerWithMask = dynamic(() => import('./components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select';

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sampleRate, setSampleRate] = useState(3);

  // Video upload hook
  const upload = useVideoUpload();

  // Face detection hook
  const detection = useFaceDetection({
    sampleRate,
    fileUrl: upload.fileUrl,
    fileRef: upload.fileRef,
    onError: upload.setError,
  });

  // Export hook
  const exportHook = useVideoExport({
    videoId: upload.videoId,
    fileName: upload.fileName,
    tracks: detection.tracks,
    selectedTrackIds: detection.selectedTrackIds,
    onError: upload.setError,
  });

  // Handle file selection
  async function handleFileSelect(file: File) {
    const success = await upload.handleFile(file);
    if (success) {
      detection.reset();
      setCurrentStep('detect');
    }
  }

  // Handle detection start
  async function handleStartDetection() {
    const success = await detection.runDetection();
    if (success) {
      setCurrentStep('select');
    }
  }

  // Handle export
  async function handleExport() {
    await exportHook.exportVideo();
  }

  // Reset everything
  function handleReset() {
    upload.reset();
    detection.reset();
    setCurrentStep('upload');
  }

  return (
    <div className="min-h-screen bg-zinc-950 bg-grid">
      <Header
        currentStep={currentStep}
        onUploadNew={handleReset}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error alert */}
        {upload.error && (
          <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />
        )}

        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Upload your video</h1>
              <p className="text-zinc-400">Select or drag a video file to get started</p>
            </div>
            <DropZone onFileSelect={handleFileSelect} />
          </div>
        )}

        {/* Step 2: Detect */}
        {currentStep === 'detect' && upload.fileUrl && (
          <div className="max-w-4xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8 items-stretch">
              {/* Video preview */}
              <div className="flex flex-col min-h-0">
                <div className="glass rounded-2xl p-2 mb-4 flex-1 min-h-0 flex flex-col">
                  <video src={upload.fileUrl} controls className="w-full h-full min-h-[240px] object-contain rounded-xl" />
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Film className="w-4 h-4" />
                  <span className="truncate">{upload.fileName}</span>
                </div>
              </div>

              {/* Detection panel */}
              <div className="flex flex-col">
                <div className="glass rounded-2xl p-6 flex-1">
                  <h2 className="text-xl font-semibold mb-2">Detect Faces</h2>
                  <p className="text-zinc-400 text-sm mb-6">
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
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Eye className="w-5 h-5" />
                      Start Detection
                    </button>
                  )}
                </div>

                <div className="mt-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="relative group">
                      <span className="inline-flex cursor-help text-zinc-500 hover:text-indigo-400 transition-colors">
                        <Info className="w-4 h-4" />
                      </span>
                      <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-3 text-sm text-left text-zinc-300 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl pointer-events-none">
                        <span className="font-medium text-white">Frame sampling</span>
                        <br />
                        <span className="text-zinc-400 text-xs">1 check per {sampleRate} frames</span>
                        <br /><br />
                        Faces are only searched at these intervals, and not on every frame.
                        <br /><br />
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-emerald-400">Low = thorough</span>
                          <span className="text-amber-400">High = fast</span>
                        </div>
                      </span>
                    </span>
                    <span>Sample every <strong className="text-zinc-300">{sampleRate}</strong> frames</span>
                  </div>
                  <div className="mt-4 flex items-center gap-3 bg-zinc-800 rounded-lg px-3 py-2">
                    <label className="text-xs text-zinc-400">Sample rate:</label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={sampleRate}
                      onChange={e => setSampleRate(Number(e.target.value))}
                      className="w-24 accent-indigo-500"
                    />
                    <span className="text-xs font-mono w-6 text-zinc-300">{sampleRate}</span>
                    <span className="text-xs text-zinc-500">frames</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Select & Export */}
        {currentStep === 'select' && upload.fileUrl && (
          <div className="max-w-6xl mx-auto">
            {/* Status bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
              <div className="flex flex-row flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span><strong className="text-white">{detection.tracks.length}</strong> people detected</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs sm:text-sm">
                  <EyeOff className="w-4 h-4 text-indigo-400" />
                  <span className="text-indigo-400">
                    <strong>{detection.selectedTrackIds.length}</strong> selected for blur
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs sm:text-sm">
                  <Eye className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">
                    <strong>{detection.tracks.length - detection.selectedTrackIds.length}</strong> face{detection.tracks.length - detection.selectedTrackIds.length !== 1 ? 's' : ''} visible
                  </span>
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 shrink-0">
                <button
                  onClick={detection.selectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  <UserX className="w-4 h-4" />
                  Blur All
                </button>
                <button
                  onClick={detection.deselectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Clear
                </button>
                <button
                  onClick={handleExport}
                  disabled={exportHook.exporting || detection.selectedTrackIds.length === 0}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 font-medium text-white transition-all text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  {exportHook.exporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Exporting... {exportHook.exportProgress}%
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download Video
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-6 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
              <p className="text-sm text-zinc-400">
                <strong className="text-indigo-400">Tip:</strong> Click faces in the gallery below or play the video and click on faces with{' '}
                <span className="text-red-400">red frames</span> to blur them.
                Selected faces will appear pixelated.
              </p>
            </div>

            {/* Video Player */}
            <div className="glass rounded-2xl p-2 mb-6">
              <PlayerWithMask
                videoUrl={upload.fileUrl}
                tracks={detection.tracks}
                selectedTrackIds={detection.selectedTrackIds}
                onToggleTrack={detection.toggleTrack}
                blur={true}
                sampleRate={sampleRate}
              />
            </div>

            {/* Face Gallery */}
            <div className="glass rounded-2xl p-6">
              <FaceGallery
                tracks={detection.tracks}
                selectedTrackIds={detection.selectedTrackIds}
                onToggleTrack={detection.toggleTrack}
                videoUrl={upload.fileUrl}
              />
            </div>

            {/* Action bar */}
            <div className="mt-6 flex justify-end">
              <div className="text-sm text-zinc-500">{upload.fileName}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}