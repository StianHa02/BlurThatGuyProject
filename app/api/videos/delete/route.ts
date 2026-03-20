import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/lib/supabase/server';

const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, s3Key } = await req.json();

    // Verify ownership before deleting
    const { data: video } = await supabase
        .from('videos')
        .select('user_id')
        .eq('id', id)
        .single();

    if (!video || video.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete from S3
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));

    // Delete from Supabase
    await supabase.from('videos').delete().eq('id', id);

    return NextResponse.json({ success: true });
}
