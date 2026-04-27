export const bunkerProximityProtocolConfig = {
  testName: "Bunker Proximity Protocol",
  practiceLogType: "bunker_protocol",
  stationDistancesM: [5, 10, 20] as const,
  shotsPerStation: 4,
  maxScore: 120,
} as const;

export type BunkerProximityResultKey =
  | "inside_1m"
  | "inside_3m"
  | "inside_6m"
  | "miss_or_stay_in_sand";

export const BUNKER_PROXIMITY_RESULT_OPTIONS: {
  key: BunkerProximityResultKey;
  label: string;
  points: number;
}[] = [
  { key: "inside_1m", label: "Inside 1m", points: 10 },
  { key: "inside_3m", label: "Inside 3m", points: 5 },
  { key: "inside_6m", label: "Inside 6m", points: 2 },
  { key: "miss_or_stay_in_sand", label: "Miss/Stay in Sand", points: -10 },
];
