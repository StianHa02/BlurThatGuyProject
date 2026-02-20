'use client';

import Link from 'next/link';
import { ArrowLeft, EyeOff, CheckCircle, Upload } from 'lucide-react';

type Step = 'upload' | 'detect' | 'select';

interface HeaderProps {
  currentStep: Step;
  onUploadNew?: () => void;
}

const STEPS: Step[] = ['upload', 'detect', 'select'];

export function Header({ currentStep, onUploadNew }: HeaderProps) {
  const currentIndex = STEPS.indexOf(currentStep);
  const showUploadNew = currentStep !== 'upload' && onUploadNew;

  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      background: 'rgba(14,26,19,0.85)',
      backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>

        {/* Home link */}
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--muted-foreground)', textDecoration: 'none',
          padding: '8px 12px', borderRadius: 8,
          border: '1px solid transparent',
          transition: 'all 0.2s',
        }}
          onMouseOver={e => {
            e.currentTarget.style.color = 'var(--foreground)';
            e.currentTarget.style.background = 'rgba(245,240,232,0.05)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.color = 'var(--muted-foreground)';
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EyeOff style={{ width: 14, height: 14, color: 'var(--background)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--foreground)' }}>BlurThatGuy</span>
          </div>
        </Link>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          {STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                transition: 'all 0.2s',
                ...(currentStep === step
                  ? { background: 'rgba(200,245,90,0.1)', color: 'var(--primary)', border: '1px solid rgba(200,245,90,0.3)' }
                  : i < currentIndex
                    ? { background: 'rgba(200,245,90,0.06)', color: 'var(--primary)', border: '1px solid rgba(200,245,90,0.15)', opacity: 0.6 }
                    : { background: 'rgba(245,240,232,0.03)', color: 'var(--subtle)', border: '1px solid var(--border)' }
                ),
              }}>
                {i < currentIndex
                  ? <CheckCircle style={{ width: 12, height: 12 }} />
                  : <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{i + 1}</span>
                }
                <span style={{ textTransform: 'capitalize' }}>{step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 28, height: 1, margin: '0 4px', background: i < currentIndex ? 'rgba(200,245,90,0.3)' : 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Upload new */}
        <div style={{ width: 160, display: 'flex', justifyContent: 'flex-end' }}>
          {showUploadNew && (
            <button onClick={onUploadNew} className="cta-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
              <Upload style={{ width: 14, height: 14 }} />
              New file
            </button>
          )}
        </div>
      </div>
    </header>
  );
}