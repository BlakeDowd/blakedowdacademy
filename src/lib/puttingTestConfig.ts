export const puttingTestConfig = {
  distances: [3, 3, 4, 4, 5, 6, 8, 8, 10, 12, 12, 15, 18, 20, 25, 30, 35, 40],
  shapes: ["Straight", "Left-to-Right", "Right-to-Left"],
  points: {
    make: 10,
    highLong: 5,
    highShort: 2,
    lowLong: -2,
    lowShort: -5,
    threePutt: -10,
  },
  benchmarks: {
    scratchPoints: 120,
    scratchPutts: 31,
  },
} as const;

export type PuttingTestConfig = typeof puttingTestConfig;
