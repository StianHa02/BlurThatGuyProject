'use client';

import { EyeOff, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="py-6 px-6 mt-12 border-t border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:flex-wrap items-center sm:justify-between gap-3 text-center sm:text-left">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <EyeOff className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm text-zinc-500">BlurThatGuy</span>
        </Link>

        <p className="text-sm text-zinc-500">
          Built with privacy in mind. Face detection powered by YuNet.
        </p>

        <a
          href="https://stianha.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 text-sm font-medium transition-colors"
        >
          <span>Created by</span>
          <span className="font-semibold">Stian Gia Huy Ha</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </footer>
  );
}

