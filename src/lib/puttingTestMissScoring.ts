/**
 * Putting test — first-putt miss scoring from miss category + second-putt distance.
 * Three-putt: hole points are always -10 (overrides category/distance).
 */

export type PuttingTestMissCategory =
  | "highLong"
  | "highShort"
  | "lowLong"
  | "lowShort";

export const PUTTING_TEST_MISS_CATEGORY_LABELS: Record<PuttingTestMissCategory, string> = {
  highLong: "High / Long",
  highShort: "High / Short",
  lowLong: "Low / Long",
  lowShort: "Low / Short",
};

/** Exact three-putt hole score (replaces category + distance logic). */
export const PUTTING_TEST_THREE_PUTT_POINTS = -10;

/**
 * Second putt made: points from category + distance (ft).
 * Second putt missed: fixed -10 for the hole, 3 putts.
 */
export function scorePuttingTestMissHole(input: {
  missCategory: PuttingTestMissCategory;
  secondPuttDistanceFt: number;
  madeSecondPutt: boolean;
}): { points: number; putts: 2 | 3; isThreePutt: boolean } {
  if (!input.madeSecondPutt) {
    return {
      points: PUTTING_TEST_THREE_PUTT_POINTS,
      putts: 3,
      isThreePutt: true,
    };
  }

  const d = input.secondPuttDistanceFt;
  let points: number;
  switch (input.missCategory) {
    case "highLong":
      points = d <= 1.5 ? 8 : 5;
      break;
    case "lowLong":
      points = d <= 1.5 ? 3 : 0;
      break;
    case "highShort":
    case "lowShort":
      points = -5;
      break;
    default:
      points = 0;
  }
  return { points, putts: 2, isThreePutt: false };
}
