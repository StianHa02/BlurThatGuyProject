'use client';

import { Loader2 } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  status: string;
  hint?: string;
}

export function ProgressBar({ progress, status, hint }: ProgressBarProps) {
  return (
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
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
