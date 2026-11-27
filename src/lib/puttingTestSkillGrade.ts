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

/** Thresholds for the variant, best-first (points needed to hold that label). */
export function puttingGradeThresholds(variant: PuttingTestGradeVariant): {
  grade: string;
  minPoints: number;
}[] {
  if (variant === "8to20") {
    return [
      { grade: "Tour Pro", minPoints: 85 },
      { grade: "Scratch", minPoints: 72 },
      { grade: "Single Digit", minPoints: 55 },
      { grade: "Mid-Handicap", minPoints: 35 },
      { grade: "Needs Work", minPoints: 0 },
    ];
  }
  if (variant === "20to40") {
    return [
      { grade: "Tour Pro", minPoints: 70 },
      { grade: "Scratch", minPoints: 58 },
      { grade: "Single Digit", minPoints: 42 },
      { grade: "Mid-Handicap", minPoints: 22 },
      { grade: "Needs Work", minPoints: 0 },
    ];
  }
  if (variant === 10) {
    return [
      { grade: "Tour Pro", minPoints: 95 },
      { grade: "Scratch", minPoints: 85 },
      { grade: "Single Digit", minPoints: 70 },
      { grade: "Mid-Handicap", minPoints: 50 },
      { grade: "Needs Work", minPoints: 0 },
    ];
  }
  if (variant === 9) {
    return [
      { grade: "Tour Pro", minPoints: 73 },
      { grade: "Scratch", minPoints: 60 },
      { grade: "Single Digit", minPoints: 45 },
      { grade: "Mid-Handicap", minPoints: 25 },
      { grade: "Needs Work", minPoints: 0 },
    ];
  }
  return [
    { grade: "Tour Pro", minPoints: 145 },
    { grade: "Scratch", minPoints: 120 },
    { grade: "Single Digit", minPoints: 90 },
    { grade: "Mid-Handicap", minPoints: 50 },
    { grade: "Needs Work", minPoints: 0 },
  ];
}

/** “Why this grade” for putting combines — same label language as other Academy tests. */
export function explainPuttingTestGrade(
  points: number,
  variant: PuttingTestGradeVariant,
): string {
  const bands = puttingGradeThresholds(variant);
  const { grade } = getPuttingTestSkillGrade(points, variant);
  const idx = bands.findIndex((b) => b.grade === grade);
  const floor = bands[idx]?.minPoints ?? 0;
  const next = idx > 0 ? bands[idx - 1] : null;
  if (!next) {
    return `${grade} — top band (${floor}+ pts). You scored ${Math.round(points)}.`;
  }
  return `${grade} — ${floor}+ pts. You scored ${Math.round(points)}. Need ${next.minPoints} for ${next.grade}.`;
}
