/** Max possible points if every first putt is made (10 pts × holes). */
export const PUTTING_TEST_MAX_POINTS = {
  9: 90,
  10: 100,
  /** 8–20 ft test: 10 holes × 10 pts */
  "8to20": 100,
  /** 20–40 ft lag test: 10 holes × 10 pts */
  "20to40": 100,
  18: 180,
} as const;

/** Approximate PGA Tour average score for each test format (points). */
export const PUTTING_TEST_PGA_TOUR_AVERAGE_POINTS = {
  9: 76,
  10: 94,
  "8to20": 82,
  "20to40": 68,
  18: 152,
} as const;

export type PuttingTestGradeVariant = keyof typeof PUTTING_TEST_MAX_POINTS;

export function getPuttingTestSkillGrade(
  points: number,
  variant: PuttingTestGradeVariant,
): { grade: string; showTrophy: boolean } {
  if (variant === "8to20") {
    if (points >= 85) return { grade: "Tour Pro", showTrophy: true };
    if (points >= 72) return { grade: "Scratch", showTrophy: true };
    if (points >= 55) return { grade: "Single Digit", showTrophy: false };
    if (points >= 35) return { grade: "Mid-Handicap", showTrophy: false };
    return { grade: "Needs Work", showTrophy: false };
  }
  if (variant === "20to40") {
    if (points >= 70) return { grade: "Tour Pro", showTrophy: true };
    if (points >= 58) return { grade: "Scratch", showTrophy: true };
    if (points >= 42) return { grade: "Single Digit", showTrophy: false };
    if (points >= 22) return { grade: "Mid-Handicap", showTrophy: false };
    return { grade: "Needs Work", showTrophy: false };
  }
  if (variant === 10) {
    if (points >= 95) return { grade: "Tour Pro", showTrophy: true };
    if (points >= 85) return { grade: "Scratch", showTrophy: true };
    if (points >= 70) return { grade: "Single Digit", showTrophy: false };
    if (points >= 50) return { grade: "Mid-Handicap", showTrophy: false };
    return { grade: "Needs Work", showTrophy: false };
  }
  if (variant === 9) {
    if (points >= 73) return { grade: "Tour Pro", showTrophy: true };
    if (points >= 60) return { grade: "Scratch", showTrophy: true };
    if (points >= 45) return { grade: "Single Digit", showTrophy: false };
    if (points >= 25) return { grade: "Mid-Handicap", showTrophy: false };
    return { grade: "Needs Work", showTrophy: false };
  }
  if (points >= 145) return { grade: "Tour Pro", showTrophy: true };
  if (points >= 120) return { grade: "Scratch", showTrophy: true };
  if (points >= 90) return { grade: "Single Digit", showTrophy: false };
  if (points >= 50) return { grade: "Mid-Handicap", showTrophy: false };
  return { grade: "Needs Work", showTrophy: false };
}
