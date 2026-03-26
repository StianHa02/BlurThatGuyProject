"use client";

import { LucideIcon } from 'lucide-react';
import React, { useRef, useState } from 'react';

interface FeatureCardProps {
  icon: LucideIcon;
  step: number;
  title: string;
  description: string;
  color: 'blue' | 'teal' | 'green';
}

const colorClasses = {
  blue: {
    spotlight: 'rgba(59,130,246,0.12)',
    glow: 'rgba(96,165,250,0.9)',
    base: 'rgba(255,255,255,0.08)',
    iconBg: 'bg-blue-500/15',
    iconText: 'text-blue-400',
    stepText: 'text-blue-400',
  },
  teal: {
    spotlight: 'rgba(20,184,166,0.12)',
    glow: 'rgba(45,212,191,0.9)',
    base: 'rgba(255,255,255,0.08)',
    iconBg: 'bg-teal-500/15',
    iconText: 'text-teal-400',
    stepText: 'text-teal-400',
  },
  green: {
    spotlight: 'rgba(34,197,94,0.12)',
    glow: 'rgba(74,222,128,0.9)',
    base: 'rgba(255,255,255,0.08)',
    iconBg: 'bg-green-500/15',
    iconText: 'text-green-400',
    stepText: 'text-green-400',
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

  const borderBg = spotlight.opacity
    ? `radial-gradient(250px circle at ${spotlight.x}px ${spotlight.y}px, ${colors.glow}, ${colors.base} 60%)`
    : colors.base;

  return (
    <div
      ref={boxRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group relative rounded-2xl p-px flex flex-col shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40"
      style={{ background: borderBg }}
    >
      <div className="relative flex-1 rounded-[calc(1rem-1px)] p-5 bg-[#0d1b2e]/80 overflow-hidden">

        {/* Interior spotlight */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: spotlight.opacity,
            background: `radial-gradient(350px circle at ${spotlight.x}px ${spotlight.y}px, ${colors.spotlight}, transparent 70%)`,
          }}
        />

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
    </div>
  );
}