import Link from 'next/link';
import { Upload } from 'lucide-react';

interface HeroContentProps {
  headline?: React.ReactNode;
  subtext?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  stats?: string[];
}

export function HeroContent({
  headline = (<>Blur faces.<br /><em style={{ color: 'var(--primary)' }}>Keep control.</em></>),
  subtext = ' AI-powered face detection and selective blurring built with OpenCV. Protect privacy, and maintain anonymity with secure processing on AWS EC2 via HTTPS.',
  primaryLabel = 'Start Blurring',
  primaryHref = '/upload',
  secondaryLabel = 'See how it works',
  secondaryHref = '/#how-it-works',
  stats = ['No install required', 'Runs in browser', 'Free & open source'],
}: HeroContentProps) {
  return (
    <div style={{ maxWidth: 760, width: '100%', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(56px, 9vw, 104px)', lineHeight: 0.95, letterSpacing: '-0.03em', color: 'var(--foreground)', marginBottom: 32 }}>
        {headline}
      </h1>

      <p style={{ fontSize: 16, color: 'var(--muted-foreground)', maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.75, fontWeight: 300 }}>
        {subtext}
      </p>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 52 }}>
        <Link href={primaryHref} className="cta-primary">
          <Upload style={{ width: 15, height: 15 }} />
          {primaryLabel}
        </Link>
        <a href={secondaryHref} className="cta-secondary">{secondaryLabel}</a>
      </div>

      <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
        {stats.map(s => (
          <span key={s} style={{ fontSize: 12, color: 'var(--subtle)', letterSpacing: '0.04em' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', marginRight: 7, verticalAlign: 'middle' }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}