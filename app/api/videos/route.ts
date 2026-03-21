import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';

function getS3Client() {
    return new S3Client({
        region: process.env.AWS_REGION!,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
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

    const { data: videos, error } = await supabase
        .from('videos')
        .select('id, filename, s3_key, file_size, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Generate a short-lived signed GET URL for each video
    const s3 = getS3Client();
    const BUCKET = process.env.AWS_S3_BUCKET_NAME!;
    const videosWithUrls = await Promise.all(
        (videos ?? []).map(async (video) => {
            const command = new GetObjectCommand({ Bucket: BUCKET, Key: video.s3_key });
            const signedUrl = await getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL });
            return { ...video, signedUrl };
        })
    );

    return NextResponse.json(videosWithUrls);
}
