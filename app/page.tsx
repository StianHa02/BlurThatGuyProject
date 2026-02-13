import Link from 'next/link';
import { EyeOff, Shield, Zap, Upload, Download, MousePointerClick } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-grid">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />

        <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <EyeOff className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg">BlurThatGuy</span>
          </div>
          <Link
            href="/upload"
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm font-medium"
          >
            Launch App
          </Link>
        </nav>

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
            <div className="glass rounded-2xl p-6 group hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-colors">
                <Upload className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-sm text-indigo-400 font-medium mb-2">Step 1</div>
              <h3 className="text-xl font-semibold mb-2">Upload Video</h3>
              <p className="text-zinc-400 text-sm">
                Drag and drop or select your MP4 video file. Processing happens locally for privacy.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 group hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                <MousePointerClick className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-sm text-purple-400 font-medium mb-2">Step 2</div>
              <h3 className="text-xl font-semibold mb-2">Select Faces</h3>
              <p className="text-zinc-400 text-sm">
                AI automatically detects all faces. Click on any face to toggle blur on or off.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 group hover:border-pink-500/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-4 group-hover:bg-pink-500/20 transition-colors">
                <Download className="w-6 h-6 text-pink-400" />
              </div>
              <div className="text-sm text-pink-400 font-medium mb-2">Step 3</div>
              <h3 className="text-xl font-semibold mb-2">Export</h3>
              <p className="text-zinc-400 text-sm">
                Download your processed video with faces permanently blurred.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats/Trust Section */}
      <section className="py-16 px-6 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold gradient-text">100%</div>
              <div className="text-sm text-zinc-500 mt-1">Local Processing</div>
            </div>
            <div>
              <div className="text-3xl font-bold gradient-text">AI</div>
              <div className="text-sm text-zinc-500 mt-1">Powered Detection</div>
            </div>
            <div>
              <div className="text-3xl font-bold gradient-text">Fast</div>
              <div className="text-sm text-zinc-500 mt-1">Processing Speed</div>
            </div>
            <div>
              <div className="text-3xl font-bold gradient-text">Free</div>
              <div className="text-sm text-zinc-500 mt-1">Open Source</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
              <Zap className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
              <h2 className="text-3xl font-bold mb-4">Ready to protect privacy?</h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                Start anonymizing faces in your videos today. No account needed.
              </p>
              <Link
                href="/upload"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all font-semibold text-white glow-indigo"
              >
                <Upload className="w-5 h-5" />
                Upload Your First Video
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <EyeOff className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-zinc-500">BlurThatGuy</span>
          </div>
          <p className="text-sm text-zinc-500">
            Built with privacy in mind. Face detection powered by YuNet.
          </p>
        </div>
      </footer>
    </div>
  );
}
