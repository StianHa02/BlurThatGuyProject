import Link from 'next/link';
import { Shield, Zap, Upload, Download, MousePointerClick, Lock, Gauge, Eye } from 'lucide-react';
import { Navbar, FeatureCard, Footer, CTASection } from './components';

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

const BENEFITS = [
  {
    icon: Lock,
    title: 'Privacy First',
    description: 'All processing happens on your machine. Videos never leave your device.',
  },
  {
    icon: Gauge,
    title: 'Lightning Fast',
    description: 'Batch processing technology analyzes 50 frames at once for maximum speed.',
  },
  {
    icon: Eye,
    title: 'Selective Blurring',
    description: 'Choose exactly which faces to blur. Full control over your content.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-grid">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <Navbar />

        <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8 backdrop-blur-sm">
              <Shield className="w-4 h-4" />
              Privacy-First Video Processing
            </div>

            {/* Hero Headline */}
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
              <span className="gradient-text">Blur faces</span> in your videos
              <br />
              <span className="text-white">with one click</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              AI-powered face detection and selective blurring.
              Protect privacy, comply with regulations, and maintain anonymity
              in your video content — all processed locally.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/upload"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
              >
                <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Start Blurring
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-all font-medium backdrop-blur-sm"
              >
                Learn More
              </a>
            </div>

            {/* Social Proof / Quick Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                No installation required
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Works in your browser
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                100% free & open source
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Benefits Section - New! */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={benefit.title}
                  className="group p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all hover:bg-zinc-900/80"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How it works</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
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

      <CTASection
        icon={Zap}
        title="Ready to protect privacy?"
        description="Start anonymizing faces in your videos today. No account or installation needed."
        buttonText="Upload Your First Video"
        buttonIcon={Upload}
        buttonHref="/upload"
      />

      <Footer />
    </div>
  );
}