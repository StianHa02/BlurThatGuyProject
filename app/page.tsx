import Link from 'next/link';
import { Shield, Zap, Upload, Download, MousePointerClick } from 'lucide-react';
import { Navbar, FeatureCard, StatsGrid, Footer, CTASection } from './components';

const FEATURES = [
  {
    icon: Upload,
    step: 1,
    title: 'Upload Video',
    description: 'Drag and drop or select your MP4 video file. Processing happens locally for privacy.',
    color: 'indigo' as const,
  },
  {
    icon: MousePointerClick,
    step: 2,
    title: 'Select Faces',
    description: 'AI automatically detects all faces. Click on any face to toggle blur on or off.',
    color: 'purple' as const,
  },
  {
    icon: Download,
    step: 3,
    title: 'Export',
    description: 'Download your processed video with faces permanently blurred.',
    color: 'pink' as const,
  },
];

const STATS = [
  { value: '100%', label: 'Local Processing' },
  { value: 'AI', label: 'Powered Detection' },
  { value: 'Fast', label: 'Processing Speed' },
  { value: 'Free', label: 'Open Source' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-grid">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />

        <Navbar />

        <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm mb-8">
              <Shield className="w-4 h-4" />
              Privacy-First Video Processing
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">Blur faces</span> in your videos
              <br />with one click
            </h1>

            <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto">
              AI-powered face detection and selective blurring.
              Protect privacy, comply with regulations, and maintain anonymity
              in your video content.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/upload"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all font-semibold text-white glow-indigo"
              >
                <Upload className="w-5 h-5" />
                Start Blurring
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 transition-all font-medium"
              >
                Learn More
              </a>
            </div>
          </div>
        </main>
      </div>

      {/* Features Section */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Three simple steps to anonymize faces in your videos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.step} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <StatsGrid stats={STATS} />

      <CTASection
        icon={Zap}
        title="Ready to protect privacy?"
        description="Start anonymizing faces in your videos today. No account needed."
        buttonText="Upload Your First Video"
        buttonIcon={Upload}
        buttonHref="/upload"
      />

      <Footer />
    </div>
  );
}
