'use client';

import React, { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { loadModels, detectFacesInCanvas, resetTrackers } from '@/lib/faceClient';
import { trackDetections } from '@/lib/tracker';
import {
  Upload,
  ArrowLeft,
  Play,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Users,
  UserX,
  Settings,
  X,
  Film
} from 'lucide-react';

const API_URL = 'http://localhost:8000';

const PlayerWithMask = dynamic(() => import('../components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select' | 'export';

export default function UploadPage() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [sampleRate, setSampleRate] = useState(3);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, WebM, etc.)');
      return;
    }

    setError(null);
    fileRef.current = f;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setTracks([]);
    setSelectedTrackIds([]);
    setVideoId(null);
    setCurrentStep('detect');

    // Upload video to backend for later export
    try {
      const formData = new FormData();
      formData.append('file', f);
      const response = await fetch(`${API_URL}/upload-video`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        setVideoId(data.videoId);
      }
    } catch (err) {
      console.error('Failed to upload video to backend:', err);
    }
  }, []);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    handleFile(f);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // Toggle track selection (add or remove from selected list)
  function handleToggleTrack(trackId: number) {
    setSelectedTrackIds(prev => {
      if (prev.includes(trackId)) {
        return prev.filter(id => id !== trackId);
      } else {
        return [...prev, trackId];
      }
    });
  }

  // Select all faces
  function selectAllFaces() {
    setSelectedTrackIds(tracks.map(t => t.id));
  }

  // Deselect all faces
  function deselectAllFaces() {
    setSelectedTrackIds([]);
  }

  function resetAll() {
    setFileUrl(null);
    setFileName('');
    setTracks([]);
    setSelectedTrackIds([]);
    setVideoId(null);
    setCurrentStep('upload');
    setProgress(0);
    setStatus('');
    setError(null);
    fileRef.current = null;
  }

  // Export video with blurred faces (using backend)
  async function exportVideo() {
    if (!videoId || selectedTrackIds.length === 0) {
      setError('Please select at least one face to blur before exporting.');
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setStatus('Processing video on server...');
    setCurrentStep('export');

    try {
      setExportProgress(10);

      const response = await fetch(`${API_URL}/export/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracks: tracks,
          selectedTrackIds: selectedTrackIds,
          padding: 0.4,
          blurAmount: 12,
        }),
      });

      setExportProgress(80);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `blurred-${fileName || 'video.mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setStatus('Export complete!');
      setCurrentStep('select');
    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export video. Make sure the backend is running.');
      setCurrentStep('select');
    } finally {
      setExporting(false);
    }
  }

  async function runDetectionClient() {
    const f = fileRef.current;
    if (!f || !fileUrl) return;
    setProcessing(true);
    setProgress(0);
    setStatus('Connecting to face detector...');
    setError(null);

    // Reset tracking state for new video
    resetTrackers();

    try {
      await loadModels();
      setStatus('Face detector ready');
    } catch (err) {
      console.error('Failed to load face detector:', err);
      setError('Failed to connect to face detector. Make sure the Python backend is running on port 8000.');
      setProcessing(false);
      setStatus('');
      return;
    }

    setStatus('Preparing video...');
    const video = document.createElement('video');
    video.src = fileUrl;
    video.muted = true;
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;
    const frameRate = 30;
    const totalFrames = Math.ceil(duration * frameRate);
    const framesToScan = Math.ceil(totalFrames / sampleRate);

    setStatus(`Scanning ${framesToScan} frames...`);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};
    let framesProcessed = 0;

    for (let fi = 0; fi < totalFrames; fi += sampleRate) {
      await new Promise<void>((resolve) => {
        video.currentTime = fi / frameRate;
        const onSeek = async () => {
          try {
            ctx.drawImage(video, 0, 0, width, height);
            const dets = await detectFacesInCanvas(canvas);
            if (dets && dets.length > 0) {
              detectionsPerFrame[fi] = dets.map(d => ({
                bbox: d.bbox as [number, number, number, number],
                score: d.score
              }));
            }
          } catch (e) {
            console.error('Detection error at frame', fi, e);
          }
          framesProcessed++;
          resolve();
        };
        video.addEventListener('seeked', onSeek, { once: true });
      });
      const currentProgress = Math.round((framesProcessed / framesToScan) * 100);
      setProgress(currentProgress);
      setStatus(`Analyzing video... ${currentProgress}%`);
    }

    setStatus('Building face tracks...');
    setProgress(100);

    // Tracker settings
    const builtTracks = trackDetections(detectionsPerFrame, {
      iouThreshold: 0.15,
      maxMisses: 20,
      minTrackLength: 3
    });

    // Filter out low detection tracks
    const totalSampledFrames = Math.ceil(totalFrames / sampleRate);
    const filteredTracks = builtTracks.filter(track => {
      const minDetections = Math.max(5, Math.floor(totalSampledFrames * 0.05));
      return track.frames.length >= Math.min(minDetections, 10);
    });

    filteredTracks.sort((a, b) => b.frames.length - a.frames.length);

    setTracks(filteredTracks);
    setSelectedTrackIds([]); // Start with no faces selected
    setCurrentStep('select');

    if (filteredTracks.length === 0) {
      setStatus('No faces detected');
      setError('No faces were detected in this video. Try adjusting the sample rate or use a video with visible faces.');
    } else if (filteredTracks.length === 1) {
      setStatus('1 person detected');
    } else {
      setStatus(`${filteredTracks.length} people detected`);
    }

    setProcessing(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 bg-grid">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <EyeOff className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold">BlurThatGuy</span>
            </div>
          </Link>

          {/* Step indicators */}
          <div className="hidden sm:flex items-center gap-2">
            {['upload', 'detect', 'select'].map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  currentStep === step 
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                    : i < ['upload', 'detect', 'select'].indexOf(currentStep)
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}>
                  {i < ['upload', 'detect', 'select'].indexOf(currentStep) ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">{i + 1}</span>
                  )}
                  <span className="capitalize">{step}</span>
                </div>
                {i < 2 && <div className={`w-8 h-px mx-1 ${i < ['upload', 'detect', 'select'].indexOf(currentStep) ? 'bg-green-500/50' : 'bg-zinc-700'}`} />}
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-zinc-400">Sample rate:</label>
                  <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={sampleRate}
                      onChange={e => setSampleRate(Number(e.target.value))}
                      className="w-20 accent-indigo-500"
                    />
                    <span className="text-sm font-mono w-6 text-zinc-300">{sampleRate}</span>
                  </div>
                  <span className="text-xs text-zinc-500">frames (lower = more accurate, slower)</span>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Upload your video</h1>
              <p className="text-zinc-400">Select or drag a video file to get started</p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
                dragOver 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                onChange={onFileChange}
                className="hidden"
              />
              <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center transition-colors ${
                dragOver ? 'bg-indigo-500/20' : 'bg-zinc-800'
              }`}>
                <Upload className={`w-8 h-8 ${dragOver ? 'text-indigo-400' : 'text-zinc-500'}`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">Drop your video here</h3>
              <p className="text-zinc-500 text-sm mb-4">or click to browse files</p>
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
                <Film className="w-3 h-3" />
                <span>Supports MP4, WebM, MOV</span>
              </div>
            </div>
          </div>
        )}

        {/* Detect Step */}
        {currentStep === 'detect' && fileUrl && (
          <div className="max-w-4xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Video preview */}
              <div>
                <div className="glass rounded-2xl p-2 mb-4">
                  <video
                    src={fileUrl}
                    controls
                    className="w-full rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Film className="w-4 h-4" />
                  <span className="truncate">{fileName}</span>
                  <button
                    onClick={resetAll}
                    className="ml-auto text-zinc-500 hover:text-white text-xs"
                  >
                    Change video
                  </button>
                </div>
              </div>

              {/* Detection panel */}
              <div className="flex flex-col">
                <div className="glass rounded-2xl p-6 flex-1">
                  <h2 className="text-xl font-semibold mb-2">Detect Faces</h2>
                  <p className="text-zinc-400 text-sm mb-6">
                    Our AI will scan through your video and identify all faces that appear.
                  </p>

                  {processing ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        <span className="text-sm">{status}</span>
                      </div>
                      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 progress-shine"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500">This may take a minute depending on video length</p>
                    </div>
                  ) : (
                    <button
                      onClick={runDetectionClient}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      Start Detection
                    </button>
                  )}
                </div>

                <div className="mt-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Settings className="w-4 h-4" />
                    <span>Sample every <strong className="text-zinc-300">{sampleRate}</strong> frames</span>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="ml-auto text-indigo-400 hover:text-indigo-300 text-xs"
                    >
                      Adjust
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Select Step */}
        {currentStep === 'select' && fileUrl && (
          <div>
            {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm">
                    <strong className="text-white">{tracks.length}</strong> people detected
                  </span>
                </div>
                {selectedTrackIds.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <EyeOff className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm text-indigo-400">
                      <strong>{selectedTrackIds.length}</strong> selected for blur
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllFaces}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
                >
                  <UserX className="w-4 h-4" />
                  Blur All
                </button>
                <button
                  onClick={deselectAllFaces}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Clear
                </button>
                <button
                  onClick={exportVideo}
                  disabled={exporting || selectedTrackIds.length === 0}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 font-medium text-white transition-all"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Exporting... {exportProgress}%
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
                <strong className="text-indigo-400">Tip:</strong> Play the video and click on faces with <span className="text-red-400">red frames</span> to blur them.
                Click blurred faces to unblur. Selected faces will appear pixelated.
              </p>
            </div>

            {/* Video Player */}
            <div className="glass rounded-2xl p-2">
              <PlayerWithMask
                videoUrl={fileUrl}
                tracks={tracks}
                selectedTrackIds={selectedTrackIds}
                onToggleTrack={handleToggleTrack}
                blur={true}
                sampleRate={sampleRate}
              />
            </div>

            {/* Action bar */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={resetAll}
                className="text-sm text-zinc-500 hover:text-white transition-colors"
              >
                ← Upload different video
              </button>
              <div className="text-sm text-zinc-500">
                {fileName}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
