/* Styled card wrapper used as a layout tile on the upload page. */
'use client';

interface BentoboxProps {
  children: React.ReactNode;
  className?: string;
}

export function Bentobox({ children, className = '' }: BentoboxProps) {
  return (
    <div className={`card shadow-lg ${className}`}>
      {children}
    </div>
  );
}
