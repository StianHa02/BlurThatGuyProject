/* Top navigation bar for the landing page. Shows the logo and either the user dropdown or a portfolio link depending on the user integration flag. */
'use client';

import { ExternalLink } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { UserDropdown } from '@/components/UserDropdown';

const userIntegration = process.env.NEXT_PUBLIC_USER_INTEGRATION === '1';

export function Navbar() {
  return (
    <nav className="absolute top-0 left-0 w-full z-20 flex items-center justify-between px-6 py-5">
      <Logo />

      {userIntegration ? (
        <UserDropdown />
      ) : (
        <a
          href="https://stianha.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
        >
          View My Portfolio
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </nav>
  );
}
