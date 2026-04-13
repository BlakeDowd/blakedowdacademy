/**
 * 9-Hole Bunker Challenge — manual carry per shot, proximity-based chip points, vertical strike only,
 * scramble putt audit when not holed.
 */
export const bunker9HoleChallengeConfig = {
  testName: "9-Hole Bunker Challenge",
  testType: "bunker_9_hole_challenge",
  noteKind: "bunker_9_hole_challenge",
  holeCount: 9,
  /** Bonus when the chip is not holed and the player holes the putt. */
  scramblePuttBonus: 10,
} as const;
