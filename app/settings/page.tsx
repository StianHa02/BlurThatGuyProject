'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EyeOff, Lock, AlertCircle, CheckCircle, Trash2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs } from '@/components';

export default function SettingsPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');

    /* password change */
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwError, setPwError] = useState<string | null>(null);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);

    /* delete account */
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.push('/login');
                return;
            }
            setEmail(data.user.email ?? '');
        });
    }, [router]);

    async function handlePasswordChange(e: React.FormEvent) {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(false);

        if (newPassword !== confirmPassword) {
            setPwError('Passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setPwError('Password must be at least 6 characters.');
            return;
        }

        setPwLoading(true);
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            setPwError(error.message);
        } else {
            setPwSuccess(true);
            setNewPassword('');
            setConfirmPassword('');
        }
        setPwLoading(false);
    }

    async function handleDeleteAccount() {
        setDeleteError(null);
        setDeleteLoading(true);

        const res = await fetch('/api/user/delete', { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) {
            setDeleteError(data.error ?? 'Something went wrong.');
            setDeleteLoading(false);
            return;
        }

        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/');
    }

    return (
        <div className="bg-[#070f1c] text-white min-h-svh px-6 py-12 relative overflow-hidden">
            <BackgroundBlobs />

            <div className="relative z-10 max-w-lg mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-10">
                    <Link href="/" className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <EyeOff className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-lg text-white tracking-tight">Settings</span>
                    </div>
                </div>

                {/* Account info */}
                <div className="glass rounded-2xl p-6 border border-white/8 mb-5">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Account</h2>
                    <p className="text-sm text-slate-400">Signed in as</p>
                    <p className="text-white font-medium mt-0.5">{email}</p>
                </div>

                {/* Change password */}
                <div className="glass rounded-2xl p-6 border border-white/8 mb-5">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Change Password</h2>

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300">
                                New password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="newPassword"
                                    type="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                                Confirm new password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>
                        </div>

                        {pwError && (
                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {pwError}
                            </div>
                        )}

                        {pwSuccess && (
                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                Password updated successfully.
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={pwLoading}
                            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all font-semibold text-sm text-white shadow-lg shadow-blue-600/30"
                        >
                            {pwLoading ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : null}
                            {pwLoading ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                </div>

                {/* Danger zone */}
                <div className="rounded-2xl p-6 border border-red-500/20 bg-red-500/5">
                    <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-1">Danger Zone</h2>
                    <p className="text-sm text-slate-400 mb-5">
                        Permanently delete your account and all associated data. This cannot be undone.
                    </p>

                    {deleteError && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-3">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {deleteError}
                        </div>
                    )}

                    <button
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading}
                        className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all font-semibold text-sm text-white"
                    >
                        {deleteLoading ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        {deleteLoading ? 'Deleting…' : 'Delete my account'}
                    </button>
                </div>
            </div>
        </div>
    );
}
