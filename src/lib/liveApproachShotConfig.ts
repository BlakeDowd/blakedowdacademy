/** Approach shot UI + persisted fields for Live Entry (Shot 2+). */

export const LIVE_APPROACH_CLUB_OPTIONS = [
  "Driver",
  "2W",
  "3W",
  "4W",
  "5W",
  "7W",
  "9W",
  "2H",
  "3H",
  "Hybrid",
  "4H",
  "5H",
  "6H",
  "7H",
  "8H",
  "Driving Iron",
  "2i",
  "3i",
  "4i",
  "5i",
  "6i",
  "7i",
  "8i",
  "9i",
  "PW",
  "GW",
  "AW",
  "SW",
  "LW",
  "48°",
  "50°",
  "52°",
  "54°",
  "56°",
  "58°",
  "60°",
] as const;

export type LiveApproachShotDirection =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "gir"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type LiveNotPossibleReason = "out_of_range" | "lay_up" | "recovery_shot";

export const LIVE_APPROACH_MATRIX_ROWS: LiveApproachShotDirection[][] = [
  ["top-left", "top", "top-right"],
  ["left", "gir", "right"],
  ["bottom-left", "bottom", "bottom-right"],
];

export const LIVE_NOT_POSSIBLE_REASONS: {
  id: LiveNotPossibleReason;
  label: string;
}[] = [
  { id: "out_of_range", label: "Out of range" },
  { id: "lay_up", label: "Lay up" },
  { id: "recovery_shot", label: "Recovery shot" },
];

export function formatLiveApproachDirection(
  direction: LiveApproachShotDirection | null | undefined,
): string {
  if (!direction) return "";
  if (direction === "gir") return "On target";
  return direction.replace(/-/g, " ");
}

export function formatLiveNotPossibleReason(
  reason: LiveNotPossibleReason | null | undefined,
): string {
  if (!reason) return "";
  return LIVE_NOT_POSSIBLE_REASONS.find((r) => r.id === reason)?.label ?? reason;
}

export type LiveGreenHitResult = "yes" | "no" | "not_possible" | "short_sided";

export function formatLiveGreenHit(
  greenHit: LiveGreenHitResult | null | undefined,
  notPossibleReason?: LiveNotPossibleReason | null,
): string {
  if (!greenHit) return "";
  if (greenHit === "yes") return "Green";
  if (greenHit === "not_possible") {
    return formatLiveNotPossibleReason(notPossibleReason) || "Not possible";
  }
  if (greenHit === "short_sided") return "Short sided";
  return "Missed";
}
