"use client";

import { LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';

interface FeatureCardProps {
  icon: LucideIcon;
  step: number;
  title: string;
  description: string;
  color: 'indigo' | 'purple' | 'pink';
}

const colorClasses = {
  indigo: {
    spotlight: 'rgba(59,130,246,0.10)',
    shimmer: 'via-blue-400/60',
    corner: 'from-blue-400/50',
    iconBg: 'bg-blue-500/15',
    iconText: 'text-blue-400',
    stepText: 'text-blue-400',
    border: 'hover:border-blue-500/40',
  },
  purple: {
    spotlight: 'rgba(99,102,241,0.10)',
    shimmer: 'via-indigo-400/60',
    corner: 'from-indigo-400/50',
    iconBg: 'bg-indigo-500/15',
    iconText: 'text-indigo-400',
    stepText: 'text-indigo-400',
    border: 'hover:border-indigo-500/40',
  },
  pink: {
    spotlight: 'rgba(139,92,246,0.10)',
    shimmer: 'via-violet-400/60',
    corner: 'from-violet-400/50',
    iconBg: 'bg-violet-500/15',
    iconText: 'text-violet-400',
    stepText: 'text-violet-400',
    border: 'hover:border-violet-500/40',
  },
};

export function FeatureCard({ icon: Icon, step, title, description, color }: FeatureCardProps) {
  const colors = colorClasses[color];
  const boxRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setSpotlight((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      ref={boxRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative rounded-2xl p-5 bg-[#0d1b2e]/80 border border-white/8 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 ${colors.border} hover:shadow-xl hover:shadow-black/40 overflow-hidden`}
    >
      {/* Mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: spotlight.opacity,
          background: `radial-gradient(350px circle at ${spotlight.x}px ${spotlight.y}px, ${colors.spotlight}, transparent 70%)`,
        }}
      />

      {/* Top shimmer */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${colors.shimmer} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Corner accent */}
      <div className="pointer-events-none absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl">
        <div className={`absolute top-0 right-0 w-px h-8 bg-gradient-to-b ${colors.corner} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <div className={`absolute top-0 right-0 h-px w-8 bg-gradient-to-l ${colors.corner} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      </div>

      {/* Content */}
      <div className="relative flex items-center justify-between gap-3 mb-3">
        <div>
          <div className={`text-xs ${colors.stepText} font-semibold tracking-widest uppercase mb-0.5`}>Step {step}</div>
          <h3 className="text-base font-semibold leading-tight text-white">{title}</h3>
        </div>
        <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110`}>
          <Icon className={`w-5 h-5 ${colors.iconText}`} />
        </div>
      </div>

      <p className="relative text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}