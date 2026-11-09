/** Alternate tee height (DRIV-ALTH-027): app calls a tee height; player taps Made / Missed. */

export const ALTERNATE_TEE_HEIGHT_DRILL_KEY = "DRIV-ALTH-027";
export const ALTERNATE_TEE_HEIGHT_DRILL_ID = "9fc85fdf-bc19-4152-8b81-1cdf3c70bb41";

export const TEE_HEIGHTS = [
  { id: "ground", label: "Off the ground", hint: "Ball sitting on the turf — no tee" },
  { id: "low", label: "Low tee", hint: "Top of the ball about level with the crown" },
  { id: "mid", label: "Mid tee", hint: "About half the ball above the crown" },
  { id: "high", label: "High tee", hint: "Most of the ball above the crown" },
  { id: "very_high", label: "Very high", hint: "Tee fully exposed under the ball" },
] as const;

export type TeeHeightId = (typeof TEE_HEIGHTS)[number]["id"];
export type TeeHeight = (typeof TEE_HEIGHTS)[number];

/** Each height twice, shuffled — 10 shots total. */
export const ALTERNATE_TEE_SHOTS = TEE_HEIGHTS.length * 2;
export const ALTERNATE_TEE_SCORE_TYPE = `makes/${ALTERNATE_TEE_SHOTS}`;

export type TeeShotResult = "make" | "miss";

export type AlternateTeeShot = {
  height: TeeHeightId;
  label: string;
  result: TeeShotResult;
};

export type AlternateTeeDetails = {
  kind: "alternate_tee_height";
  shots: AlternateTeeShot[];
};

export function teeHeightById(id: TeeHeightId): TeeHeight {
  return TEE_HEIGHTS.find((h) => h.id === id) ?? TEE_HEIGHTS[2]!;
}

/** Each height twice, random order (no three identical heights in a row). */
export function buildAlternateTeeSequence(random: () => number = Math.random): TeeHeightId[] {
  const pool: TeeHeightId[] = TEE_HEIGHTS.flatMap((h) => [h.id, h.id]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  // Light reshuffle if we still have a triple streak.
  for (let pass = 0; pass < 8; pass++) {
    let fixed = false;
    for (let i = 2; i < pool.length; i++) {
      if (pool[i] === pool[i - 1] && pool[i] === pool[i - 2]) {
        const swapWith = (i + 1 + Math.floor(random() * (pool.length - i - 1))) % pool.length;
        if (swapWith !== i) {
          [pool[i], pool[swapWith]] = [pool[swapWith]!, pool[i]!];
          fixed = true;
        }
      }
    }
    if (!fixed) break;
  }
  return pool;
}

export function alternateTeeDetails(shots: AlternateTeeShot[]): AlternateTeeDetails {
  return { kind: "alternate_tee_height", shots };
}

/** Per-height make rate for the session summary. */
export function teeHeightBreakdown(shots: AlternateTeeShot[]): {
  id: TeeHeightId;
  label: string;
  made: number;
  total: number;
}[] {
  return TEE_HEIGHTS.map((h) => {
    const at = shots.filter((s) => s.height === h.id);
    return {
      id: h.id,
      label: h.label,
      made: at.filter((s) => s.result === "make").length,
      total: at.length,
    };
  });
}
