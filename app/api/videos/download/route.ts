import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const videoId = request.nextUrl.searchParams.get('id');
    if (!videoId) {
        return NextResponse.json({ error: 'Missing video id' }, { status: 400 });
    }

    const { data: video, error } = await supabase
        .from('videos')
        .select('id, filename, s3_key, user_id')
        .eq('id', videoId)
        .single();

    if (error || !video) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    if (video.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const s3 = getS3Client();
    const command = new GetObjectCommand({
        Bucket: process.env['AWS_S3_BUCKET_NAME']!,
        Key: video.s3_key,
        ResponseContentDisposition: `attachment; filename="${video.filename}"`,
    });
    // Short-lived URL — only valid long enough to start the download
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    return NextResponse.redirect(signedUrl);
}
