/** Low Chip combine — 5 / 10 / 20 m stations, five shots each; logged as chipping + sub_type low_chip. */

export const lowChipCombineConfig = {
  testName: "Low Chip Combine",
  practiceLogType: "chipping",
  practiceLogSubType: "low_chip",
  distancesMetres: [5, 10, 20] as const,
  shotsPerDistance: 5,
} as const;
