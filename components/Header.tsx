/* Sticky top header for the upload flow. Shows the logo with a home link, animated step indicator pills, and the user dropdown. */
'use client';

import Link from 'next/link';
import { ArrowLeft, CheckCircle, EyeOff } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { UserDropdown } from './UserDropdown';

type Step = 'upload' | 'detect' | 'select';

interface HeaderProps {
  currentStep?: Step;
  onUploadNew?: () => void;
}

const STEPS: Step[] = ['upload', 'detect', 'select'];

export function Header({ currentStep }: HeaderProps) {
  const currentIndex      = currentStep ? STEPS.indexOf(currentStep) : -1;
  const shouldReduceMotion = useReducedMotion();

  return (
    <header className="border-b border-white/8 bg-[#070f1c]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between gap-4">

        {/* Home link */}
        <Link
          href="/"
          className="group flex items-center gap-3 px-3 py-2 -mx-3 -my-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 border border-transparent hover:border-white/10 transition-all"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
              <EyeOff className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">BlurThatGuy</span>
          </div>
          <span className="text-xs text-slate-600 group-hover:text-slate-400 hidden sm:inline ml-1">Home</span>
        </Link>

        {/* Step indicators */}
        <LayoutGroup>
          <div className={`${currentStep ? 'hidden sm:flex' : 'hidden'} items-center gap-1 flex-1 justify-center min-w-0`}>
            {STEPS.map((step, i) => {
              const isCurrent           = currentStep === step;
              const isComplete          = i < currentIndex;
              const isPending           = i > currentIndex;
              const bothConnectedComplete = i + 1 < currentIndex;
              const connectsToCurrent   = isComplete && i + 1 === currentIndex;

              return (
                <div key={step} className="flex items-center">
                  <motion.div
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: isPending ? 0.9 : 1 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
                    className={`relative isolate overflow-hidden flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      isCurrent
                        ? 'text-white border-blue-400/70 shadow-lg shadow-blue-600/30'
                        : isComplete
                          ? 'bg-emerald-600 text-white border-emerald-400/70'
                          : 'bg-slate-800 text-slate-200 border-slate-600/70'
                    }`}
                  >
                    {isCurrent && (
                      <motion.span
                        layoutId="active-step-pill"
                        className="absolute inset-0 rounded-xl bg-blue-600"
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeInOut' }}
                      />
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                      {isComplete ? (
                        <motion.span
                          key="done"
                          initial={shouldReduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.14 }}
                          className="relative z-10"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="index"
                          initial={shouldReduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.14 }}
                          className="relative z-10 w-5 h-5 rounded-full bg-black/25 flex items-center justify-center text-[11px]"
                        >
                          {i + 1}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <span className="relative z-10 capitalize tracking-wide">{step}</span>
                  </motion.div>

                  {i < STEPS.length - 1 && (
                    <div className="w-10 h-1 mx-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          bothConnectedComplete ? 'bg-emerald-500' : connectsToCurrent ? 'bg-blue-600' : 'bg-slate-600'
                        }`}
                        animate={{ scaleX: isComplete ? 1 : 0 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeInOut' }}
                        style={{ transformOrigin: 'left center' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Right: user dropdown */}
        <div className={`${currentStep ? 'w-40' : ''} shrink-0 flex justify-end`}>
          <UserDropdown />
        </div>

      </div>
    </header>
  );
}
