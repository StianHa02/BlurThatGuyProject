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
    spotlight: 'rgba(99,102,241,0.08)',
    shimmer: 'via-indigo-400/50',
    corner: 'from-indigo-500/40',
    iconBg: 'bg-indigo-500/10',
    iconText: 'text-indigo-400',
    stepText: 'text-indigo-400',
  },
  purple: {
    spotlight: 'rgba(168,85,247,0.08)',
    shimmer: 'via-purple-400/50',
    corner: 'from-purple-500/40',
    iconBg: 'bg-purple-500/10',
    iconText: 'text-purple-400',
    stepText: 'text-purple-400',
  },
  pink: {
    spotlight: 'rgba(236,72,153,0.08)',
    shimmer: 'via-pink-400/50',
    corner: 'from-pink-500/40',
    iconBg: 'bg-pink-500/10',
    iconText: 'text-pink-400',
    stepText: 'text-pink-400',
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
      className="group relative rounded-2xl p-5 bg-zinc-950 border border-white/10 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/20 hover:shadow-xl hover:shadow-black/40 overflow-hidden"
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

      <p className="relative text-zinc-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

