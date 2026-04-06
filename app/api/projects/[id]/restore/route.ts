/* Restores a project for re-editing. Generates a short-lived signed URL for the original video,
   tells the backend to download it (returning a new videoId), and returns the tracks signed URL.
   The client uses videoId to run export and tracksSignedUrl to restore face track state. */
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

function getS3Client() {
    return new S3Client({
        region: process.env['AWS_REGION'],
        credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
        },
    });
}

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: project } = await supabase
        .from('projects')
        .select('user_id, filename, original_s3_key, tracks_s3_key, fps, frame_count, width, height, sample_rate')
        .eq('id', id)
        .single();

    if (!project || project.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const s3 = getS3Client();
    const BUCKET = process.env['AWS_S3_BUCKET_NAME']!;

    // Short-lived URL for the backend to download the original (5 min is enough)
    const originalDownloadUrl = await getSignedUrl(
        s3, new GetObjectCommand({ Bucket: BUCKET, Key: project.original_s3_key }), { expiresIn: 300 }
    );
    // Longer-lived URLs for the client: video playback + tracks fetch
    const [originalSignedUrl, tracksSignedUrl] = await Promise.all([
        getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: project.original_s3_key }), { expiresIn: 3600 }),
        getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: project.tracks_s3_key }),   { expiresIn: 300 }),
    ]);

    // Ask the backend to download the original video directly from S3
    const backendRes = await fetch(`${BACKEND_URL}/reupload-from-url`, {
        method: 'POST',
        headers: backendHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: originalDownloadUrl }),
    });

    if (!backendRes.ok) {
        const err = await backendRes.json().catch(() => ({}));
        return NextResponse.json(
            { error: err.detail || 'Failed to restore video to processing server' },
            { status: 502 }
        );
    }

    const { videoId, metadata } = await backendRes.json();

    return NextResponse.json({
        videoId,
        metadata,
        tracksSignedUrl,
        originalSignedUrl,
        filename: project.filename,
        sampleRate: project.sample_rate,
    });
}
