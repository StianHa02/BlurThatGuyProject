'use client';

import Link from 'next/link';
import { EyeOff } from 'lucide-react';

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
      <Link
        href={ctaHref}
        className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm font-medium"
      >
        {ctaText}
      </Link>
    </nav>
  );
}
