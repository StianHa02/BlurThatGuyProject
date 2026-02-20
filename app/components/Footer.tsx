'use client';

import { Eye } from 'lucide-react';

interface FooterProps {
  tagline?: string;
  creatorName?: string;
  creatorUrl?: string;
}

export function Footer({
  tagline = 'Built with privacy in mind. Powered by YuNet.',
  creatorName = 'Stian Gia Huy Ha',
  creatorUrl = 'https://stianha.com',
}: FooterProps) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '20px 48px',
      borderTop: '1px solid rgba(245,240,232,0.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 2, background: '#c8f55a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Eye style={{ width: 10, height: 10, color: '#0e1a13' }} />
        </div>
        <span style={{ fontSize: 13, color: '#5a6e5e', fontFamily: "'DM Sans', sans-serif" }}>BlurThatGuy</span>
      </div>
      <span style={{ fontSize: 13, color: '#5a6e5e', fontFamily: "'DM Sans', sans-serif" }}>{tagline}</span>
      <a
        href={creatorUrl} target="_blank" rel="noopener noreferrer"
        style={{
          fontSize: 13, color: '#c8f55a', textDecoration: 'none',
          borderBottom: '1px solid rgba(200,245,90,0.25)', paddingBottom: 1,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {creatorName} ↗
      </a>
    </div>
  );
}