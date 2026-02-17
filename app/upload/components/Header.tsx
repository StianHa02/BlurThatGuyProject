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
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        {/* Home link — clearly labeled */}
        <Link
          href="/"
          className="group flex items-center gap-3 px-3 py-2 -mx-3 -my-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700 transition-all"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
              <EyeOff className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold">BlurThatGuy</span>
          </div>
          <span className="text-xs text-zinc-500 group-hover:text-zinc-400 hidden sm:inline ml-1">Home</span>
        </Link>

        {/* Step indicators */}
        <div className="hidden sm:flex items-center gap-2 flex-1 justify-center min-w-0">
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

        {/* Upload new file — visible in header when past upload step */}
        <div className="w-40 shrink-0 flex justify-end">
          {showUploadNew ? (
            <button
              type="button"
              onClick={onUploadNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload new file</span>
              <span className="sm:hidden">New file</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
