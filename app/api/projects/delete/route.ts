/* Deletes a project by id. Verifies ownership, deletes the DB record first
   (source of truth), then cleans up S3 objects as best-effort. */
import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/server/auth';
import { getS3Client, S3_BUCKET } from '@/lib/server/s3';
import { DeleteProjectSchema } from '@/lib/server/validation';

export async function DELETE(req: NextRequest) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    const parsed = DeleteProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const { id } = parsed.data;

    // Verify ownership and get S3 keys from the DB (never trust client-supplied keys)
    const { data: project } = await supabase
        .from('projects')
        .select('user_id, original_s3_key, tracks_s3_key')
        .eq('id', id)
        .single();

    if (!project || project.user_id !== user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete DB record first (source of truth) — orphaned S3 blobs are less
    // harmful than phantom DB records pointing to deleted files.
    await supabase.from('projects').delete().eq('id', id);

    // Best-effort S3 cleanup — don't fail the request if this errors
    try {
        const s3 = getS3Client();
        await Promise.all([
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: project.original_s3_key })),
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: project.tracks_s3_key })),
        ]);
    } catch (err) {
        console.error('S3 cleanup failed (DB record already deleted):', err);
    }

    return NextResponse.json({ success: true });
}
