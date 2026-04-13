/**
 * Tee Shot Dispersion Combine — 14 driver shots: direction, finger dispersion, face strike grid.
 */

export const teeShotDispersionCombineConfig = {
  testName: "Tee Shot Dispersion Combine",
  testType: "tee_shot_dispersion_combine",
  noteKind: "tee_shot_dispersion_combine",
  shotCount: 14,
  /** Extra points when strike is Middle / Middle (sweet spot). */
  middleMiddleBonus: 2,
  /**
   * Legacy default carry (m) for docs / migrations; each shot now stores its own carry.
   * Lateral miss uses: |carry × sin((fingers × 2) × π/180)| for numeric dispersion.
   */
  referenceCarryDistanceM: 250,
  /** Valid range for per-shot carry input (meters). */
  minCarryDistanceM: 1,
  maxCarryDistanceM: 400,
} as const;
