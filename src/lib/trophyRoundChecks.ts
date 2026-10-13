import { roundTracksStat, type RoundStatKey } from "@/lib/roundStatTracking";

type RoundRow = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0) || 0;

/** 9-hole rounds would make score and putt targets far too easy. */
export const isFullRound = (r: RoundRow) => num(r.holes ?? 18) >= 18;

/** A stat only counts when the player chose to track it for that round (0 otherwise means "not entered"). */
export const roundTracks = (r: RoundRow, key: RoundStatKey) =>
  roundTracksStat(r as Parameters<typeof roundTracksStat>[0], key);

export const roundNum = num;

/** Single-round trophies: earned by the first logged round that passes. */
export const ROUND_TROPHY_CHECKS: Record<string, (r: RoundRow) => boolean> = {
  "breaking-100": (r) => isFullRound(r) && r.score != null && num(r.score) > 0 && num(r.score) < 100,
  "fairway-finder": (r) => roundTracks(r, "fairways") && num(r.firHit) >= 10,
  "hot-putter": (r) =>
    isFullRound(r) && roundTracks(r, "putts") && num(r.totalPutts) > 0 && num(r.totalPutts) <= 28,
  "clean-card": (r) =>
    isFullRound(r) &&
    roundTracks(r, "distribution") &&
    num(r.doubleBogeys) === 0 &&
    num(r.eagles) + num(r.birdies) + num(r.pars) + num(r.bogeys) >= 18,
};
