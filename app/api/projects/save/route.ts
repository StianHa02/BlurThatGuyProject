/* Saves project metadata (original video S3 key + tracks S3 key) to the projects table.
   Validates that both S3 keys belong to the authenticated user before inserting. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { SaveProjectSchema } from '@/lib/server/validation';

export async function POST(req: NextRequest) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { user, supabase } = auth;

    const parsed = SaveProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const { originalKey, tracksKey, filename, fps, frameCount, width, height, sampleRate, trackCount, fileSize } = parsed.data;

    // Validate both keys belong to this user
    const expectedPrefix = `projects/${user.id}/`;
    if (!originalKey.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Invalid original storage key' }, { status: 403 });
    }
    if (!tracksKey.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Invalid tracks storage key' }, { status: 403 });
    }

    const { error } = await supabase.from('projects').insert({
        user_id:         user.id,
        filename,
        original_s3_key: originalKey,
        tracks_s3_key:   tracksKey,
        fps:             fps ?? 30,
        frame_count:     frameCount ?? 0,
        width:           width ?? null,
        height:          height ?? null,
        sample_rate:     sampleRate ?? 3,
        track_count:     trackCount ?? 0,
        file_size:       fileSize ?? null,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
