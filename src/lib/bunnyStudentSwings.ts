import { createClient as createServerSupabase } from "@/lib/supabase/server";
import {
  isProtectedLibraryBunnyVideo,
  PROTECTED_LIBRARY_BUNNY_VIDEO_IDS,
} from "@/lib/bunnyStream";

export type BunnyStudentSwingMeta = {
  bunny_video_id: string;
  title: string | null;
  uploaded_by: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

function mapSwingRow(row: Record<string, unknown>): BunnyStudentSwingMeta | null {
  const bunnyVideoId = String(row.bunny_video_id || "").trim();
  if (!bunnyVideoId || isProtectedLibraryBunnyVideo(bunnyVideoId)) return null;
  return {
    bunny_video_id: bunnyVideoId,
    title: typeof row.title === "string" ? row.title : null,
    uploaded_by: typeof row.uploaded_by === "string" ? row.uploaded_by : null,
    key_issues: typeof row.key_issues === "string" ? row.key_issues : null,
    contact_info: typeof row.contact_info === "string" ? row.contact_info : null,
    directional_misses:
      typeof row.directional_misses === "string" ? row.directional_misses : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function listBunnyStudentSwings(): Promise<BunnyStudentSwingMeta[]> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("bunny_student_swings")
      .select(
        "bunny_video_id, title, uploaded_by, key_issues, contact_info, directional_misses, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[bunny_student_swings] list failed:", error.message);
      return [];
    }
    return (data || [])
      .map((row) => mapSwingRow(row as Record<string, unknown>))
      .filter((row): row is BunnyStudentSwingMeta => Boolean(row));
  } catch (err) {
    console.warn("[bunny_student_swings] list threw:", err);
    return [];
  }
}

export async function listDeletableBunnyStudentVideoIds(): Promise<string[]> {
  const swings = await listBunnyStudentSwings();
  return swings.map((s) => s.bunny_video_id);
}

export async function registerBunnyStudentSwing(input: {
  bunnyVideoId: string;
  title?: string;
  uploadedBy?: string | null;
  keyIssues?: string | null;
  contactInfo?: string | null;
  directionalMisses?: string | null;
}): Promise<void> {
  const videoId = input.bunnyVideoId.trim();
  if (!videoId || isProtectedLibraryBunnyVideo(videoId)) return;

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("bunny_student_swings").upsert(
      {
        bunny_video_id: videoId,
        title: input.title || null,
        uploaded_by: input.uploadedBy || null,
        key_issues: input.keyIssues?.trim() || null,
        contact_info: input.contactInfo?.trim() || null,
        directional_misses: input.directionalMisses?.trim() || null,
      },
      { onConflict: "bunny_video_id" },
    );
    if (error) {
      console.warn("[bunny_student_swings] register failed:", error.message);
    }
  } catch (err) {
    console.warn("[bunny_student_swings] register threw:", err);
  }
}

export async function unregisterBunnyStudentSwing(videoId: string): Promise<void> {
  const id = videoId.trim();
  if (!id) return;
  try {
    const supabase = await createServerSupabase();
    await supabase.from("bunny_student_swings").delete().eq("bunny_video_id", id);
  } catch (err) {
    console.warn("[bunny_student_swings] unregister threw:", err);
  }
}

export async function assertBunnyVideoDeletable(videoId: string): Promise<void> {
  const id = videoId.trim();
  if (!id) throw new Error("videoId is required");

  if (isProtectedLibraryBunnyVideo(id) || PROTECTED_LIBRARY_BUNNY_VIDEO_IDS.has(id)) {
    throw new Error(
      "Library drills (like Hell Drill) cannot be deleted. Only student swing uploads can be removed.",
    );
  }

  const deletable = await listDeletableBunnyStudentVideoIds();
  if (!deletable.includes(id)) {
    throw new Error(
      "Only swings sent by students (Send to Blake) can be deleted — not library drills.",
    );
  }
}
