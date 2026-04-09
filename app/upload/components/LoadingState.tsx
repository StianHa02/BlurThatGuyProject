/* Loading state component used during video upload. */
'use client';
import { Upload } from 'lucide-react';

interface LoadingStateProps {
  title: string;
  description: string;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full gap-6">
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
        <div className="w-6 h-6 text-blue-400 flex items-center justify-center">
          <Upload className="w-6 h-6" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-white font-semibold mb-1">{title}</p>
        <p className="text-slate-500 text-sm truncate max-w-xs">{description}</p>
      </div>
      <div className="w-full h-1 rounded-full bg-white/6 overflow-hidden">
        <div
          className="h-full w-1/3 rounded-full bg-blue-500 animate-[slide_1.4s_ease-in-out_infinite]"
          style={{ animation: 'upload-slide 1.4s ease-in-out infinite' }}
        />
      </div>
    </div>
  );
}
