import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, step, title, description }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <span className="step-ghost">{step}</span>
      <div style={{
        width: 38, height: 38, borderRadius: 3,
        border: '1px solid rgba(200,245,90,0.2)',
        background: 'rgba(200,245,90,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <Icon style={{ width: 16, height: 16, color: 'var(--primary)' }} />
      </div>
      <div className="section-label" style={{ marginBottom: 10 }}>Step {step}</div>
      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--foreground)', marginBottom: 10, letterSpacing: '-0.01em' }}>
        {title}
      </h3>
      <p style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: 1.75, fontWeight: 300 }}>
        {description}
      </p>
    </div>
  );
}