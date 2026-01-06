"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(userId: string, fullName: string, profileIcon: string) {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        profile_icon: profileIcon,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || "Failed to update profile");
    }

    // Revalidate all pages to clear cache
    revalidatePath('/', 'layout');
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update profile" };
  }
}

