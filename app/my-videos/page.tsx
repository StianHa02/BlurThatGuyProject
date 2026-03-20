'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EyeOff, Video, ArrowLeft, Trash2, Download, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs } from '@/app/(landing)/components';

interface VideoRecord {
    id: string;
    filename: string;
    s3_key: string;
    file_size: number | null;
    created_at: string;
    signedUrl: string;
}

function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyVideosPage() {
    const router = useRouter();
    const [videos, setVideos] = useState<VideoRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(async ({ data }) => {
            if (!data.user) {
                router.push('/login');
                return;
            }

            const res = await fetch('/api/videos');
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? 'Failed to load videos.');
            } else {
                setVideos(await res.json());
            }
            setLoading(false);
        });
    }, [router]);

    async function handleDelete(video: VideoRecord) {
        setDeleting(video.id);
        const res = await fetch('/api/videos/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: video.id, s3Key: video.s3_key }),
        });
        if (res.ok) {
            setVideos((prev) => prev.filter((v) => v.id !== video.id));
        } else {
            const data = await res.json();
            setError(data.error ?? 'Failed to delete video.');
        }
        setDeleting(null);
    }

    return (
        <div className="bg-[#070f1c] text-white min-h-svh px-6 py-12 relative overflow-hidden">
            <BackgroundBlobs />

            <div className="relative z-10 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-10">
                    <Link href="/" className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <EyeOff className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-lg text-white tracking-tight">My Videos</span>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex justify-center py-24">
                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && videos.length === 0 && !error && (
                    <div className="glass rounded-2xl border border-white/8 flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                            <Video className="w-7 h-7 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">No videos yet</h2>
                        <p className="text-slate-400 text-sm max-w-xs mb-6">
                            Process a video and click &quot;Save Video&quot; to store it here.
                        </p>
                        <Link
                            href="/upload"
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm text-white transition-all"
                        >
                            Start uploading
                        </Link>
                    </div>
                )}

                {/* Video grid */}
                {!loading && videos.length > 0 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {videos.map((video) => (
                            <div key={video.id} className="glass rounded-2xl border border-white/8 overflow-hidden group">
                                {/* Video preview */}
                                <div className="aspect-video bg-black relative">
                                    <video
                                        src={video.signedUrl}
                                        className="w-full h-full object-contain"
                                        preload="metadata"
                                    />
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    <p className="text-sm font-medium text-white truncate mb-1" title={video.filename}>
                                        {video.filename}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                                        <span>{formatDate(video.created_at)}</span>
                                        {video.file_size && <span>{formatFileSize(video.file_size)}</span>}
                                    </div>

                                    <div className="flex gap-2">
                                        <a
                                            href={video.signedUrl}
                                            download={video.filename}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Download
                                        </a>
                                        <button
                                            onClick={() => handleDelete(video)}
                                            disabled={deleting === video.id}
                                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium transition-all disabled:opacity-50"
                                        >
                                            {deleting === video.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Trash2 className="w-3.5 h-3.5" />
                                            }
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
