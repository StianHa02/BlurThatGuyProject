'use client';

import { Eye } from 'lucide-react';

interface NavbarProps {
  portfolioUrl?: string;
  portfolioLabel?: string;
}

export function Navbar({ portfolioUrl = 'https://stianha.com', portfolioLabel = 'View My Portfolio ↗' }: NavbarProps) {
  return (
    <nav style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '28px 48px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 3, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Eye style={{ width: 14, height: 14, color: 'var(--background)' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--foreground)' }}>BlurThatGuy</span>
      </div>
      <a
        href={portfolioUrl} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 13, color: 'var(--muted-foreground)', textDecoration: 'none', borderBottom: '1px solid rgba(138,158,142,0.3)', paddingBottom: 2, transition: 'color 0.2s' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}
      >
        {portfolioLabel}
      </a>
    </nav>
  );
}