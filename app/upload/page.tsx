'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadModels, detectFacesInCanvas, resetTrackers } from '@/lib/faceClient';
import { trackDetections } from '@/lib/tracker';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const PlayerWithMask = dynamic(() => import('../components/PlayerWithMask'), { ssr: false });

export default function UploadPage() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [sampleRate, setSampleRate] = useState(3);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const fileRef = useRef<File | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    fileRef.current = f;
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setTracks([]);
    setSelectedTrackIds([]);

  }

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

  // Helper to find detection for a frame
  function findDetectionForFrame(frames: any[], frameIndex: number): any | null {
    if (!frames || frames.length === 0) return null;
    let best: any = null;
    let bestDiff = Infinity;
    for (const f of frames) {
      const diff = Math.abs(f.frameIndex - frameIndex);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = f;
      }
    }
    return bestDiff <= 15 ? best : null;
  }

  // Export video with blurred faces
  async function exportVideo() {
    if (!fileUrl || selectedTrackIds.length === 0) {
      alert('Please select at least one face to blur before exporting.');
      return;
    }

    setExporting(true);
    setExportProgress(0);

    try {
      const video = document.createElement('video');
      video.src = fileUrl;
      video.muted = true;

      await new Promise<void>((resolve) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });

      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      const frameRate = 30;
      const totalFrames = Math.ceil(duration * frameRate);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Create MediaRecorder to capture canvas as video
      const stream = canvas.captureStream(frameRate);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.start();

      // Build tracks map for quick lookup
      const tracksMap = new Map<number, any>();
      for (const t of tracks) tracksMap.set(t.id, t);

      // Process each frame
      for (let fi = 0; fi < totalFrames; fi++) {
        await new Promise<void>((resolve) => {
          video.currentTime = fi / frameRate;
          video.onseeked = () => {
            // Draw video frame
            ctx.drawImage(video, 0, 0, width, height);

            // Apply blur to selected faces
            for (const trackId of selectedTrackIds) {
              const track = tracksMap.get(trackId);
              if (!track) continue;

              const det = findDetectionForFrame(track.frames, fi);
              if (!det) continue;

              const padding = 0.4;
              const [ox, oy, ow, oh] = det.bbox;
              const x = Math.max(0, ox - ow * padding);
              const y = Math.max(0, oy - oh * padding);
              const w = ow * (1 + padding * 2);
              const h = oh * (1 + padding * 2);

              // Pixelated blur effect
              const blurAmount = 12;
              const tmp = document.createElement('canvas');
              tmp.width = Math.max(1, Math.floor(w / blurAmount));
              tmp.height = Math.max(1, Math.floor(h / blurAmount));
              const tctx = tmp.getContext('2d');
              if (tctx) {
                tctx.drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
              }
            }

            resolve();
          };
        });

        // Small delay to let MediaRecorder capture the frame
        await new Promise(r => setTimeout(r, 1000 / frameRate));

        setExportProgress(Math.round((fi / totalFrames) * 80)); // 0-80% for recording
      }

      // Stop recording
      mediaRecorder.stop();

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
      });

      const webmBlob = new Blob(chunks, { type: 'video/webm' });

      // Convert WebM to MP4 using FFmpeg
      setStatus('Converting to MP4...');
      setExportProgress(85);

      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
      });

      setExportProgress(90);

      // Write WebM to FFmpeg filesystem
      await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));

      setExportProgress(92);

      // Convert to MP4
      await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', 'output.mp4']);

      setExportProgress(98);

      // Read the output file
      const data = await ffmpeg.readFile('output.mp4') as Uint8Array;
      const mp4Blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(mp4Blob);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'blurred-video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setStatus('Export complete!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export video. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function runDetectionClient() {
    const f = fileRef.current;
    if (!f || !fileUrl) return;
    setProcessing(true);
    setStatus('Loading face detector...');

    // Reset tracking state for new video
    resetTrackers();

    try {
      await loadModels();
      setStatus('Face detector loaded');
    } catch (err) {
      console.error('Failed to load face detector:', err);
      alert('Failed to load face detector. Please check your internet connection and try again.');
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

    setStatus(`Scanning ${Math.ceil(totalFrames / sampleRate)} frames...`);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const detectionsPerFrame: Record<number, { bbox: [number, number, number, number]; score: number }[]> = {};
    let detectionsCount = 0;

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
              detectionsCount += dets.length;
            }
          } catch (e) {
            console.error('Detection error at frame', fi, e);
          }
          resolve();
        };
        video.addEventListener('seeked', onSeek, { once: true });
      });
      const currentProgress = Math.round((fi / totalFrames) * 100);
      setStatus(`Scanning video... ${currentProgress}%`);
    }

    setStatus('Tracking people...');

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

    if (filteredTracks.length === 0) {
      setStatus('No people detected in this video');
    } else if (filteredTracks.length === 1) {
      setStatus('Found 1 person - play video and click to blur');
    } else {
      setStatus(`Found ${filteredTracks.length} people - play video and click on faces to blur`);
    }

    setProcessing(false);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Blur That Guy</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Upload a video, detect faces, then click on faces in the video to blur them.
      </p>

      {/* STEP 1: Upload */}
      <div className="mb-6 p-4 border rounded bg-gray-50 dark:bg-gray-900">
        <h2 className="font-semibold mb-2">Step 1: Upload Video</h2>
        <input type="file" accept="video/mp4" onChange={onFileChange} className="block" />
        {fileUrl && <p className="text-green-600 mt-2">✓ Video loaded</p>}
      </div>

      {/* STEP 2: Detect */}
      {fileUrl && (
        <div className="mb-6 p-4 border rounded bg-gray-50 dark:bg-gray-900">
          <h2 className="font-semibold mb-2">Step 2: Detect Faces</h2>
          <p className="text-sm text-gray-500 mb-3">Scans through the video to find all faces.</p>

          <div className="flex flex-wrap gap-4 items-center mb-3">
            <div>
              <label className="mr-2 text-sm">Sample every</label>
              <input
                type="number"
                value={sampleRate}
                onChange={e => setSampleRate(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-16 border rounded px-2 py-1"
              />
              <span className="ml-1 text-sm">frames</span>
            </div>
          </div>

          <button
            onClick={runDetectionClient}
            disabled={processing}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : 'Detect Faces'}
          </button>

          {status && (
            <p className={`mt-2 ${processing ? 'text-blue-600' : 'text-green-600'}`}>{status}</p>
          )}
        </div>
      )}

      {/* STEP 3: Select faces and play */}
      {fileUrl && tracks.length > 0 && (
        <div className="mb-6 p-4 border rounded bg-gray-50 dark:bg-gray-900">
          <h2 className="font-semibold mb-2">Step 3: Select Faces to Blur</h2>
          <p className="text-sm text-gray-500 mb-3">
            Play the video and <strong>click on red-framed faces</strong> to blur them.
            Click again to unblur.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={selectAllFaces}
              className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
            >
              Blur All Faces
            </button>
            <button
              onClick={deselectAllFaces}
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              Clear Selection
            </button>
            <button
              onClick={exportVideo}
              disabled={exporting || selectedTrackIds.length === 0}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? `Exporting... ${exportProgress}%` : 'Download Video'}
            </button>
          </div>

          <PlayerWithMask
            videoUrl={fileUrl}
            tracks={tracks}
            selectedTrackIds={selectedTrackIds}
            onToggleTrack={handleToggleTrack}
            blur={true}
            sampleRate={sampleRate}
          />
        </div>
      )}

      {/* Show video preview before detection */}
      {fileUrl && tracks.length === 0 && !processing && (
        <div className="mb-6">
          <h3 className="font-medium mb-2">Video Preview:</h3>
          <video src={fileUrl} controls style={{ maxWidth: '100%' }} />
        </div>
      )}
    </div>
  );
}
