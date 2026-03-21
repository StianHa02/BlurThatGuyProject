'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, Loader2, Info } from 'lucide-react';
import { Header } from '@/components';
import { ProgressBar, ErrorAlert, Bentobox } from '../components';
import { useFaceDetection } from '../hooks';
import { getVideoStreamUrl } from '@/lib/services/faceClient';
import { formatDuration } from '@/lib/utils';

interface VideoMetadata {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
}

export default function DetectPage() {
  return (
    <Suspense>
      <DetectPageContent />
    </Suspense>
  );
}

function DetectPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoId = searchParams.get('v');

  const [error, setError] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState(3);
  const [abortController] = useState(() => new AbortController());

  // Initialize state from sessionStorage (runs once, no effect needed)
  const [metadata] = useState<VideoMetadata | null>(() => {
    if (!videoId) return null;
    const cached = typeof window !== 'undefined' ? sessionStorage.getItem(`upload:${videoId}:metadata`) : null;
    return cached ? JSON.parse(cached) : null;
  });
  const [fileName] = useState(() => {
    if (!videoId) return '';
    return (typeof window !== 'undefined' ? sessionStorage.getItem(`upload:${videoId}:fileName`) : null) ?? '';
  });
  const videoUrl = videoId ? getVideoStreamUrl(videoId) : null;

  const detection = useFaceDetection({
    sampleRate,
    videoId,
    onError: setError,
    signal: abortController.signal,
  });

  // Redirect if no videoId
  useEffect(() => {
    if (!videoId) router.replace('/upload');
  }, [videoId, router]);

  const handleStartDetection = useCallback(async () => {
    const success = await detection.runDetection();
    if (success && videoId) {
      // Cache sampleRate for the select page
      sessionStorage.setItem(`upload:${videoId}:sampleRate`, String(sampleRate));
      router.push(`/upload/select?v=${videoId}`);
    }
  }, [detection, videoId, sampleRate, router]);

  if (!videoId || !videoUrl) return null;

  const shortName = fileName.length > 28 ? fileName.slice(0, 25) + '...' : fileName;
  const durationSecs = metadata ? metadata.frameCount / metadata.fps : null;

  return (
    <>
      <Header currentStep="detect" />

      <main className="relative z-10 flex-1 flex flex-col max-w-6xl w-full mx-auto px-6 py-8">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="flex-1 flex flex-col gap-4">
          <div className="grid lg:grid-cols-2 gap-4 min-h-0 lg:max-h-[70vh]">
            {/* Left: video player */}
            <Bentobox className="flex flex-col min-h-0">
              <div className="relative flex-1 flex items-center p-3 min-h-0">
                <video
                  src={videoUrl}
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

          {/* Bottom: Video Details */}
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
                <span className="text-sm text-white font-semibold">—</span>
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
      </main>
    </>
  );
}
