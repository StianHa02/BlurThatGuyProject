/* Deletes the authenticated user's account. Fetches S3 keys, deletes the auth user
   (CASCADE removes DB rows), then cleans up S3 as best-effort. */
import { NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/server/auth';
import { getS3Client, S3_BUCKET } from '@/lib/server/s3';

export async function DELETE() {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    // Fetch S3 keys BEFORE deleting the user (CASCADE will remove DB rows)
    const { data: projects } = await supabase
        .from('projects')
        .select('original_s3_key, tracks_s3_key')
        .eq('user_id', user.id);

    // Delete auth user first (cascades to project rows in DB)
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best-effort S3 cleanup — don't fail the request if this errors
    if (projects && projects.length > 0) {
        try {
            const s3 = getS3Client();
            await Promise.all(
                projects.flatMap((p) => [
                    s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: p.original_s3_key })),
                    s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: p.tracks_s3_key })),
                ])
            );
        } catch (err) {
            console.error('S3 cleanup failed after user deletion:', err);
        }
    }

    return NextResponse.json({ success: true });
}
