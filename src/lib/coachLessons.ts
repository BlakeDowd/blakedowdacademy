import type { SupabaseClient } from "@supabase/supabase-js";
import { addProfileXp } from "@/lib/addProfileXp";

/**
 * A coach logs a lesson for a player: saved as a 1-hour `practice` row (so it counts toward their weekly
 * practice hours and shows in their practice history) with the same XP as an hour of practice.
 */
export const LESSON_PRACTICE_TYPE = "lesson";
export const LESSON_MINUTES = 60;
export const LESSON_XP = 60;

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function lessonLoggedToday(supabase: SupabaseClient, playerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("practice")
    .select("id")
    .eq("user_id", playerId)
    .eq("type", LESSON_PRACTICE_TYPE)
    .gte("created_at", startOfTodayIso())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Returns "logged", "already" (one lesson per player per day) or an error message. */
export async function logCoachLesson(supabase: SupabaseClient, playerId: string): Promise<"logged" | "already" | string> {
  if (await lessonLoggedToday(supabase, playerId)) return "already";
  const { error } = await supabase.from("practice").insert({
    user_id: playerId,
    type: LESSON_PRACTICE_TYPE,
    duration_minutes: LESSON_MINUTES,
    notes: `Coaching lesson - ${LESSON_MINUTES} minutes`,
  });
  if (error) return error.message || "Couldn't log the lesson.";

  await addProfileXp(playerId, LESSON_XP);
  // Best effort: shows on the player's Home "Recent" list where activity_logs allows coach inserts.
  await supabase
    .from("activity_logs")
    .insert({ user_id: playerId, activity_type: "practice", activity_title: "Had a 1 hour lesson" });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("practiceSessionsUpdated"));
  return "logged";
}
