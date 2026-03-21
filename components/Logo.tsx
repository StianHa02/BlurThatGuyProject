'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md';
  href?: string;
  className?: string;
}

export function Logo({ size = 'md', href = '/', className = '' }: LogoProps) {
  if (size === 'sm') {
    // Footer variant: smaller icon, muted text
    return (
      <Link href={href} className={`flex items-center gap-2 ${className}`}>
        <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center shadow-sm shadow-blue-500/30 shrink-0">
          <EyeOff className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm text-slate-500">BlurThatGuy</span>
      </Link>
    );
  }

  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
        <EyeOff className="w-4 h-4 text-white" />
      </div>
      <span className="font-bold text-lg text-white tracking-tight">BlurThatGuy</span>
    </Link>
  );
}
