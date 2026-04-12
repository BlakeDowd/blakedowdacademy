/**
 * Wedge Lateral Test — nine random full-swing wedge distances (30–100 m).
 * Saved as one `practice` row: test_type wedge_lateral_9, metadata JSONB.
 */
export const wedgeLateral9Config = {
  testName: "Wedge Lateral Test",
  testType: "wedge_lateral_9" as const,
  noteKind: "WedgeLateral9",
  shotCount: 9,
  distanceMinM: 30,
  distanceMaxM: 100,
} as const;
