'use client';

import Link from 'next/link';
import { EyeOff, ExternalLink } from 'lucide-react';

interface NavbarProps {
  ctaText?: string;
  ctaHref?: string;
}

export function Navbar({ ctaText = 'Launch App', ctaHref = '/upload' }: NavbarProps) {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <EyeOff className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-lg">BlurThatGuy</span>
      </Link>
      <div className="flex items-center gap-3">
        <a
          href="https://stianha.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
        >
          My Portfolio
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <Link
          href={ctaHref}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all text-sm font-medium text-white"
        >
          {ctaText}
        </Link>
      </div>
    </nav>
  );
}
