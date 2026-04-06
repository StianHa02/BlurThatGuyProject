/* Account settings page. Allows authenticated users to change their password or permanently delete their account. */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Trash2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs, Logo, Alert } from '@/components';

export default function SettingsPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');

    const [newPassword, setNewPassword]         = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwError, setPwError]                 = useState<string | null>(null);
    const [pwSuccess, setPwSuccess]             = useState(false);
    const [pwLoading, setPwLoading]             = useState(false);

    const [deleteError, setDeleteError]   = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) { router.push('/login'); return; }
            setEmail(data.user.email ?? '');
        });
    }, [router]);

    async function handlePasswordChange(e: React.FormEvent) {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(false);
        if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
        if (newPassword.length < 6) { setPwError('Password must be at least 6 characters.'); return; }
        setPwLoading(true);
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) { setPwError(error.message); } else { setPwSuccess(true); setNewPassword(''); setConfirmPassword(''); }
        setPwLoading(false);
    }

    async function handleDeleteAccount() {
        setDeleteError(null);
        setDeleteLoading(true);
        const res  = await fetch('/api/user/delete', { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { setDeleteError(data.error ?? 'Something went wrong.'); setDeleteLoading(false); return; }
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/');
    }

    return (
        <div className="page-bg overflow-hidden px-6 py-12">
            <BackgroundBlobs />

            <div className="relative z-10 max-w-lg mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-10">
                    <Link href="/" className="btn btn-ghost btn-icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <Logo />
                    <span className="font-bold text-lg text-white tracking-tight">/ Settings</span>
                </div>

                {/* Account info */}
                <div className="card-glass p-6 mb-5">
                    <h2 className="section-label mb-3">Account</h2>
                    <p className="text-sm text-slate-400">Signed in as</p>
                    <p className="text-white font-medium mt-0.5">{email}</p>
                </div>

                {/* Change password */}
                <div className="card-glass p-6 mb-5">
                    <h2 className="section-label mb-5">Change Password</h2>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300">New password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="newPassword" type="password" required
                                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••" className="input-field pl-10"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">Confirm new password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    id="confirmPassword" type="password" required
                                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••" className="input-field pl-10"
                                />
                            </div>
                        </div>

                        {pwError   && <Alert variant="error"   message={pwError}                      onDismiss={() => setPwError(null)} />}
                        {pwSuccess && <Alert variant="success" message="Password updated successfully." />}

                        <button type="submit" disabled={pwLoading} className="btn btn-primary w-full">
                            {pwLoading && <span className="spinner" />}
                            {pwLoading ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                </div>

                {/* Danger zone */}
                <div className="rounded-2xl p-6 border border-red-500/20 bg-red-500/5">
                    <h2 className="section-label text-red-400 mb-1">Danger Zone</h2>
                    <p className="text-sm text-slate-400 mb-5">
                        Permanently delete your account and all associated data. This cannot be undone.
                    </p>
                    {deleteError && <Alert variant="error" message={deleteError} onDismiss={() => setDeleteError(null)} className="mb-3" />}
                    <button onClick={handleDeleteAccount} disabled={deleteLoading} className="btn btn-danger w-full">
                        {deleteLoading ? <span className="spinner" /> : <Trash2 className="w-4 h-4" />}
                        {deleteLoading ? 'Deleting…' : 'Delete my account'}
                    </button>
                </div>
            </div>
        </div>
    );
}
