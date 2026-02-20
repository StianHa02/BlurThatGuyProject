'use client';

import { Loader2 } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  status: string;
  hint?: string;
}

export function ProgressBar({ progress, status, hint }: ProgressBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Loader2 style={{ width: 18, height: 18, color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: 'var(--foreground)' }}>{status}</span>
      </div>
      <div style={{ position: 'relative', height: 3, background: 'var(--muted)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          className="progress-shine"
          style={{
            position: 'absolute', inset: '0 auto 0 0',
            background: 'var(--primary)',
            borderRadius: 999,
            transition: 'width 0.3s',
            width: `${progress}%`,
          }}
        />
      </div>
      {hint && <p style={{ fontSize: 12, color: 'var(--subtle)' }}>{hint}</p>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}