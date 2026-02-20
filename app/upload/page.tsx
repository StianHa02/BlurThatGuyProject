'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Users, UserX, Info, Film, Download, Loader2 } from 'lucide-react';
import { useVideoUpload, useFaceDetection, useVideoExport } from './hooks';
import { Header, DropZone, ProgressBar, ErrorAlert, FaceGallery } from './components';

const PlayerWithMask = dynamic(() => import('./components/PlayerWithMask'), { ssr: false });

type Step = 'upload' | 'detect' | 'select';

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sampleRate, setSampleRate] = useState(3);

  const upload = useVideoUpload();
  const detection = useFaceDetection({ sampleRate, fileUrl: upload.fileUrl, fileRef: upload.fileRef, onError: upload.setError });
  const exportHook = useVideoExport({ videoId: upload.videoId, fileName: upload.fileName, tracks: detection.tracks, selectedTrackIds: detection.selectedTrackIds, onError: upload.setError });

  async function handleFileSelect(file: File) {
    const success = await upload.handleFile(file);
    if (success) { detection.reset(); setCurrentStep('detect'); }
  }

  async function handleStartDetection() {
    const success = await detection.runDetection();
    if (success) setCurrentStep('select');
  }

  function handleReset() { upload.reset(); detection.reset(); setCurrentStep('upload'); }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Header currentStep={currentStep} onUploadNew={handleReset} />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
        {upload.error && <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />}

        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--foreground)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                Upload your video
              </h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: 15, fontWeight: 300 }}>Select or drag a video file to get started</p>
            </div>
            <DropZone onFileSelect={handleFileSelect} />
          </div>
        )}

        {/* Step 2: Detect */}
        {currentStep === 'detect' && upload.fileUrl && (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'stretch' }}>
              {/* Video preview */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 12, background: 'var(--card)', flex: 1 }}>
                  <video src={upload.fileUrl} controls style={{ width: '100%', borderRadius: 4, display: 'block' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--subtle)' }}>
                  <Film style={{ width: 14, height: 14 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{upload.fileName}</span>
                </div>
              </div>

              {/* Detection panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 24, background: 'var(--card)', flex: 1 }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--foreground)', marginBottom: 8 }}>Detect Faces</h2>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: 14, marginBottom: 24, fontWeight: 300, lineHeight: 1.6 }}>
                    Our AI will scan through your video and identify all faces that appear.
                  </p>
                  {detection.processing ? (
                    <ProgressBar progress={detection.progress} status={detection.status} hint="This may take a minute depending on video length" />
                  ) : (
                    <button onClick={handleStartDetection} className="cta-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      <Eye style={{ width: 16, height: 16 }} />
                      Start Detection
                    </button>
                  )}
                </div>

                {/* Sample rate */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 16, background: 'var(--card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12 }}>
                    <span style={{ position: 'relative', display: 'inline-flex' }} className="group">
                      <Info style={{ width: 14, height: 14, color: 'var(--subtle)', cursor: 'help' }} />
                    </span>
                    Sample every <strong style={{ color: 'var(--foreground)' }}>{sampleRate}</strong> frames
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: 12, color: 'var(--subtle)' }}>Rate:</label>
                    <input type="range" min={1} max={10} value={sampleRate} onChange={e => setSampleRate(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--primary)' }} />
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--foreground)', minWidth: 16 }}>{sampleRate}</span>
                    <span style={{ fontSize: 12, color: 'var(--subtle)' }}>frames</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 8, color: 'var(--subtle)' }}>
                    <span style={{ color: 'var(--primary)' }}>Low = thorough</span>
                    <span>High = fast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Select & Export */}
        {currentStep === 'select' && upload.fileUrl && (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>

            {/* Status bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { icon: Users, label: `${detection.tracks.length} people detected`, color: 'var(--foreground)' },
                  { icon: EyeOff, label: `${detection.selectedTrackIds.length} selected for blur`, color: 'var(--primary)' },
                  { icon: Eye, label: `${detection.tracks.length - detection.selectedTrackIds.length} visible`, color: 'var(--muted-foreground)' },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, color }}>
                    <Icon style={{ width: 14, height: 14 }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={detection.selectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
                  <UserX style={{ width: 14, height: 14 }} /> Blur All
                </button>
                <button onClick={detection.deselectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
                  <Eye style={{ width: 14, height: 14 }} /> Clear
                </button>
                <button
                  onClick={() => exportHook.exportVideo()}
                  disabled={exportHook.exporting || detection.selectedTrackIds.length === 0}
                  className="cta-primary"
                  style={{ padding: '6px 16px', fontSize: 13, opacity: (exportHook.exporting || detection.selectedTrackIds.length === 0) ? 0.4 : 1, cursor: exportHook.exporting || detection.selectedTrackIds.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  {exportHook.exporting ? (
                    <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Exporting... {exportHook.exportProgress}%</>
                  ) : (
                    <><Download style={{ width: 14, height: 14 }} /> Download Video</>
                  )}
                </button>
              </div>
            </div>

            {/* Tip */}
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 6, border: '1px solid rgba(200,245,90,0.15)', background: 'rgba(200,245,90,0.04)', fontSize: 13, color: 'var(--muted-foreground)' }}>
              <strong style={{ color: 'var(--primary)' }}>Tip:</strong> Click faces in the gallery below or play the video and click on faces with{' '}
              <span style={{ color: '#f87171' }}>red frames</span> to blur them.
            </div>

            {/* Video Player */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 20, background: 'var(--card)' }}>
              <PlayerWithMask videoUrl={upload.fileUrl} tracks={detection.tracks} selectedTrackIds={detection.selectedTrackIds} onToggleTrack={detection.toggleTrack} blur={true} sampleRate={sampleRate} />
            </div>

            {/* Face Gallery */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 24, background: 'var(--card)' }}>
              <FaceGallery tracks={detection.tracks} selectedTrackIds={detection.selectedTrackIds} onToggleTrack={detection.toggleTrack} videoUrl={upload.fileUrl} />
            </div>

            <div style={{ marginTop: 16, textAlign: 'right', fontSize: 13, color: 'var(--subtle)' }}>{upload.fileName}</div>
          </div>
        )}
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}