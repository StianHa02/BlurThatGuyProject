/* Returns all projects owned by the authenticated user, each with 1-hour signed S3 URLs
   for the original video (thumbnail preview) and tracks JSON. */
import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';

function getS3Client() {
    return new S3Client({
        region: process.env['AWS_REGION'],
        credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
        },
    });
}

const SIGNED_URL_TTL = 3600; // 1 hour

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projects, error } = await supabase
        .from('projects')
        .select('id, filename, original_s3_key, tracks_s3_key, fps, frame_count, width, height, sample_rate, track_count, file_size, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const s3 = getS3Client();
    const BUCKET = process.env['AWS_S3_BUCKET_NAME']!;

    const projectsWithUrls = await Promise.all(
        (projects ?? []).map(async (project) => {
            const [originalSignedUrl, tracksSignedUrl] = await Promise.all([
                getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: project.original_s3_key }), { expiresIn: SIGNED_URL_TTL }),
                getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: project.tracks_s3_key }),   { expiresIn: SIGNED_URL_TTL }),
            ]);
            return { ...project, originalSignedUrl, tracksSignedUrl };
        })
    );

    return NextResponse.json(projectsWithUrls);
}
