import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';

export function useUserAuth(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USER_INTEGRATION !== '1') return;
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    });
  }, []);

  return user;
}
