/**
 * When Goal/Reps text from the DB includes tier keywords, split into lines for UI badges.
 * Splits on ';' if present, else on newlines, when Beginner/Intermediate/Advanced are mentioned.
 */

export type TierLabel = "beginner" | "intermediate" | "advanced" | "other";

/** Prefer `goal_reps` from DB when set; otherwise `goal`. Use for tier parsing + fallback text. */
export function effectiveGoalRepsString(
  goal?: string | null,
  goal_reps?: string | null
): string {
  const gr = goal_reps != null && String(goal_reps).trim() ? String(goal_reps).trim() : "";
  if (gr) return gr;
  return goal != null && String(goal).trim() ? String(goal).trim() : "";
}

export function detectTierInLine(line: string): TierLabel {
  const s = line.toLowerCase();
  if (s.includes("beginner")) return "beginner";
  if (s.includes("intermediate")) return "intermediate";
  if (s.includes("advanced")) return "advanced";
  return "other";
}

const TIER_KEYWORD_RE = /beginner|intermediate|advanced/i;

/**
 * @returns `null` if the text does not look like tiered goals (no tier keywords) — render as a single block.
 * Otherwise returns one entry per tier segment (from `;` or newlines).
 */
/**
 * Remove duplicate wording already shown in the tier badge ("Goal:", "Beginner:", etc.).
 */
export function tierLineDisplayBody(line: string): string {
  let s = line.trim();
  let prev = "";
  while (s !== prev && s.length > 0) {
    prev = s;
    s = s.replace(/^goal\s*:\s*/i, "").trim();
    s = s.replace(/^(beginner|intermediate|advanced)\s*[:.\-–]\s*/i, "").trim();
  }
  return s || line.trim();
}

export function getTieredGoalItems(
  goal: string | undefined | null
): { line: string; tier: TierLabel }[] | null {
  const t = goal != null ? String(goal).trim() : "";
  if (!t) return null;
  if (!TIER_KEYWORD_RE.test(t)) return null;

  let parts: string[] = [];
  if (t.includes(";")) {
    parts = t
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    parts = t
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (parts.length === 0) {
    return [{ line: t, tier: detectTierInLine(t) }];
  }
  return parts.map((line) => ({ line, tier: detectTierInLine(line) }));
}
