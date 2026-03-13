import type { LessonType, Lesson } from "./types";
import { createClient } from "@/lib/supabase/client";

export async function fetchLessons(): Promise<Lesson[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("drills")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row: any) => {
    const videoUrl = row.video_url || row.source || row.youtube_link || "";
    const type = (row.type as string) || (videoUrl ? "video" : "text");
    return {
      id: String(row.id),
      title: String(row.drill_name || row.title || "Untitled"),
      type: (type === "quiz" ? "quiz" : type === "pdf" ? "pdf" : type === "video" ? "video" : "text") as LessonType,
      description: String(row.description || ""),
      source: videoUrl || String(row.description || ""),
      chapter_name: String(row.chapter_name || row.category || "Uncategorized"),
      module_name: String(row.module_name || row.category || "General"),
      category: String(row.category || "General"),
      sort_order: Number(row.sort_order ?? row.estimated_minutes ?? 0),
      duration: row.duration ? String(row.duration) : undefined,
      xpValue: Number(row.xp_value ?? row.xp ?? 50),
    };
  });
}
