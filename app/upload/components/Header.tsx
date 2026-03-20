'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, EyeOff, CheckCircle, ChevronDown, Video, Settings, LogOut, LogIn } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Step = 'upload' | 'detect' | 'select';

interface HeaderProps {
  currentStep: Step;
  onUploadNew?: () => void;
}

const STEPS: Step[] = ['upload', 'detect', 'select'];
const userIntegration = process.env.NEXT_PUBLIC_USER_INTEGRATION === '1';

export function Header({ currentStep }: HeaderProps) {
  const router = useRouter();
  const currentIndex = STEPS.indexOf(currentStep);
  const shouldReduceMotion = useReducedMotion();

  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userIntegration) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/');
  }

  const initials = user?.email?.[0].toUpperCase() ?? '?';
  const username = user?.user_metadata?.username as string | undefined;

  return (
    <header className="border-b border-white/8 bg-[#070f1c]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">

        {/* Home link */}
        <Link
          href="/"
          className="group flex items-center gap-3 px-3 py-2 -mx-3 -my-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 border border-transparent hover:border-white/10 transition-all"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/40">
              <EyeOff className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold">BlurThatGuy</span>
          </div>
          <span className="text-xs text-slate-600 group-hover:text-slate-400 hidden sm:inline ml-1">Home</span>
        </Link>

        {/* Step indicators */}
        <LayoutGroup>
          <div className="hidden sm:flex items-center gap-1 flex-1 justify-center min-w-0">
            {STEPS.map((step, i) => {
              const isCurrent = currentStep === step;
              const isComplete = i < currentIndex;
              const isPending = i > currentIndex;
              const bothConnectedComplete = i + 1 < currentIndex;
              const connectsToCurrent = isComplete && i + 1 === currentIndex;

              return (
                <div key={step} className="flex items-center">
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? { opacity: 1 }
                        : { opacity: isPending ? 0.9 : 1 }
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.2, ease: 'easeInOut' }
                    }
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
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { duration: 0.24, ease: 'easeInOut' }
                        }
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
                          bothConnectedComplete
                            ? 'bg-emerald-500'
                            : connectsToCurrent
                              ? 'bg-blue-600'
                              : 'bg-slate-600'
                        }`}
                        animate={shouldReduceMotion ? { scaleX: isComplete ? 1 : 0 } : { scaleX: isComplete ? 1 : 0 }}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { duration: 0.22, ease: 'easeInOut' }
                        }
                        style={{ transformOrigin: 'left center' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Right side: user button or login */}
        <div className="w-40 shrink-0 flex justify-end">
          {userIntegration && (
            user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {initials}
                  </div>
                  {username && (
                    <span className="max-w-[80px] truncate text-sm text-white">{username}</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#0e1a2b]/95 backdrop-blur-md shadow-xl overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-white/8">
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                    <div className="p-1">
                      <Link
                        href="/my-videos"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/8 transition-all"
                      >
                        <Video className="w-4 h-4" />
                        My Videos
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/8 transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    </div>
                    <div className="p-1 border-t border-white/8">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                Login
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
