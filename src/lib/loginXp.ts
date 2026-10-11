import { createClient } from "@/lib/supabase/client";

export type LoginXpClaim = {
  dailyXp: number;
  bonusXp: number;
  /** The streak milestone (7, 30 or 100) whose bonus was just paid. */
  bonusStreak: number | null;
  streak: number;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Pays today's login XP and any streak bonus that's due. Safe to call often: each is paid once. */
export async function claimLoginXp(): Promise<LoginXpClaim | null> {
  const { data, error } = await createClient().rpc("claim_login_xp");
  if (error) {
    if (!/claim_login_xp/.test(error.message ?? "")) console.warn("[loginXp] claim_login_xp:", error.message);
    return null;
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const claim: LoginXpClaim = {
    dailyXp: num(r.daily_xp),
    bonusXp: num(r.bonus_xp),
    bonusStreak: r.bonus_streak == null ? null : num(r.bonus_streak),
    streak: num(r.streak),
  };
  if (claim.dailyXp + claim.bonusXp > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("xpUpdated"));
  }
  return claim;
}

export function loginXpMessage(claim: LoginXpClaim): string | null {
  if (claim.bonusXp > 0 && claim.bonusStreak) {
    const total = claim.dailyXp + claim.bonusXp;
    return `${claim.bonusStreak} day login streak! +${total} XP`;
  }
  if (claim.dailyXp > 0) {
    return claim.streak > 1 ? `+${claim.dailyXp} XP daily login · ${claim.streak} day streak` : `+${claim.dailyXp} XP daily login`;
  }
  return null;
}
