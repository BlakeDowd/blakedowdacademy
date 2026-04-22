import { clampProgressionLevel, IRON_SKILLS_MIN_PROGRESSION_LEVEL } from "@/lib/ironSkillsChallenge";

/** Stored under `profiles.combine_profile` so progression survives login/device. */
export const IRON_SKILLS_PROFILE_KEY = "iron_skills" as const;

export type IronSkillsCombineProfileSlice = {
  /** User-facing progression step 1–7 (challenge complexity). */
  current_level: number;
};

export function parseIronSkillsFromCombineProfile(combineProfile: unknown): IronSkillsCombineProfileSlice | null {
  if (!combineProfile || typeof combineProfile !== "object") return null;
  const raw = (combineProfile as Record<string, unknown>)[IRON_SKILLS_PROFILE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const currentLevel = (raw as { current_level?: unknown }).current_level;
  if (typeof currentLevel !== "number" && typeof currentLevel !== "string") return null;
  const n = typeof currentLevel === "string" ? Number(currentLevel) : currentLevel;
  if (!Number.isFinite(n)) return null;
  return { current_level: clampProgressionLevel(n) };
}

export function mergeIronSkillsIntoCombineProfile(
  existing: Record<string, unknown> | null | undefined,
  slice: IronSkillsCombineProfileSlice,
): Record<string, unknown> {
  const prev = existing && typeof existing === "object" ? { ...existing } : {};
  return {
    ...prev,
    [IRON_SKILLS_PROFILE_KEY]: {
      current_level: clampProgressionLevel(slice.current_level),
    },
  };
}

export function defaultIronSkillsLevel(): number {
  return IRON_SKILLS_MIN_PROGRESSION_LEVEL;
}
