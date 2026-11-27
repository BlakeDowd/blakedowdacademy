import { addProfileXp } from "@/lib/addProfileXp";
import { awardDrawTickets } from "@/lib/practiceDrawTickets";
import { recordCombineCompletion } from "@/lib/weeklyGoals";

/**
 * Awarded once when any Academy combine session is saved successfully.
 * Roadmap drills award roughly 10 XP × estimated minutes (often ~250–350 for a typical block);
 * combines are slightly higher to reward finishing assessed protocols.
 */
export const XP_AWARD_COMBINE_SESSION = 330;

export async function awardCombineCompletionXp(userId: string | undefined): Promise<void> {
  if (!userId) return;
  void recordCombineCompletion(userId);
  // Community draw: 1 combine = 1 ticket (when campaign earn_rules enables it).
  // source_id must be uuid (combine_completions.id is bigint), so use a fresh id for dedupe.
  const sourceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : null;
  try {
    await awardDrawTickets("combine", 1, sourceId);
  } catch (error) {
    console.warn("[combineXp] Failed to award draw ticket", error);
  }
  try {
    await addProfileXp(userId, XP_AWARD_COMBINE_SESSION);
  } catch (error) {
    // Combine saves should remain successful even if profile XP write fails.
    console.warn("[combineXp] Failed to award combine XP", error);
  }
}
