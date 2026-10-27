/** Metres, local hole coords: tee near origin, play roughly +Y toward green. */

export type PlayerMode = "launch_monitor" | "arcade";

export type TerrainKind =
  | "tee"
  | "fairway"
  | "rough"
  | "heavy"
  | "green"
  | "bunker"
  | "water";

export type ClubId =
  | "driver"
  | "3w"
  | "5w"
  | "hybrid"
  | "4i"
  | "5i"
  | "6i"
  | "7i"
  | "8i"
  | "9i"
  | "pw"
  | "gw"
  | "sw"
  | "lw"
  | "putter";

export type Vec2 = { x: number; y: number };

export type TerrainZone = {
  id: string;
  kind: TerrainKind;
  /** Closed polygon in metres (clockwise or CCW). */
  polygon: Vec2[];
};

export type HoleData = {
  id: string;
  number: number;
  name: string;
  par: number;
  /** Scorecard metres (championship / typical). */
  yardageM: number;
  description: string;
  tee: Vec2;
  pin: Vec2;
  /** World bounds for camera framing (metres). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  zones: TerrainZone[];
};

export type LieKind = Exclude<TerrainKind, "tee"> | "tee" | "oob";

export type ShotData = {
  id: string;
  club: ClubId;
  from: Vec2;
  to: Vec2;
  /** Carry landing before bounce/roll. */
  carryLand: Vec2;
  carryM: number;
  offlineM: number;
  lieAfter: LieKind;
  strokesAdded: number;
  note?: string;
};

export type HoleRoundState = {
  holeId: string;
  ball: Vec2;
  lie: LieKind;
  strokes: number;
  shots: ShotData[];
  holed: boolean;
  /** Pending putt distance on green (m), null if not putting UI. */
  puttRemainM: number | null;
};

export const CLUBS: readonly {
  id: ClubId;
  label: string;
  /** Typical max carry (m) for arcade aim scale. */
  typicalCarryM: number;
}[] = [
  { id: "driver", label: "Driver", typicalCarryM: 230 },
  { id: "3w", label: "3-Wood", typicalCarryM: 210 },
  { id: "5w", label: "5-Wood", typicalCarryM: 195 },
  { id: "hybrid", label: "Hybrid", typicalCarryM: 185 },
  { id: "4i", label: "4-Iron", typicalCarryM: 175 },
  { id: "5i", label: "5-Iron", typicalCarryM: 165 },
  { id: "6i", label: "6-Iron", typicalCarryM: 155 },
  { id: "7i", label: "7-Iron", typicalCarryM: 145 },
  { id: "8i", label: "8-Iron", typicalCarryM: 135 },
  { id: "9i", label: "9-Iron", typicalCarryM: 125 },
  { id: "pw", label: "PW", typicalCarryM: 115 },
  { id: "gw", label: "GW", typicalCarryM: 100 },
  { id: "sw", label: "SW", typicalCarryM: 85 },
  { id: "lw", label: "LW", typicalCarryM: 70 },
  { id: "putter", label: "Putter", typicalCarryM: 20 },
] as const;

/** Modern golf-game terrain palette (soft, realistic). */
export const TERRAIN_FILL: Record<TerrainKind, string> = {
  tee: "#6a9a4e",
  fairway: "#5cb85a",
  rough: "#3d7a3a",
  heavy: "#2a5528",
  green: "#8fd98a",
  bunker: "#d4b896",
  water: "#3a9fd9",
};

export const TERRAIN_STROKE: Record<TerrainKind, string> = {
  tee: "#4a7a38",
  fairway: "#3d9a48",
  rough: "#2d5e2a",
  heavy: "#1a3a18",
  green: "#5cb860",
  bunker: "#b89a6e",
  water: "#1e6fa8",
};

export const TERRAIN_LABEL: Record<LieKind, string> = {
  tee: "Tee",
  fairway: "Fairway",
  rough: "Rough",
  heavy: "Heavy rough",
  green: "Green",
  bunker: "Bunker",
  water: "Hazard",
  oob: "Out of bounds",
};
