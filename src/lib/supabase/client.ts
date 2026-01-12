import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Use the correct Supabase project URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zdhzarkguvvrwzjuiqdc.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variable. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file or Vercel environment variables.'
    );
  }

  console.log('Supabase Client: Using URL:', supabaseUrl.substring(0, 30) + '...');

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

