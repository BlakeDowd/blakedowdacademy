import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Hardcoded credentials to bypass Vercel environment variable delays
  const supabaseUrl = 'https://zdhzarkguvvrwzjuiqdc.supabase.co';
  
  // Hardcoded ANON_KEY - replace [PASTE YOUR eyJ... KEY HERE] with your actual key
  // const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Commented out
  const supabaseAnonKey = '[PASTE YOUR eyJ... KEY HERE]';

  if (!supabaseAnonKey || supabaseAnonKey === '[PASTE YOUR eyJ... KEY HERE]') {
    throw new Error(
      'Missing Supabase ANON_KEY. Please hardcode it above (replace [PASTE YOUR eyJ... KEY HERE]).'
    );
  }

  console.log('Supabase Client: Using hardcoded URL:', supabaseUrl);

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'academy-auth',
    },
  });
}

