import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Hardcoded credentials to bypass Vercel environment variable delays
  // const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // Commented out
  // const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Commented out
  
  const supabaseUrl = 'https://zdhzarkguvvrwzjuiqdc.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkaHphcmtndXZ2cnd6anVpcWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTQ1MjMsImV4cCI6MjA4MzE3MDUyM30.Kd96aQdJA7qjqR-lOFEJ4esQDkfLn0wfF1VS_jbqI3w';

  console.log('Supabase Client: Using hardcoded URL:', supabaseUrl);

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'academy-auth',
    },
  });
}

