/**
 * Par 2 scorecard games. "Par 2 18 holes scoring" (CHIP-P218-023) and "Par 2 9 holes scoring" (CHIP-P29H-024):
 * short chips up to 30m. "Up and down 9 holes" (BUNK-UPDW-088): bunker shots from different lies.
 * Up and down is a par, holing the first shot is a birdie. Lowest total wins.
 */

export const PAR2_18_DRILL_KEY = "CHIP-P218-023";
export const PAR2_9_DRILL_KEY = "CHIP-P29H-024";
export const BUNKER_UP_DOWN_DRILL_KEY = "BUNK-UPDW-088";
export const PAR2_HOLE_PAR = 2;
export const PAR2_SCORE_TYPE = "strokes: strokes";
export const PAR2_STROKE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

export type Par2Game = {
  holes: 18 | 9;
  title: string;
  /** What a birdie is called, e.g. "Chip in". */
  birdie: string;
  birdies: string;
};

const CHIP = { birdie: "Chip in", birdies: "Chip ins" };

export function par2Game(drillKey: string | null | undefined): Par2Game | null {
  if (drillKey === PAR2_18_DRILL_KEY) return { holes: 18, title: "Par 2 · 18 holes", ...CHIP };
  if (drillKey === PAR2_9_DRILL_KEY) return { holes: 9, title: "Par 2 · 9 holes", ...CHIP };
  if (drillKey === BUNKER_UP_DOWN_DRILL_KEY) {
    return { holes: 9, title: "Bunker up & down · 9 holes", birdie: "Holed out", birdies: "Hole outs" };
  }
  return null;
}

export function toParText(diff: number): string {
  return diff === 0 ? "E" : diff > 0 ? `+${diff}` : String(diff);
}

export function strokeLabel(strokes: number, birdie: string): string {
  if (strokes === 1) return birdie;
  if (strokes === 2) return "Up & down";
  if (strokes === 3) return "Bogey";
  if (strokes === 4) return "Double";
  return strokes === 5 ? "Triple" : "Quad+";
}

export type Par2Details = { kind: "par2_scorecard"; holes: number[] };

export function par2Summary(holes: number[]) {
  const total = holes.reduce((sum, s) => sum + s, 0);
  return {
    total,
    toPar: total - holes.length * PAR2_HOLE_PAR,
    birdies: holes.filter((s) => s === 1).length,
    upAndDowns: holes.filter((s) => s <= PAR2_HOLE_PAR).length,
  };
}
