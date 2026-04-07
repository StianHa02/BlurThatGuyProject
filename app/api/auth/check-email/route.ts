/* Checks if an email is already registered. Expects { email } in the request body. Uses Supabase admin client*/
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CheckEmailSchema } from '@/lib/server/validation';

export async function POST(req: Request) {
    try {
        const parsed = CheckEmailSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }
        const email = parsed.data.email.trim().toLowerCase();

        const admin = createAdminClient();

        // O(1) lookup via PostgREST instead of paginating all users
        const { data, error } = await admin
            .rpc('check_email_exists', { lookup_email: email });

        if (error) {
            // Fallback: direct query on auth.users (service role bypasses RLS)
            const { count, error: countError } = await admin
                .schema('auth')
                .from('users')
                .select('id', { count: 'exact', head: true })
                .ilike('email', email);

            if (countError) {
                console.error('check-email fallback error:', countError.message);
                return NextResponse.json({ error: countError.message }, { status: 500 });
            }

            return NextResponse.json({ exists: (count ?? 0) > 0 });
        }

        return NextResponse.json({ exists: !!data });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
