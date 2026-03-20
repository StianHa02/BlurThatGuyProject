import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

const MAX_FILE_SIZE_BYTES  = 2  * 1024 * 1024 * 1024; // 2 GB per file
const USER_QUOTA_BYTES     = 5  * 1024 * 1024 * 1024; // 5 GB per user
const BUCKET_CAP_BYTES     = 30 * 1024 * 1024 * 1024; // 30 GB total bucket
const RATE_LIMIT_PER_HOUR  = 10;                        // uploads per user per hour

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename, contentType, fileSize } = await req.json();

    // ── 1. File size guard ────────────────────────────────────────────────────
    if (typeof fileSize === 'number' && fileSize > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
            { error: 'File exceeds the 2 GB per-upload limit.' },
            { status: 413 }
        );
    }

    // ── 2. Rate limit: max 10 uploads per user per hour ───────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentUploads } = await supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo);

    if ((recentUploads ?? 0) >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json(
            { error: `Rate limit exceeded — max ${RATE_LIMIT_PER_HOUR} uploads per hour.` },
            { status: 429 }
        );
    }

    // ── 3. Per-user quota: 5 GB ───────────────────────────────────────────────
    const { data: userVideos } = await supabase
        .from('videos')
        .select('file_size')
        .eq('user_id', user.id);

    const userUsed = userVideos?.reduce((sum, v) => sum + (v.file_size ?? 0), 0) ?? 0;

    if (userUsed + (fileSize ?? 0) > USER_QUOTA_BYTES) {
        return NextResponse.json(
            { error: 'Storage quota exceeded — 5 GB per user.' },
            { status: 413 }
        );
    }

    // ── 4. Total bucket cap: 30 GB ────────────────────────────────────────────
    const { data: allVideos } = await supabase
        .from('videos')
        .select('file_size');

    const bucketUsed = allVideos?.reduce((sum, v) => sum + (v.file_size ?? 0), 0) ?? 0;

    if (bucketUsed + (fileSize ?? 0) > BUCKET_CAP_BYTES) {
        return NextResponse.json(
            { error: 'Storage capacity reached. Please try again later.' },
            { status: 507 }
        );
    }

    // ── 5. Generate pre-signed PUT URL ────────────────────────────────────────
    const key = `videos/${user.id}/${randomUUID()}-${filename}`;

    // Do NOT include ContentLength — it becomes a signed header and browsers
    // cannot set Content-Length manually in fetch(), causing SignatureDoesNotMatch.
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({ uploadUrl, key });
}
