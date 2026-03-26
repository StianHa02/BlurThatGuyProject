'use client';

import { useState } from 'react';
import Link from 'next/link';
import {UserPlus, Mail, Lock, User, CheckCircle, ArrowLeft} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs, Logo, Alert } from '@/components';

export default function SignupPage() {
    const [username, setUsername]               = useState('');
    const [email, setEmail]                     = useState('');
    const [password, setPassword]               = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError]                     = useState<string | null>(null);
    const [success, setSuccess]                 = useState(false);
    const [loading, setLoading]                 = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        setLoading(true);

        // Check if email already in use
        try {
            const normalizedEmail = email.trim().toLowerCase();
            const checkRes = await fetch('/api/auth/check-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail }),
            });
            const { exists, error: checkError } = await checkRes.json();
            if (checkError) {
                console.error('Check email error:', checkError);
            } else if (exists) {
                setError('Email is already in use.');
                setLoading(false);
                return;
            }
        } catch (err) {
            console.error('Failed to check email:', err);
        }

        const supabase = createClient();
        const { error } = await supabase.auth.signUp({
            email, password, options: { data: { username } },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        setSuccess(true);
        setLoading(false);
    }

    return (
        <div className="page-bg overflow-hidden flex items-center justify-center px-6">
            <BackgroundBlobs />

            <div className="relative z-10 w-full max-w-md">
                {/* Header */}
                <div className="flex items-center gap-3 mb-10">
                    <Link href="/" className="btn btn-ghost btn-icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <Logo />
                    <span className="font-bold text-lg text-white tracking-tight">/ Settings</span>
                </div>

                <div className="card-glass p-8">
                    {success ? (
                        <div className="text-center py-4">
                            <div className="flex justify-center mb-4">
                                <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-6 h-6 text-green-400" />
                                </div>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
                            <p className="text-slate-400 text-sm">
                                We sent a confirmation link to <span className="text-white">{email}</span>.
                                Click it to activate your account.
                            </p>
                            <Link href="/login" className="inline-block mt-6 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                                Back to sign in →
                            </Link>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold text-white mb-1">Create an account</h1>
                            <p className="text-slate-400 text-sm mb-8">Sign up to get started with BlurThatGuy</p>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label htmlFor="username" className="block text-sm font-medium text-slate-300">Username</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                        <input
                                            id="username" type="text" autoComplete="off" required
                                            value={username} onChange={(e) => setUsername(e.target.value)}
                                            placeholder="yourname"
                                            className="input-field pl-10"
                                        />
                                    </div>
                                </div>

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
                                            id="password" type="password" autoComplete="new-password" required
                                            value={password} onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="input-field pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">Confirm password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                        <input
                                            id="confirmPassword" type="password" autoComplete="new-password" required
                                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="input-field pl-10"
                                        />
                                    </div>
                                </div>

                                {error && <Alert variant="error" message={error} onDismiss={() => setError(null)} />}

                                <button type="submit" disabled={loading} className="btn btn-primary w-full">
                                    {loading ? <span className="spinner" /> : <UserPlus className="w-4 h-4" />}
                                    {loading ? 'Creating account…' : 'Create account'}
                                </button>
                            </form>

                            <p className="text-center text-sm text-slate-500 mt-6">
                                Already have an account?{' '}
                                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">Sign in</Link>
                            </p>
                        </>
                    )}
                </div>

                <p className="text-center text-sm mt-6">
                    <Link href="/" className="text-slate-500 hover:text-slate-300 transition-colors">← Back to home</Link>
                </p>
            </div>
        </div>
    );
}
