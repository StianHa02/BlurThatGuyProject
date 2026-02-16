import { EyeOff, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="py-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-all text-sm font-medium"
          >
            <span>Created by</span>
            <span className="font-semibold">stianha.com</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}