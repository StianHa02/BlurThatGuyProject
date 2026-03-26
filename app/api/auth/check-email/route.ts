import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';


/* Checks if an email is already registered. Expects { email } in the request body. Uses Supabase admin client*/

export async function POST(req: Request) {
    try {
        const { email: rawEmail } = await req.json();
        const email = rawEmail?.trim().toLowerCase();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const admin = createAdminClient();

        let page = 1;
        let userExists = false;
        
        while (true) {
            const { data: { users }, error } = await admin.auth.admin.listUsers({
                page,
                perPage: 1000,
            });

            if (error) {
                console.error(`Error on page ${page} of listUsers:`, error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            if (!users || users.length === 0) {
                break;
            }

            if (users.some(u => u.email?.toLowerCase() === email)) {
                userExists = true;
                break;
            }

            if (users.length < 1000) {
                break; // Last page reached
            }

            page++;
        }

        return NextResponse.json({ exists: userExists });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
