'use client';

import { EyeOff, ExternalLink } from 'lucide-react';

export function Navbar() {
    return (
        <nav className="absolute top-0 left-0 w-full z-20 flex items-center justify-between px-6 py-6">

            {/* LEFT SIDE — NOT CLICKABLE */}
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <EyeOff className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-lg text-white">
          BlurThatGuy
        </span>
            </div>

            {/* RIGHT SIDE — CLICKABLE */}
            <a
                href="https://stianha.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
            >
                View My Portfolio
                <ExternalLink className="w-3.5 h-3.5" />
            </a>

        </nav>
    );
}

