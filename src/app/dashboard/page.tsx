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
  
  // Fetch profile with timeout and error handling
  let profileName = 'New Member'; // Default value
  
  try {
    // Force stop: Set isLoading to false if fetch takes longer than 2 seconds
    const fetchPromise = supabase
      .from('profiles')
      .select('full_name, profile_icon, updated_at')
      .eq('id', user.id)
      .single();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
    );
    
    const result = await Promise.race([
      fetchPromise,
      timeoutPromise
    ]) as { data: any; error: any };
    
    if (result.error) {
      console.error('Error fetching profile:', result.error);
      profileName = 'New Member'; // Default value
    } else {
      // Default Value: If full_name is missing or null, explicitly set it to 'New Member'
      profileName = result.data?.full_name || 'New Member';
      console.log('Server fetched profile name:', profileName);
    }
  } catch (error: any) {
    console.error('Profile fetch error or timeout:', error);
    profileName = 'New Member'; // Default value
  }
  
  // Render the client component (it will still fetch its own data, but this ensures dynamic rendering)
  return <HomeDashboard />;
}
