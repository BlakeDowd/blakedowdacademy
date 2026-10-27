import {
  boundsFromLayout,
  ovalPoly,
  uvPolyToWorld,
  type Uv,
} from "./layoutMap";
import type { HoleData, TerrainZone } from "./types";

type HoleDraft = Omit<HoleData, "bounds" | "zones"> & {
  zoneUvs: { id: string; kind: TerrainZone["kind"]; uvs: Uv[] }[];
};

function withLayoutZones(hole: HoleDraft): HoleData {
  const { zoneUvs, ...rest } = hole;
  const partial: HoleData = {
    ...rest,
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    zones: [],
  };
  const bounds =
    boundsFromLayout(partial) ?? {
      minX: -80,
      maxX: 80,
      minY: -40,
      maxY: hole.yardageM + 40,
    };
  const zones: TerrainZone[] = zoneUvs.map((z) => ({
    id: z.id,
    kind: z.kind,
    polygon: uvPolyToWorld(partial, z.uvs),
  }));
  if (!zones.some((z) => z.kind === "green")) {
    zones.push({
      id: `${hole.id}-green`,
      kind: "green",
      polygon: ovalPoly(hole.pin, hole.par === 3 ? 14 : 16, hole.par === 3 ? 11 : 13),
    });
  }
  return { ...rest, bounds, zones };
}

/**
 * Stonecutters Ridge (Greg Norman Design) — play coords in metres; tee at origin, play +Y.
 * Layout UVs pin the ball to the blue tee and the flag to the green on the official maps.
 */
export const STONECUTTERS_HOLES: HoleData[] = [
  withLayoutZones({
    id: "scr-1",
    number: 1,
    name: "Opening Dogleg",
    par: 5,
    yardageM: 520,
    description: "Par 5 · Blue 520m · White 504m · Gold 464m · Red 443m — dogleg left.",
    layoutImage: "/on-course/map-1.png",
    layoutMapFraction: 1,
    layoutTeeUv: { u: 0.433, v: 0.96 },
    layoutPinUv: { u: 0.44, v: 0.14 },
    tee: { x: 0, y: 0 },
    pin: { x: 0, y: 520 },
    zoneUvs: [
      {
        id: "h1-tee",
        kind: "tee",
        uvs: [
          { u: 0.48, v: 0.94 },
          { u: 0.57, v: 0.94 },
          { u: 0.57, v: 0.99 },
          { u: 0.48, v: 0.99 },
        ],
      },
      {
        id: "h1-fw",
        kind: "fairway",
        uvs: [
          { u: 0.46, v: 0.92 },
          { u: 0.6, v: 0.92 },
          { u: 0.62, v: 0.55 },
          { u: 0.58, v: 0.35 },
          { u: 0.52, v: 0.22 },
          { u: 0.4, v: 0.2 },
          { u: 0.36, v: 0.32 },
          { u: 0.42, v: 0.55 },
        ],
      },
      {
        id: "h1-green",
        kind: "green",
        uvs: [
          { u: 0.4, v: 0.08 },
          { u: 0.58, v: 0.08 },
          { u: 0.6, v: 0.22 },
          { u: 0.4, v: 0.22 },
        ],
      },
      {
        id: "h1-bunker-r",
        kind: "bunker",
        uvs: [
          { u: 0.58, v: 0.48 },
          { u: 0.66, v: 0.48 },
          { u: 0.66, v: 0.56 },
          { u: 0.58, v: 0.56 },
        ],
      },
      {
        id: "h1-bunker-gl",
        kind: "bunker",
        uvs: [
          { u: 0.32, v: 0.16 },
          { u: 0.4, v: 0.16 },
          { u: 0.4, v: 0.24 },
          { u: 0.32, v: 0.24 },
        ],
      },
      {
        id: "h1-bunker-gr",
        kind: "bunker",
        uvs: [
          { u: 0.5, v: 0.15 },
          { u: 0.58, v: 0.15 },
          { u: 0.58, v: 0.23 },
          { u: 0.5, v: 0.23 },
        ],
      },
    ],
  }),
  withLayoutZones({
    id: "scr-6",
    number: 6,
    name: "Wetland Carry",
    par: 3,
    yardageM: 176,
    description: "Par 3 · Blue 176m · White 146m · Gold 137m · Red 110m — water all down the left.",
    layoutImage: "/on-course/map-6.png",
    layoutMapFraction: 1,
    layoutTeeUv: { u: 0.35, v: 0.82 },
    layoutPinUv: { u: 0.48, v: 0.16 },
    tee: { x: 0, y: 0 },
    pin: { x: 0, y: 176 },
    zoneUvs: [
      {
        id: "h6-tee",
        kind: "tee",
        uvs: [
          { u: 0.35, v: 0.81 },
          { u: 0.43, v: 0.81 },
          { u: 0.43, v: 0.88 },
          { u: 0.35, v: 0.88 },
        ],
      },
      {
        id: "h6-water",
        kind: "water",
        uvs: [
          { u: 0.05, v: 0.12 },
          { u: 0.32, v: 0.18 },
          { u: 0.3, v: 0.55 },
          { u: 0.08, v: 0.7 },
          { u: 0.02, v: 0.4 },
        ],
      },
      {
        id: "h6-fw",
        kind: "fairway",
        uvs: [
          { u: 0.34, v: 0.78 },
          { u: 0.48, v: 0.7 },
          { u: 0.52, v: 0.35 },
          { u: 0.5, v: 0.2 },
          { u: 0.36, v: 0.2 },
          { u: 0.34, v: 0.4 },
        ],
      },
      {
        id: "h6-bunker",
        kind: "bunker",
        uvs: [
          { u: 0.3, v: 0.22 },
          { u: 0.4, v: 0.2 },
          { u: 0.42, v: 0.32 },
          { u: 0.3, v: 0.34 },
        ],
      },
      {
        id: "h6-green",
        kind: "green",
        uvs: [
          { u: 0.38, v: 0.1 },
          { u: 0.58, v: 0.1 },
          { u: 0.6, v: 0.24 },
          { u: 0.38, v: 0.24 },
        ],
      },
    ],
  }),
  withLayoutZones({
    id: "scr-18",
    number: 18,
    name: "Clubhouse Closer",
    par: 4,
    yardageM: 415,
    description: "Par 4 · Blue 415m · White 400m · Gold 359m · Red 330m — bunkered green.",
    layoutImage: "/on-course/map-18.png",
    layoutMapFraction: 1,
    layoutTeeUv: { u: 0.5, v: 0.9 },
    layoutPinUv: { u: 0.42, v: 0.1 },
    tee: { x: 0, y: 0 },
    pin: { x: 0, y: 415 },
    zoneUvs: [
      {
        id: "h18-tee",
        kind: "tee",
        uvs: [
          { u: 0.5, v: 0.88 },
          { u: 0.6, v: 0.88 },
          { u: 0.6, v: 0.96 },
          { u: 0.5, v: 0.96 },
        ],
      },
      {
        id: "h18-fw",
        kind: "fairway",
        uvs: [
          { u: 0.48, v: 0.88 },
          { u: 0.62, v: 0.88 },
          { u: 0.6, v: 0.45 },
          { u: 0.55, v: 0.22 },
          { u: 0.4, v: 0.18 },
          { u: 0.38, v: 0.4 },
          { u: 0.44, v: 0.65 },
        ],
      },
      {
        id: "h18-green",
        kind: "green",
        uvs: [
          { u: 0.38, v: 0.05 },
          { u: 0.56, v: 0.05 },
          { u: 0.58, v: 0.18 },
          { u: 0.38, v: 0.18 },
        ],
      },
      {
        id: "h18-bunker-l",
        kind: "bunker",
        uvs: [
          { u: 0.3, v: 0.12 },
          { u: 0.4, v: 0.12 },
          { u: 0.4, v: 0.22 },
          { u: 0.3, v: 0.22 },
        ],
      },
      {
        id: "h18-bunker-r",
        kind: "bunker",
        uvs: [
          { u: 0.52, v: 0.12 },
          { u: 0.6, v: 0.12 },
          { u: 0.6, v: 0.2 },
          { u: 0.52, v: 0.2 },
        ],
      },
    ],
  }),
];

export function holeById(id: string): HoleData {
  return STONECUTTERS_HOLES.find((h) => h.id === id) ?? STONECUTTERS_HOLES[0]!;
}

/** Fit camera so the full hole bounds are visible in the canvas. */
export function cameraForHole(
  hole: HoleData,
  viewW: number,
  viewH: number,
  pad = 0.08,
): { cx: number; cy: number; scale: number } {
  const { minX, maxX, minY, maxY } = hole.bounds;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const worldW = (maxX - minX) * (1 + pad);
  const worldH = (maxY - minY) * (1 + pad);
  const scale = Math.min(viewW / Math.max(worldW, 1), viewH / Math.max(worldH, 1));
  return { cx, cy, scale };
}
