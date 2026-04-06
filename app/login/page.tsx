/* Login page. Authenticates users via email and password using Supabase. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {LogIn, Mail, Lock, ArrowLeft} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs, Logo, Alert } from '@/components';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        router.push('/');
    }

    return (
        <div className="page-bg overflow-hidden flex items-center justify-center px-6">
            <BackgroundBlobs />

            <div className="relative z-10 w-full max-w-md">
                {/* Header */ }
                <div className="flex items-center gap-3 mb-10">
                    <Link href="/" className="btn btn-ghost btn-icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <Logo />
                    <span className="font-bold text-lg text-white tracking-tight">/ Login</span>
                </div>

                <div className="card-glass p-8">
                    <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
                    <p className="text-slate-400 text-sm mb-8">Sign in to your account to continue</p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="block text-sm font-medium text-slate-300">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="email" type="email" autoComplete="email" required
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="password" type="password" autoComplete="current-password" required
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>

                        {error && <Alert variant="error" message={error} onDismiss={() => setError(null)} />}

                        <button type="submit" disabled={loading} className="btn btn-primary w-full">
                            {loading ? <span className="spinner" /> : <LogIn className="w-4 h-4" />}
                            {loading ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-sm text-slate-500 mt-6">
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">Sign up</Link>
                </p>
                <p className="text-center text-sm mt-3">
                    <Link href="/" className="text-slate-600 hover:text-slate-400 transition-colors">← Back to home</Link>
                </p>
            </div>
        </div>
    );
}
