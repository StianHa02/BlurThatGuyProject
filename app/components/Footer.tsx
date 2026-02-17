// Convert Footer to a client component so we can reveal the "Created by" link on scroll
'use client';

import { EyeOff, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Footer() {
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowCreator(window.scrollY > 0);
    };

    // Check initial position (in case page isn't at top)
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <footer className="py-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <EyeOff className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-zinc-500">BlurThatGuy</span>
          </Link>
          <p className="text-sm text-zinc-500">
            Built with privacy in mind. Face detection powered by YuNet.
          </p>
        </div>

        <div className="flex justify-center pt-4">
          <a
            href="https://stianha.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-linear-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/40 text-sm font-medium transform transition-transform ${showCreator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
          >
            <span>Created by</span>
            <span className="font-semibold">Stian Gia Huy Ha</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}