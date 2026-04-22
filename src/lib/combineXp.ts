import { addProfileXp } from "@/lib/addProfileXp";

/**
 * Awarded once when any Academy combine session is saved successfully.
 * Roadmap drills award roughly 10 XP × estimated minutes (often ~250–350 for a typical block);
 * combines are slightly higher to reward finishing assessed protocols.
 */
export const XP_AWARD_COMBINE_SESSION = 330;

export async function awardCombineCompletionXp(userId: string | undefined): Promise<void> {
  if (!userId) return;
  try {
    await addProfileXp(userId, XP_AWARD_COMBINE_SESSION);
  } catch (error) {
    // Combine saves should remain successful even if profile XP write fails.
    console.warn("[combineXp] Failed to award combine XP", error);
  }
}
