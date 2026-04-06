/* Generates a pre-signed S3 PUT URL for uploading the tracks JSON file for a project.
   No quota check — tracks files are always small (<5 MB). */
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

function getS3Client() {
    return new S3Client({
        region: process.env['AWS_REGION'],
        credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
        },
    });
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename } = await req.json();
    const tracksFilename = filename ? `${filename}-tracks.json` : `${randomUUID()}-tracks.json`;

    const s3 = getS3Client();
    const BUCKET = process.env['AWS_S3_BUCKET_NAME']!;
    const key = `projects/${user.id}/${randomUUID()}-${tracksFilename}`;

    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: 'application/json',
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({ uploadUrl, key });
}
