import { createClient } from "@/lib/supabase/client";

export type LibraryCompletionRow = {
  user_id: string;
  lesson_id: string;
  lesson_title?: string | null;
  completed_at: string;
};

const TABLE = "library_lesson_completions";
const PAGE_SIZE = 1000;

export async function fetchMyLibraryCompletionIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await createClient()
      .from(TABLE)
      .select("lesson_id")
      .eq("user_id", userId);
    if (error) {
      console.error("Error loading library completions:", error.message);
      return [];
    }
    return (data || []).map((r: { lesson_id: string }) => r.lesson_id);
  } catch (err) {
    console.error("Failed to load library completions:", err);
    return [];
  }
}

export async function fetchMyLibraryCompletions(userId: string): Promise<LibraryCompletionRow[]> {
  try {
    const { data, error } = await createClient()
      .from(TABLE)
      .select("user_id, lesson_id, lesson_title, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });
    if (error) {
      console.error("Error loading library completions:", error.message);
      return [];
    }
    return (data || []) as LibraryCompletionRow[];
  } catch (err) {
    console.error("Failed to load library completions:", err);
    return [];
  }
}

export async function recordLibraryCompletions(
  userId: string,
  lessons: { id: string; title?: string }[],
): Promise<void> {
  if (!userId || lessons.length === 0) return;
  try {
    const { error } = await createClient()
      .from(TABLE)
      .upsert(
        lessons.map((l) => ({ user_id: userId, lesson_id: l.id, lesson_title: l.title ?? null })),
        { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
      );
    if (error) console.error("Error saving library completion:", error.message);
  } catch (err) {
    console.error("Failed to save library completion:", err);
  }
}

/** Every user's completions (paged past the 1000-row API cap) for the leaderboard. */
export async function fetchAllLibraryCompletions(): Promise<LibraryCompletionRow[]> {
  const supabase = createClient();
  const rows: LibraryCompletionRow[] = [];
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("user_id, lesson_id, completed_at")
        .order("completed_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error("Error loading leaderboard library completions:", error.message);
        break;
      }
      rows.push(...((data || []) as LibraryCompletionRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
  } catch (err) {
    console.error("Failed to load leaderboard library completions:", err);
  }
  return rows;
}
