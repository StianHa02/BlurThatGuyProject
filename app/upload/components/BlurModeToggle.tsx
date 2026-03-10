'use client';

import { Grid2x2, Square } from 'lucide-react';

export type BlurMode = 'pixelate' | 'blackout';

interface BlurModeToggleProps {
  value: BlurMode;
  onChange: (mode: BlurMode) => void;
}

const OPTIONS: { mode: BlurMode; label: string; Icon: typeof Grid2x2 }[] = [
  { mode: 'pixelate', label: 'Pixelate', Icon: Grid2x2 },
  { mode: 'blackout', label: 'Blackout', Icon: Square },
];

export function BlurModeToggle({ value, onChange }: BlurModeToggleProps) {
  return (
    <div className="flex items-center rounded-xl border border-white/10 overflow-hidden text-xs sm:text-sm shrink-0">
      {OPTIONS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            value === mode
              ? 'bg-blue-600 text-white'
              : 'bg-white/5 hover:bg-white/10 text-slate-400'
          }`}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
