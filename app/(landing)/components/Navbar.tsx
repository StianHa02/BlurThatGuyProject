'use client';

import { EyeOff, ExternalLink } from 'lucide-react';

export function Navbar() {
    return (
        <nav className="absolute top-0 left-0 w-full z-20 flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <EyeOff className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg text-white tracking-tight">
                    BlurThatGuy
                </span>
            </div>

            <a
                href="https://stianha.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
            >
                View My Portfolio
                <ExternalLink className="w-3.5 h-3.5" />
            </a>
        </nav>
    );
}