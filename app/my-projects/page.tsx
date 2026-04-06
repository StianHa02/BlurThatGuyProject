/* My Projects page. Lists all saved projects for the authenticated user with options to re-edit or delete.
   Projects store the original unblurred video + face tracks so the user can re-choose which faces to blur. */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Trash2, Pencil, Loader2, Users } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BackgroundBlobs, Header, Alert } from '@/components';
import type { ProjectRecord } from '@/types';
import { formatFileSize, formatDate } from '@/lib/utils';

export default function MyProjectsPage() {
    const router = useRouter();
    const [projects, setProjects]   = useState<ProjectRecord[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [deleting, setDeleting]   = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(async ({ data }) => {
            if (!data.user) { router.push('/login'); return; }
            const res = await fetch('/api/projects');
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? 'Failed to load projects.');
            } else {
                setProjects(await res.json());
            }
            setLoading(false);
        });
    }, [router]);

    async function handleReEdit(project: ProjectRecord) {
        setRestoring(project.id);
        // Navigate to upload page with projectId — restore runs on mount there
        router.push(`/upload?projectId=${project.id}`);
    }

    async function handleDelete(project: ProjectRecord) {
        setDeleting(project.id);
        const res = await fetch('/api/projects/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: project.id }),
        });
        if (res.ok) {
            setProjects((prev) => prev.filter((p) => p.id !== project.id));
        } else {
            const data = await res.json();
            setError(data.error ?? 'Failed to delete project.');
        }
        setDeleting(null);
    }

    return (
        <div className="page-bg overflow-hidden">
            <BackgroundBlobs />
            <Header />

            <div className="relative z-10 max-w-4xl mx-auto px-6 pt-10 pb-12">

                <h1 className="text-2xl font-bold text-white mb-6">My Projects</h1>

                {error && <Alert variant="error" message={error} onDismiss={() => setError(null)} className="mb-6" />}

                {/* Loading */}
                {loading && (
                    <div className="flex justify-center py-24">
                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && projects.length === 0 && !error && (
                    <div className="card-glass flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                            <FolderOpen className="w-7 h-7 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">No projects yet</h2>
                        <p className="text-slate-400 text-sm max-w-xs mb-6">
                            Process a video and click &quot;Save Project&quot; to store it here for re-editing later.
                        </p>
                        <Link href="/upload" className="btn btn-primary btn-sm">
                            Start uploading
                        </Link>
                    </div>
                )}

                {/* Project grid */}
                {!loading && projects.length > 0 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((project) => (
                            <div key={project.id} className="card overflow-hidden group">
                                {/* Video thumbnail */}
                                <div className="aspect-video bg-black relative">
                                    <video
                                        src={project.originalSignedUrl}
                                        className="w-full h-full object-contain"
                                        preload="metadata"
                                    />
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                                    {/* Track count badge */}
                                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-xs text-slate-300">
                                        <Users className="w-3 h-3" />
                                        {project.track_count} {project.track_count === 1 ? 'face' : 'faces'}
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    <p className="text-sm font-medium text-white truncate mb-1" title={project.filename}>
                                        {project.filename}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                                        <span>{formatDate(project.created_at)}</span>
                                        {project.file_size && <span>{formatFileSize(project.file_size)}</span>}
                                    </div>

                                    <div className="flex gap-2 items-center">
                                        <button
                                            onClick={() => handleReEdit(project)}
                                            disabled={restoring === project.id || deleting === project.id}
                                            className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-all whitespace-nowrap cursor-pointer"
                                        >
                                            {restoring === project.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Pencil className="w-3.5 h-3.5 shrink-0" />
                                            }
                                            Re-edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(project)}
                                            disabled={deleting === project.id || restoring === project.id}
                                            className="flex items-center justify-center px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium transition-all disabled:opacity-50 cursor-pointer shrink-0"
                                        >
                                            {deleting === project.id
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
