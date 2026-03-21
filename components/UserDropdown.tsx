'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Video, Settings, LogOut, LogIn } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const userIntegration = process.env.NEXT_PUBLIC_USER_INTEGRATION === '1';

export function UserDropdown() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/');
  }

  if (!userIntegration) return null;

  const initials = user?.email?.[0].toUpperCase() ?? '?';
  const username = user?.user_metadata?.username as string | undefined;

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
      >
        Login
        <LogIn className="w-3.5 h-3.5" />
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
      >
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {initials}
        </div>
        {username && (
          <span className="max-w-[96px] truncate text-sm text-white">{username}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#0e1a2b]/95 backdrop-blur-md shadow-xl overflow-hidden z-50">
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
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
