import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Return a client even if env vars are missing (for build time)
  // Runtime errors will occur when trying to use the client
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

