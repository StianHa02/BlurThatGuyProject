'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EyeOff, ExternalLink, LogIn, User, Video, Settings, LogOut, ChevronDown } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const userIntegration = process.env.NEXT_PUBLIC_USER_INTEGRATION === '1';

export function Navbar() {
    const router = useRouter();
    const [user, setUser] = useState<SupabaseUser | null>(null);
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
        <nav className="absolute top-0 left-0 w-full z-20 flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <EyeOff className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg text-white tracking-tight">
                    BlurThatGuy
                </span>
            </div>

            {userIntegration ? (
                user ? (
                    /* ── User dropdown ── */
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setOpen((o) => !o)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all"
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
                    /* ── Login button ── */
                    <Link
                        href="/login"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
                    >
                        Login
                        <LogIn className="w-3.5 h-3.5" />
                    </Link>
                )
            ) : (
                /* ── Portfolio link (integration off) ── */
                <a
                    href="https://stianha.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
                >
                    View My Portfolio
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            )}
        </nav>
    );
}
