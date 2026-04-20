/** Standard Chipping combine — proximity in metres at 5 m, 10 m, 20 m stations (five shots each). */

export const standardChippingCombineConfig = {
  testName: "Standard Chipping",
  practiceLogType: "chipping",
  practiceLogSubType: "standard",
  distancesMetres: [5, 10, 20] as const,
  shotsPerDistance: 5,
} as const;
