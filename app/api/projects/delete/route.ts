/* Deletes a project by id. Verifies ownership, removes both the original video and
   tracks JSON from S3, then deletes the database record. */
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();

    // Verify ownership and get S3 keys from the DB (never trust client-supplied keys)
    const { data: project } = await supabase
        .from('projects')
        .select('user_id, original_s3_key, tracks_s3_key')
        .eq('id', id)
        .single();

    if (!project || project.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete both S3 objects
    const s3 = getS3Client();
    const BUCKET = process.env['AWS_S3_BUCKET_NAME']!;
    await Promise.all([
        s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: project.original_s3_key })),
        s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: project.tracks_s3_key })),
    ]);

    // Delete the DB record
    await supabase.from('projects').delete().eq('id', id);

    return NextResponse.json({ success: true });
}
