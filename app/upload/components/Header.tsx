'use client';

import Link from 'next/link';
import { ArrowLeft, EyeOff, CheckCircle, Settings } from 'lucide-react';

type Step = 'upload' | 'detect' | 'select';

interface HeaderProps {
  currentStep: Step;
  onSettingsClick: () => void;
}

const STEPS: Step[] = ['upload', 'detect', 'select'];

export function Header({ currentStep, onSettingsClick }: HeaderProps) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <EyeOff className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold">BlurThatGuy</span>
          </div>
        </Link>

        {/* Step indicators */}
        <div className="hidden sm:flex items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                currentStep === step
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : i < currentIndex
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
                {i < currentIndex ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
                    {i + 1}
                  </span>
                )}
                <span className="capitalize">{step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 ${i < currentIndex ? 'bg-green-500/50' : 'bg-zinc-700'}`} />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onSettingsClick}
          className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
