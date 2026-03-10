'use client';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
}

export function Bentobox({ children, className = '' }: SpotlightCardProps) {
  return (
    <div
      className={`relative rounded-2xl bg-[#0d1b2e] border border-white/8 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}