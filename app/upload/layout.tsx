'use client';

import { BackgroundBlobs } from '@/components';

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070f1c] text-white flex flex-col">
      <BackgroundBlobs />
      {children}
    </div>
  );
}
