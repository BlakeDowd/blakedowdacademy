import { createBrowserClient } from '@supabase/ssr'

// Custom fetch with no-store cache to bypass all caching
// This ensures profile data is always fetched fresh from the database
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  return fetch(url, {
    ...options,
    cache: 'no-store',
  });
};

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.'
    );
  }

  // Configure Supabase client with custom fetch to bypass cache
  // Note: @supabase/ssr may have different options format - adjust if needed
  try {
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: customFetch,
      },
    } as any);
  } catch (error) {
    // Fallback to default client if custom fetch config fails
    console.warn('Failed to configure custom fetch, using default:', error);
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
}

