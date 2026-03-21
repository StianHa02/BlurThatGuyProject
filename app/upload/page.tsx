'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components';
import { DropZone, ErrorAlert } from './components';
import { useVideoUpload } from './hooks';

export default function UploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const upload = useVideoUpload();

  async function handleFileSelect(file: File) {
    setUploadingFileName(file.name);
    setUploading(true);
    const result = await upload.handleFile(file);
    setUploading(false);
    if (result) {
      sessionStorage.setItem(`upload:${result.videoId}:metadata`, JSON.stringify(result.metadata));
      sessionStorage.setItem(`upload:${result.videoId}:fileName`, file.name);
      router.push(`/upload/detect?v=${result.videoId}`);
    }
  }

  return (
    <>
      <Header currentStep="upload" />

      <main className="relative z-10 flex-1 flex flex-col max-w-6xl w-full mx-auto px-6 py-8">
        {upload.error && (
          <ErrorAlert message={upload.error} onDismiss={() => upload.setError(null)} />
        )}

        {uploading ? (
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
              <div className="h-full w-1/3 rounded-full bg-blue-500"
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
        ) : (
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
      </main>
    </>
  );
}
