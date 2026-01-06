"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(userId: string, fullName: string, profileIcon: string) {
  try {
    if (!userId || !fullName || !profileIcon) {
      return { success: false, error: "Missing required fields" };
    }

    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        profile_icon: profileIcon,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('full_name, profile_icon')
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return { success: false, error: error.message || "Failed to update profile" };
    }

    // Immediately revalidate all pages to clear cache after database update
    revalidatePath('/', 'layout');
    revalidatePath('/stats', 'page');
    revalidatePath('/academy', 'page');
    revalidatePath('/profile', 'page');
    
    return { success: true, data };
  } catch (error: any) {
    console.error("Profile update error:", error);
    return { success: false, error: error.message || "Failed to update profile" };
  }
}

