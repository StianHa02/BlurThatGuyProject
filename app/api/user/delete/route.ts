import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function getS3Client() {
    return new S3Client({
        region: process.env['AWS_REGION'],
        credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
        },
    });
}

export async function DELETE() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all user videos from S3 before removing the account
    // (CASCADE will remove DB rows, but we need s3_key values first)
    const { data: videos } = await supabase
        .from('videos')
        .select('s3_key')
        .eq('user_id', user.id);

    if (videos && videos.length > 0) {
        const s3 = getS3Client();
        const BUCKET = process.env['AWS_S3_BUCKET_NAME']!;
        await Promise.all(
            videos.map((v) =>
                s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: v.s3_key }))
            )
        );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
