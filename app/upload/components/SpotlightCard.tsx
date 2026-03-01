'use client';

import { useRef, useState, useCallback } from 'react';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  color?: 'blue' | 'indigo' | 'violet';
}

const colorMap = {
  blue: {
    spotlight: 'rgba(59,130,246,0.12)',
    shimmer: 'via-blue-400/60',
    corner: 'from-blue-400/50',
    border: 'hover:border-blue-500/30',
  },
  indigo: {
    spotlight: 'rgba(99,102,241,0.12)',
    shimmer: 'via-indigo-400/60',
    corner: 'from-indigo-400/50',
    border: 'hover:border-indigo-500/30',
  },
  violet: {
    spotlight: 'rgba(139,92,246,0.12)',
    shimmer: 'via-violet-400/60',
    corner: 'from-violet-400/50',
    border: 'hover:border-violet-500/30',
  },
};

export function SpotlightCard({ children, className = '', color = 'blue' }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 0, y: 0, opacity: 0 });
  const c = colorMap[color];

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const box = ref.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setSpot({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 });
  }, []);

  const onLeave = useCallback(() => setSpot(p => ({ ...p, opacity: 0 })), []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`group relative rounded-2xl bg-[#0d1b2e]/80 border border-white/8 shadow-sm overflow-hidden transition-all duration-300 ${c.border} hover:shadow-xl hover:shadow-black/40 ${className}`}
    >
      {/* Mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: spot.opacity,
          background: `radial-gradient(400px circle at ${spot.x}px ${spot.y}px, ${c.spotlight}, transparent 70%)`,
        }}
      />
      {/* Top shimmer */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${c.shimmer} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      {/* Corner accent */}
      <div className="pointer-events-none absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl">
        <div className={`absolute top-0 right-0 w-px h-8 bg-gradient-to-b ${c.corner} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <div className={`absolute top-0 right-0 h-px w-8 bg-gradient-to-l ${c.corner} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      </div>
      {children}
    </div>
  );
}
