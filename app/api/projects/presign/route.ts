/* Generates a pre-signed S3 PUT URL for direct browser upload of an original (unblurred) project video.
   Enforces per-file (2 GB), per-user (5 GB), bucket (30 GB) limits, and a rate limit of 10 saves per hour. */
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/server/auth';
import { getS3Client, S3_BUCKET } from '@/lib/server/s3';
import { PresignSchema } from '@/lib/server/validation';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE_BYTES = 2  * 1024 * 1024 * 1024; // 2 GB per file
const USER_QUOTA_BYTES    = 5  * 1024 * 1024 * 1024; // 5 GB per user
const BUCKET_CAP_BYTES    = 30 * 1024 * 1024 * 1024; // 30 GB total bucket
const RATE_LIMIT_PER_HOUR = 10;                        // saves per user per hour

export async function POST(req: NextRequest) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    const parsed = PresignSchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const { filename, contentType, fileSize } = parsed.data;

    // ── 1. File size guard ────────────────────────────────────────────────────
    if (fileSize > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
            { error: 'File exceeds the 2 GB per-upload limit.' },
            { status: 413 }
        );
    }

    // ── 2. Rate limit: max 10 saves per user per hour ─────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentProjects } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo);

    if ((recentProjects ?? 0) >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json(
            { error: `Rate limit exceeded — max ${RATE_LIMIT_PER_HOUR} saves per hour.` },
            { status: 429 }
        );
    }

    // ── 3. Per-user quota: 5 GB ──────────────────────────────────────────────
    // ── 4. Total bucket cap: 30 GB ────────────────────────────────────────────
    // Run both quota checks in parallel
    const admin = createAdminClient();
    const [userQuotaRes, bucketQuotaRes] = await Promise.all([
        supabase.from('projects').select('file_size').eq('user_id', user.id),
        admin.from('projects').select('file_size'),
    ]);

    const userUsed = userQuotaRes.data?.reduce((s, p) => s + (p.file_size ?? 0), 0) ?? 0;
    if (userUsed + fileSize > USER_QUOTA_BYTES) {
        return NextResponse.json(
            { error: 'Storage quota exceeded — 5 GB per user.' },
            { status: 413 }
        );
    }

    const bucketUsed = bucketQuotaRes.data?.reduce((s, p) => s + (p.file_size ?? 0), 0) ?? 0;
    if (bucketUsed + fileSize > BUCKET_CAP_BYTES) {
        return NextResponse.json(
            { error: 'Storage capacity reached. Please try again later.' },
            { status: 507 }
        );
    }

    // ── 5. Generate pre-signed PUT URL ────────────────────────────────────────
    const s3 = getS3Client();
    const key = `projects/${user.id}/${randomUUID()}-${filename}`;

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({ uploadUrl, key });
}
