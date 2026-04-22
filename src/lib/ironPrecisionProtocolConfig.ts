/**
 * Iron Precision Protocol — nine full-swing iron shots: dispersion (fingers), vertical strike, horizontal contact, aim direction.
 * Logged to practice_logs as iron_precision_protocol_session.
 */
export const ironPrecisionProtocolConfig = {
  testName: "The Iron Precision Protocol",
  // Use legacy identifier for compatibility with older DB CHECK constraints.
  practiceLogType: "iron_precision_protocol",
  /** One shot per club, short → long (adjust to your bag). */
  clubSequence: ["PW", "9i", "8i", "7i", "6i", "5i", "4i", "3i", "2i"] as const,
  /** Finger miss width is recorded in half-finger steps from 0 through 4, or "outside". */
  fingerStep: 0.5,
  fingerMax: 4,
} as const;

/** Vertical strike quality (fat / thin / solid). Legacy `clip` in stored JSON maps to solid. */
export type IronStrike = "fat" | "thin" | "solid";

/**
 * Normalizes persisted vertical strike for scoring and leaderboards.
 * Historical rows may contain `clip` (removed from UI); treat as `solid`.
 */
export function normalizeLegacyVerticalStrike(raw: unknown): IronStrike {
  const x = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (x === "clip") return "solid";
  if (x === "fat" || x === "thin" || x === "solid") return x;
  return "solid";
}
export type IronContact = "heel" | "middle" | "toe";

/** Horizontal start-line / aim bias for the shot (finger miss is orthogonal width). */
export type IronMissDirection = "left" | "straight" | "right";
