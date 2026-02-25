import { createClient } from "@/lib/supabase/client";

export type ActivityType = 'drill' | 'video' | 'achievement' | 'round' | 'practice';

export async function logActivity(userId: string, type: ActivityType, title: string) {
  try {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        activity_type: type,
        activity_title: title
      });
      
    if (error) {
      const msg = (error as { message?: string })?.message ?? JSON.stringify(error);
      console.error('Error logging activity:', msg);
    }
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
