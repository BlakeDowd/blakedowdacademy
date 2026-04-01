import { createBrowserClient } from '@supabase/ssr'

/** Prefer .env.local / Vercel env so CSV upserts and the UI hit the same project. */
const FALLBACK_URL = 'https://zdhzarkguvvrwzjuiqdc.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkaHphcmtndXZ2cnd6anVpcWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTQ1MjMsImV4cCI6MjA4MzE3MDUyM30.Kd96aQdJA7qjqR-lOFEJ4esQDkfLn0wfF1VS_jbqI3w'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'academy-auth',
    },
  });
}

