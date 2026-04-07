/* Generates a pre-signed S3 PUT URL for uploading the tracks JSON file for a project.
   No quota check — tracks files are always small (<5 MB). */
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/server/auth';
import { getS3Client, S3_BUCKET } from '@/lib/server/s3';
import { PresignTracksSchema } from '@/lib/server/validation';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const user = auth.user;

    const parsed = PresignTracksSchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const { filename } = parsed.data;
    const tracksFilename = `${filename}-tracks.json`;

    const s3 = getS3Client();
    const key = `projects/${user.id}/${randomUUID()}-${tracksFilename}`;

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: 'application/json',
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({ uploadUrl, key });
}
