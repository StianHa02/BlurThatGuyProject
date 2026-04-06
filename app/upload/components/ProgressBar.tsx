'use client';

import { Loader2 } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  status: string;
  hint?: string;
}

export function ProgressBar({ progress, status, hint }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        <span className="text-sm text-white">{status}</span>
        <span className="ml-auto text-xs text-slate-400">{pct}%</span>
      </div>
      <div
        className="relative h-2 bg-white/8 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={status}
      >
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-r from-blue-500 to-green-500/15 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}