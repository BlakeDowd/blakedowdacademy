import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Hardcoded URL to bypass Vercel environment variable delays
  const supabaseUrl = 'https://zdhzarkguvvrwzjuiqdc.supabase.co';
  
  // Hardcode ANON_KEY here to bypass Vercel delays (replace with your actual key from Supabase dashboard)
  // Get it from: Supabase Dashboard → Settings → API → anon public key
  // It starts with 'eyJ...'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing Supabase ANON_KEY. Please hardcode it above or set NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.'
    );
  }

  console.log('Supabase Client: Using hardcoded URL:', supabaseUrl);

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

