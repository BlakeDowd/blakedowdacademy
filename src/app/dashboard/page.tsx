// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HomeDashboard from '@/components/HomeDashboard';

export default async function DashboardPage() {
  // Use cookies() to force Next.js to treat this as dynamic every single time
  const cookieStore = await cookies();
  
  // Get the user from server-side Supabase
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  // Redirect to login if not authenticated
  if (authError || !user) {
    redirect('/login');
  }
  
  // Fetch profile directly from database (server-side, no cache)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, profile_icon, updated_at')
    .eq('id', user.id)
    .single();
  
  if (profileError) {
    console.error('Error fetching profile:', profileError);
  }
  
  // Log what we fetched from the database
  console.log('Server fetched profile name:', profile?.full_name);
  
  // Render the client component (it will still fetch its own data, but this ensures dynamic rendering)
  return <HomeDashboard />;
}
