import { EyeOff } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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
    </footer>
  );
}
