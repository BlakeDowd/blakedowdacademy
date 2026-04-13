import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Prefer .env.local / Vercel env so CSV upserts and the UI hit the same project. */
const FALLBACK_URL = 'https://zdhzarkguvvrwzjuiqdc.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkaHphcmtndXZ2cnd6anVpcWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTQ1MjMsImV4cCI6MjA4MzE3MDUyM30.Kd96aQdJA7qjqR-lOFEJ4esQDkfLn0wfF1VS_jbqI3w'

/**
 * Single browser client so only one auto-refresh timer runs. Multiple
 * `createBrowserClient` instances race on the same refresh token → AuthApiError
 * "Invalid Refresh Token: Already Used".
 */
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'academy-auth',
    },
  })

  return browserClient
}

