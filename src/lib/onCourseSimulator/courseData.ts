import type { HoleData, Vec2 } from "./types";

function strip(points: Vec2[]): Vec2[] {
  return points;
}

/**
 * Stylised top-down layouts of Stonecutters Ridge (Greg Norman Design).
 * Coords in metres; tee ≈ (0,0), play +Y.
 */
export const STONECUTTERS_HOLES: HoleData[] = [
  {
    id: "scr-1",
    number: 1,
    name: "Opening Dogleg",
    par: 5,
    yardageM: 495,
    description: "Dogleg left par 5 — corner bunkers left; deep greenside traps.",
    tee: { x: 0, y: 0 },
    pin: { x: -70, y: 480 },
    bounds: { minX: -130, maxX: 70, minY: -30, maxY: 530 },
    zones: [
      {
        id: "h1-tee",
        kind: "tee",
        polygon: strip([
          { x: -9, y: -6 },
          { x: 9, y: -6 },
          { x: 9, y: 8 },
          { x: -9, y: 8 },
        ]),
      },
      {
        id: "h1-fw",
        kind: "fairway",
        polygon: strip([
          { x: -18, y: 12 },
          { x: 18, y: 12 },
          { x: 22, y: 140 },
          { x: 5, y: 250 },
          { x: -35, y: 340 },
          { x: -65, y: 420 },
          { x: -85, y: 460 },
          { x: -95, y: 455 },
          { x: -75, y: 400 },
          { x: -45, y: 320 },
          { x: -15, y: 240 },
          { x: -8, y: 140 },
        ]),
      },
      {
        id: "h1-rough-r",
        kind: "rough",
        polygon: strip([
          { x: 18, y: 12 },
          { x: 55, y: 20 },
          { x: 60, y: 200 },
          { x: 40, y: 380 },
          { x: -20, y: 510 },
          { x: -70, y: 520 },
          { x: -85, y: 460 },
          { x: -65, y: 420 },
          { x: -35, y: 340 },
          { x: 5, y: 250 },
          { x: 22, y: 140 },
        ]),
      },
      {
        id: "h1-rough-l",
        kind: "rough",
        polygon: strip([
          { x: -18, y: 12 },
          { x: -8, y: 140 },
          { x: -15, y: 240 },
          { x: -45, y: 320 },
          { x: -75, y: 400 },
          { x: -95, y: 455 },
          { x: -120, y: 500 },
          { x: -125, y: 40 },
          { x: -55, y: 15 },
        ]),
      },
      {
        id: "h1-heavy",
        kind: "heavy",
        polygon: strip([
          { x: -110, y: 200 },
          { x: -75, y: 210 },
          { x: -80, y: 290 },
          { x: -115, y: 280 },
        ]),
      },
      {
        id: "h1-bunker-corner",
        kind: "bunker",
        polygon: strip([
          { x: -52, y: 255 },
          { x: -28, y: 262 },
          { x: -32, y: 288 },
          { x: -56, y: 280 },
        ]),
      },
      {
        id: "h1-bunker-green-l",
        kind: "bunker",
        polygon: strip([
          { x: -108, y: 458 },
          { x: -90, y: 462 },
          { x: -92, y: 485 },
          { x: -110, y: 480 },
        ]),
      },
      {
        id: "h1-bunker-green-r",
        kind: "bunker",
        polygon: strip([
          { x: -58, y: 465 },
          { x: -38, y: 470 },
          { x: -42, y: 492 },
          { x: -62, y: 486 },
        ]),
      },
      {
        id: "h1-green",
        kind: "green",
        polygon: strip([
          { x: -98, y: 455 },
          { x: -52, y: 462 },
          { x: -48, y: 498 },
          { x: -75, y: 508 },
          { x: -102, y: 490 },
        ]),
      },
    ],
  },
  {
    id: "scr-6",
    number: 6,
    name: "Wetland Carry",
    par: 3,
    yardageM: 165,
    description: "Signature par 3 — carry the creek to an angled green.",
    tee: { x: 0, y: 0 },
    pin: { x: 18, y: 158 },
    bounds: { minX: -55, maxX: 70, minY: -25, maxY: 205 },
    zones: [
      {
        id: "h6-tee",
        kind: "tee",
        polygon: strip([
          { x: -7, y: -5 },
          { x: 7, y: -5 },
          { x: 7, y: 6 },
          { x: -7, y: 6 },
        ]),
      },
      {
        id: "h6-water",
        kind: "water",
        polygon: strip([
          { x: -45, y: 55 },
          { x: 55, y: 70 },
          { x: 50, y: 125 },
          { x: -40, y: 110 },
        ]),
      },
      {
        id: "h6-rough",
        kind: "rough",
        polygon: strip([
          { x: -40, y: 5 },
          { x: 40, y: 5 },
          { x: 55, y: 55 },
          { x: 60, y: 180 },
          { x: -45, y: 185 },
          { x: -48, y: 50 },
        ]),
      },
      {
        id: "h6-fw-apron",
        kind: "fairway",
        polygon: strip([
          { x: -5, y: 115 },
          { x: 35, y: 125 },
          { x: 40, y: 145 },
          { x: 0, y: 140 },
        ]),
      },
      {
        id: "h6-bunker-front",
        kind: "bunker",
        polygon: strip([
          { x: 5, y: 132 },
          { x: 28, y: 136 },
          { x: 26, y: 148 },
          { x: 4, y: 144 },
        ]),
      },
      {
        id: "h6-bunker-back",
        kind: "bunker",
        polygon: strip([
          { x: 22, y: 168 },
          { x: 42, y: 172 },
          { x: 40, y: 185 },
          { x: 20, y: 180 },
        ]),
      },
      {
        id: "h6-green",
        kind: "green",
        polygon: strip([
          { x: 0, y: 142 },
          { x: 42, y: 148 },
          { x: 45, y: 175 },
          { x: 15, y: 182 },
          { x: -5, y: 165 },
        ]),
      },
    ],
  },
  {
    id: "scr-18",
    number: 18,
    name: "Clubhouse Closer",
    par: 4,
    yardageM: 420,
    description: "Long finishing par 4 — water flanks the left toward the clubhouse.",
    tee: { x: 0, y: 0 },
    pin: { x: 8, y: 408 },
    bounds: { minX: -85, maxX: 85, minY: -25, maxY: 455 },
    zones: [
      {
        id: "h18-tee",
        kind: "tee",
        polygon: strip([
          { x: -9, y: -6 },
          { x: 9, y: -6 },
          { x: 9, y: 8 },
          { x: -9, y: 8 },
        ]),
      },
      {
        id: "h18-water",
        kind: "water",
        polygon: strip([
          { x: -80, y: 140 },
          { x: -26, y: 160 },
          { x: -20, y: 300 },
          { x: -30, y: 400 },
          { x: -78, y: 420 },
          { x: -85, y: 170 },
        ]),
      },
      {
        id: "h18-fw",
        kind: "fairway",
        polygon: strip([
          { x: -18, y: 12 },
          { x: 20, y: 12 },
          { x: 28, y: 140 },
          { x: 26, y: 260 },
          { x: 20, y: 360 },
          { x: 5, y: 395 },
          { x: -12, y: 385 },
          { x: -16, y: 260 },
          { x: -14, y: 140 },
        ]),
      },
      {
        id: "h18-rough-r",
        kind: "rough",
        polygon: strip([
          { x: 20, y: 12 },
          { x: 65, y: 30 },
          { x: 75, y: 250 },
          { x: 60, y: 430 },
          { x: 5, y: 440 },
          { x: 5, y: 395 },
          { x: 20, y: 360 },
          { x: 26, y: 260 },
          { x: 28, y: 140 },
        ]),
      },
      {
        id: "h18-rough-l",
        kind: "rough",
        polygon: strip([
          { x: -18, y: 12 },
          { x: -14, y: 140 },
          { x: -16, y: 260 },
          { x: -12, y: 385 },
          { x: -26, y: 405 },
          { x: -26, y: 160 },
          { x: -40, y: 30 },
        ]),
      },
      {
        id: "h18-heavy",
        kind: "heavy",
        polygon: strip([
          { x: 40, y: 200 },
          { x: 72, y: 210 },
          { x: 70, y: 280 },
          { x: 38, y: 270 },
        ]),
      },
      {
        id: "h18-bunker-fairway",
        kind: "bunker",
        polygon: strip([
          { x: 16, y: 245 },
          { x: 36, y: 250 },
          { x: 34, y: 272 },
          { x: 14, y: 266 },
        ]),
      },
      {
        id: "h18-bunker-green",
        kind: "bunker",
        polygon: strip([
          { x: 16, y: 388 },
          { x: 36, y: 392 },
          { x: 34, y: 415 },
          { x: 14, y: 410 },
        ]),
      },
      {
        id: "h18-green",
        kind: "green",
        polygon: strip([
          { x: -14, y: 385 },
          { x: 26, y: 390 },
          { x: 30, y: 425 },
          { x: 0, y: 435 },
          { x: -18, y: 415 },
        ]),
      },
    ],
  },
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
