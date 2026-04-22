export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Progression tier (1–7): how many distinct variable categories are active this session. */
export const IRON_SKILLS_MAX_PROGRESSION_LEVEL = 7 as const;
export const IRON_SKILLS_MIN_PROGRESSION_LEVEL = 1 as const;

/** Seven distinct variable domains (one pool each). */
export const IRON_SKILLS_CATEGORY_IDS = [
  "ball_position",
  "divot_depth",
  "speed",
  "grip_choke",
  "shape",
  "trajectory",
  "strike_location",
] as const;

export type IronSkillsCategoryId = (typeof IRON_SKILLS_CATEGORY_IDS)[number];

export const IRON_SKILLS_CATEGORY_LABELS: Record<IronSkillsCategoryId, string> = {
  ball_position: "Ball Position",
  divot_depth: "Divot Depth",
  speed: "Speed",
  grip_choke: "Grip / Choke",
  shape: "Shape",
  trajectory: "Trajectory",
  strike_location: "Strike Location",
};

export const IRON_SKILLS_POOLS: Record<IronSkillsCategoryId, readonly string[]> = {
  ball_position: ["Lead Foot", "Inside Lead", "Center", "Inside Trail", "Trail Foot"],
  divot_depth: ["No Divot", "Little Divot", "Deep Divot"],
  speed: ["50% Smooth Speed", "75% Controlled Speed", "100% Full Speed"],
  grip_choke: ['1" Grip Down', '2" Grip Down', '4" Choke Down'],
  shape: ["Draw", "Straight", "Fade"],
  trajectory: ["Low Trajectory", "Neutral Trajectory", "High Trajectory"],
  strike_location: ["Toe", "Heel", "Middle"],
};

export type IronSkillsChallengeEntry = {
  categoryKey: IronSkillsCategoryId;
  categoryLabel: string;
  value: string;
};

/** One prescription for the current shot: `entries.length` equals the user's progression level (1–7). */
export type IronSkillsChallenge = {
  entries: IronSkillsChallengeEntry[];
  /** Progression level used to build this challenge (snapshot). */
  progressionLevelUsed: number;
};

/** Display titles for the 7 progression tiers. */
export const IRON_SKILLS_LEVEL_TITLES: Record<number, string> = {
  1: "Foundational",
  2: "Dual Focus",
  3: "Triple Stack",
  4: "Advanced Mix",
  5: "Full Integration",
  6: "Elite Blend",
  7: "Master Challenge",
};

export function ironSkillsLevelTitle(level: number): string {
  const clamped = clampProgressionLevel(level);
  return IRON_SKILLS_LEVEL_TITLES[clamped] ?? IRON_SKILLS_LEVEL_TITLES[1];
}

export function clampProgressionLevel(level: number): number {
  if (!Number.isFinite(level)) return IRON_SKILLS_MIN_PROGRESSION_LEVEL;
  return Math.min(
    IRON_SKILLS_MAX_PROGRESSION_LEVEL,
    Math.max(IRON_SKILLS_MIN_PROGRESSION_LEVEL, Math.floor(level)),
  );
}

/**
 * Pick `count` distinct categories (without replacement). At level 7, all categories are used.
 */
export function pickDistinctCategories(count: number): IronSkillsCategoryId[] {
  const n = clampProgressionLevel(count);
  const pool = [...IRON_SKILLS_CATEGORY_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, n);
  picked.sort(
    (a, b) =>
      IRON_SKILLS_CATEGORY_IDS.indexOf(a) - IRON_SKILLS_CATEGORY_IDS.indexOf(b),
  );
  return picked;
}

/** One random value from the pool for that category. */
export function rollCategoryValue(categoryKey: IronSkillsCategoryId): string {
  return pickRandom(IRON_SKILLS_POOLS[categoryKey]);
}

/**
 * Build one challenge for the user's current progression level:
 * level N → exactly N distinct categories, each with one random value from its pool.
 */
export function generateIronSkillsChallenge(progressionLevel: number): IronSkillsChallenge {
  const level = clampProgressionLevel(progressionLevel);
  const categories = pickDistinctCategories(level);
  const entries: IronSkillsChallengeEntry[] = categories.map((categoryKey) => ({
    categoryKey,
    categoryLabel: IRON_SKILLS_CATEGORY_LABELS[categoryKey],
    value: rollCategoryValue(categoryKey),
  }));
  return { entries, progressionLevelUsed: level };
}

/** Minimum session score (out of 100) to qualify for unlocking the next progression level. */
export const IRON_SKILLS_LEVEL_THRESHOLD = 70;

export const IRON_SKILLS_SESSION_SHOTS = 10;
export const IRON_SKILLS_POINTS_PER_MAKE = 10;
export const IRON_SKILLS_LOG_TYPE = "iron_skills" as const;
