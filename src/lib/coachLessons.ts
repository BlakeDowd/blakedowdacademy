import type { SupabaseClient } from "@supabase/supabase-js";
import { addProfileXp } from "@/lib/addProfileXp";

/**
 * A coach logs a lesson for a player: saved as a 1-hour `practice` row (so it counts toward their weekly
 * practice hours and shows in their practice history) with the same XP as an hour of practice.
 *
 * If the player hasn't joined yet (pending invite space), the lesson is stored on
 * `coaching_pending_lessons` and claimed onto their profile when they sign up / get linked.
 */
export const LESSON_PRACTICE_TYPE = "lesson";
export const LESSON_MINUTES = 60;
export const LESSON_XP = 60;

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function isPendingInviteSpace(supabase: SupabaseClient, spaceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("coaching_spaces")
    .select("id, student_id")
    .eq("id", spaceId)
    .maybeSingle();
  return Boolean(data && data.student_id == null);
}

async function pendingLessonLoggedToday(supabase: SupabaseClient, spaceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("coaching_pending_lessons")
    .select("id")
    .eq("space_id", spaceId)
    .gte("created_at", startOfTodayIso())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function lessonLoggedToday(supabase: SupabaseClient, playerId: string): Promise<boolean> {
  if (await isPendingInviteSpace(supabase, playerId)) {
    return pendingLessonLoggedToday(supabase, playerId);
  }
  const { data } = await supabase
    .from("practice")
    .select("id")
    .eq("user_id", playerId)
    .eq("type", LESSON_PRACTICE_TYPE)
    .gte("created_at", startOfTodayIso())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export type LogCoachLessonResult = "logged" | "logged_pending" | "already" | string;

/** Returns "logged", "logged_pending" (waiting for signup), "already", or an error message. */
export async function logCoachLesson(
  supabase: SupabaseClient,
  playerId: string,
): Promise<LogCoachLessonResult> {
  if (await lessonLoggedToday(supabase, playerId)) return "already";

  const pending = await isPendingInviteSpace(supabase, playerId);
  if (pending) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return "not_signed_in";

    const { error } = await supabase.from("coaching_pending_lessons").insert({
      space_id: playerId,
      coach_id: user.id,
      xp: LESSON_XP,
      minutes: LESSON_MINUTES,
    });
    if (error) {
      // Migration not applied yet — surface a clear message.
      if (/coaching_pending_lessons|PGRST|schema cache/i.test(error.message ?? "")) {
        return "Run the pending-lessons SQL in Supabase, then try again.";
      }
      return error.message || "Couldn't log the lesson for this invite.";
    }
    return "logged_pending";
  }

  const { error } = await supabase.from("practice").insert({
    user_id: playerId,
    type: LESSON_PRACTICE_TYPE,
    duration_minutes: LESSON_MINUTES,
    notes: `Coaching lesson - ${LESSON_MINUTES} minutes`,
  });
  if (error) return error.message || "Couldn't log the lesson.";

  await addProfileXp(playerId, LESSON_XP);
  await supabase
    .from("activity_logs")
    .insert({ user_id: playerId, activity_type: "practice", activity_title: "Had a 1 hour lesson" });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("practiceSessionsUpdated"));
  return "logged";
}
