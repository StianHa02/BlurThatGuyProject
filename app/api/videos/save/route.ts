import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key, filename, fileSize } = await req.json();

    // Validate the S3 key belongs to this user
    const expectedPrefix = `videos/${user.id}/`;
    if (typeof key !== 'string' || !key.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Invalid storage key' }, { status: 403 });
    }

    const { error } = await supabase.from('videos').insert({
        user_id: user.id,
        filename,
        s3_key: key,
        file_size: fileSize ?? null,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
