'use client';

import { Upload, Download, MousePointerClick, Lock, Gauge, Eye } from 'lucide-react';
import { Navbar, FeatureCard, Footer, HeroContent } from './components';
import { useEffect, useState } from 'react';

const FEATURES = [
  { icon: Upload,            step: '01', title: 'Upload Video',     description: 'Drag and drop or select your MP4 video file.' },
  { icon: MousePointerClick, step: '02', title: 'Select Faces',     description: 'AI automatically detects all faces. Click on any face to toggle blur on or off.' },
  { icon: Download,          step: '03', title: 'Export',           description: 'Download your processed video with faces permanently blurred.' },
];

const BENEFITS = [
  { icon: Lock,  title: 'Privacy First',      description: 'Processed securely on our servers via encrypted HTTPS. Your footage is never shared with third-party AI services.' },
  { icon: Gauge, title: 'Lightning Fast',     description: 'Batch processing technology analyzes 200 frames at once for maximum speed.' },
  { icon: Eye,   title: 'Selective Blurring', description: 'Choose exactly which faces to blur. Full control over your content.' },
];

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ background: 'var(--background)', fontFamily: 'var(--font-sans)' }}>

      {/* ───── HERO ───── */}
      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="hero-grain" />
        <Navbar />

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, padding: '120px 48px 60px' }}>
          <HeroContent />
        </main>

        <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'center', paddingBottom: 36, opacity: scrolled ? 0 : 1, transition: 'opacity 0.5s', pointerEvents: scrolled ? 'none' : 'auto' }}>
          <a href="/#how-it-works" className="scroll-indicator">
            <span style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--subtle)', textTransform: 'uppercase' }}>Scroll</span>
            <div className="scroll-line" />
          </a>
        </div>
      </div>

      {/* ───── HOW IT WORKS ───── */}
      <section id="how-it-works" style={{ minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', padding: '80px 48px 120px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>

          <div style={{ marginBottom: 52 }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 5vw, 60px)', color: 'var(--foreground)', marginTop: 10, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
              How it works
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 3, marginBottom: 64 }}>
            {FEATURES.map(f => (
              <FeatureCard key={f.step} icon={f.icon} step={f.step} title={f.title} description={f.description} />
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 48 }}>
            <div className="section-label" style={{ marginBottom: 24 }}>Why BlurThatGuy</div>
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="benefit-row">
                <div className="benefit-icon">
                  <Icon style={{ width: 15, height: 15, color: 'var(--primary)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--foreground)', marginBottom: 5, fontSize: 15 }}>{title}</div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: 1.7, fontWeight: 300 }}>{description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Footer />
      </section>
    </div>
  );
}