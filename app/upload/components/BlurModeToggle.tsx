'use client';

import { Grid2x2, Square } from 'lucide-react';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';

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
  const shouldReduceMotion = useReducedMotion();

  return (
    <LayoutGroup>
      <div className="flex w-full sm:w-auto items-center rounded-xl border border-white/10 overflow-hidden text-xs sm:text-sm shrink-0">
        {OPTIONS.map(({ mode, label, Icon }) => {
          const isActive = value === mode;

          return (
            <button
              key={mode}
              onClick={() => onChange(mode)}
              className={`relative isolate flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'text-white'
                  : 'bg-white/5 hover:bg-white/10 text-slate-400'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="blur-mode-active"
                  className="absolute inset-0 bg-blue-600"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                />
              )}
              <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
