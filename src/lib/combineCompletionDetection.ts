import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { teeShotSimConfig } from "@/lib/teeShotSimConfig";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";
import { survival20Config } from "@/lib/survival20Config";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { ironSafeSideConfig } from "@/lib/ironSafeSideConfig";
import { ironFadeDrawConfig } from "@/lib/ironFadeDrawConfig";
import { teeShotHazardConfig } from "@/lib/teeShotHazardConfig";
import { driverFlightTestConfig } from "@/lib/driverFlightTestConfig";
import { bunkerLiesConfig } from "@/lib/bunkerLiesConfig";
import { mobilityScreenConfig } from "@/lib/mobilityScreenConfig";
import { approachShotSimConfig } from "@/lib/approachShotSimConfig";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import {
  clusteredPuttingSessionTotals,
  isCompletePutting9Session,
  isCompletePuttingCombineSession,
  isCompletePuttingTest3To6ftSession,
  isCompletePuttingTest8To20Session,
  isCompletePuttingTest20To40Session,
  parsePutting9HoleSession,
  parsePuttingHoleSession,
  parsePuttingTest3To6ftSession,
  parsePuttingTest8To20Session,
  parsePuttingTest20To40Session,
  type ParsedPuttingHole,
} from "@/lib/puttingTestLeaderboard";

/** `log_type` values written to `practice_logs` by combine protocol runners (leaderboard + completion stats). */
export const COMBINE_PRACTICE_LOG_TYPE_VALUES: readonly string[] = [
  // Retired combine; old sessions still count as completions.
  "gauntlet_protocol_session",
  ironPrecisionProtocolConfig.practiceLogType,
  // Legacy iron protocol identifier kept for backward compatibility.
  "ironPrecisionProtocol",
  startLineAndSpeedControlTestConfig.practiceLogType,
  strikeAndSpeedControlTestConfig.practiceLogType,
  flopShotCombineConfig.practiceLogType,
  standardChippingCombineConfig.practiceLogType,
  survival20Config.practiceLogType,
  ironFaceControlConfig.practiceLogType,
  ironSafeSideConfig.practiceLogType,
  ironFadeDrawConfig.practiceLogType,
  approachShotSimConfig.practiceLogType,
  teeShotHazardConfig.practiceLogType,
  driverFlightTestConfig.practiceLogType,
  bunkerLiesConfig.practiceLogType,
  mobilityScreenConfig.practiceLogType,
  threeStrikesWedgeConfig.practiceLogType,
  bunkerProximityProtocolConfig.practiceLogType,
  teeShotSimConfig.practiceLogType,
  "iron_skills",
];

/** practice_logs rows written when a protocol-style combine is finished */
const COMBINE_PRACTICE_LOG_TYPES = new Set<string>(COMBINE_PRACTICE_LOG_TYPE_VALUES);

/** practice table rows that store test_type for leaderboard-driven combines */
const COMBINE_PRACTICE_TEST_TYPES = new Set<string>([
  aimpoint6ftCombineConfig.testType,
  midRangeSlopeSensingConfig.testType,
  aimpointLongRange2040Config.testType,
  chippingCombine9Config.testType,
  wedgeLateral9Config.testType,
  teeShotDispersionCombineConfig.testType,
  bunker9HoleChallengeConfig.testType,
]);

/** User-facing labels for success history (avoid raw DB identifiers in UI). */
const COMBINE_LOG_TYPE_LABELS: Record<string, string> = {
  gauntlet_protocol_session: "The Gauntlet Precision Protocol",
  [ironPrecisionProtocolConfig.practiceLogType]: ironPrecisionProtocolConfig.testName,
  ironPrecisionProtocol: ironPrecisionProtocolConfig.testName,
  [startLineAndSpeedControlTestConfig.practiceLogType]: startLineAndSpeedControlTestConfig.testName,
  [strikeAndSpeedControlTestConfig.practiceLogType]: strikeAndSpeedControlTestConfig.testName,
  [flopShotCombineConfig.practiceLogType]: flopShotCombineConfig.testName,
  [standardChippingCombineConfig.practiceLogType]: standardChippingCombineConfig.testName,
  [survival20Config.practiceLogType]: survival20Config.testName,
  [ironFaceControlConfig.practiceLogType]: ironFaceControlConfig.testName,
  [ironSafeSideConfig.practiceLogType]: ironSafeSideConfig.testName,
  [ironFadeDrawConfig.practiceLogType]: ironFadeDrawConfig.testName,
  [approachShotSimConfig.practiceLogType]: approachShotSimConfig.testName,
  [teeShotHazardConfig.practiceLogType]: teeShotHazardConfig.testName,
  [driverFlightTestConfig.practiceLogType]: driverFlightTestConfig.testName,
  [bunkerLiesConfig.practiceLogType]: bunkerLiesConfig.testName,
  [mobilityScreenConfig.practiceLogType]: mobilityScreenConfig.testName,
  [threeStrikesWedgeConfig.practiceLogType]: threeStrikesWedgeConfig.testName,
  [bunkerProximityProtocolConfig.practiceLogType]: bunkerProximityProtocolConfig.testName,
  [teeShotSimConfig.practiceLogType]: teeShotSimConfig.testName,
  iron_skills: "Iron Skills Challenge",
};

const COMBINE_TEST_TYPE_LABELS: Record<string, string> = {
  [aimpoint6ftCombineConfig.testType]: aimpoint6ftCombineConfig.testName,
  [midRangeSlopeSensingConfig.testType]: midRangeSlopeSensingConfig.testName,
  [aimpointLongRange2040Config.testType]: aimpointLongRange2040Config.testName,
  [chippingCombine9Config.testType]: chippingCombine9Config.testName,
  [wedgeLateral9Config.testType]: wedgeLateral9Config.testName,
  [teeShotDispersionCombineConfig.testType]: teeShotDispersionCombineConfig.testName,
  [bunker9HoleChallengeConfig.testType]: bunker9HoleChallengeConfig.testName,
};

type PuttingCombineFormat = {
  practiceType: string;
  label: string;
  parse: (row: unknown) => ParsedPuttingHole | null;
  isComplete: (holes: ParsedPuttingHole[]) => boolean;
};

const PUTTING_COMBINE_FORMATS: PuttingCombineFormat[] = [
  {
    practiceType: "PuttingCombine",
    label: "Putting Combine",
    parse: parsePuttingHoleSession,
    isComplete: isCompletePuttingCombineSession,
  },
  {
    practiceType: puttingTest9Config.practiceType,
    label: puttingTest9Config.testName,
    parse: parsePutting9HoleSession,
    isComplete: isCompletePutting9Session,
  },
  {
    practiceType: puttingTest3To6ftConfig.practiceType,
    label: puttingTest3To6ftConfig.testName,
    parse: parsePuttingTest3To6ftSession,
    isComplete: isCompletePuttingTest3To6ftSession,
  },
  {
    practiceType: puttingTest8To20Config.practiceType,
    label: puttingTest8To20Config.testName,
    parse: parsePuttingTest8To20Session,
    isComplete: isCompletePuttingTest8To20Session,
  },
  {
    practiceType: puttingTest20To40Config.practiceType,
    label: puttingTest20To40Config.testName,
    parse: parsePuttingTest20To40Session,
    isComplete: isCompletePuttingTest20To40Session,
  },
];

export type CombineCompletionStats = {
  userId?: string;
  practiceSessions?: any[] | null;
  practiceLogs?: any[] | null;
};

function rowForUser(row: { user_id?: string | null }, uid: string | undefined): boolean {
  if (!uid) return true;
  return row.user_id === uid;
}

/**
 * Logged combine completions: protocol rows in practice_logs, session rows in practice
 * with a known combine test_type, and complete putting-test hole clusters.
 */
export function listUserCombineCompletionEvents(stats: CombineCompletionStats): {
  at: string;
  label: string;
  userId?: string;
}[] {
  const uid = stats.userId;
  const out: { at: string; label: string; userId?: string }[] = [];

  for (const row of stats.practiceLogs || []) {
    if (!row || typeof row !== "object") continue;
    if (!rowForUser(row as { user_id?: string }, uid)) continue;
    const lt = String((row as { log_type?: string }).log_type || "");
    if (COMBINE_PRACTICE_LOG_TYPES.has(lt)) {
      const at = String((row as { created_at?: string }).created_at || "");
      out.push({
        at,
        label: COMBINE_LOG_TYPE_LABELS[lt] ?? "Combine session",
        userId: (row as { user_id?: string }).user_id,
      });
    }
  }

  for (const row of stats.practiceSessions || []) {
    if (!row || typeof row !== "object") continue;
    if (!rowForUser(row as { user_id?: string }, uid)) continue;
    const tt = String((row as { test_type?: string }).test_type || "");
    if (COMBINE_PRACTICE_TEST_TYPES.has(tt)) {
      const r = row as { completed_at?: string; created_at?: string };
      const at = String(r.completed_at || r.created_at || "");
      out.push({
        at,
        label: COMBINE_TEST_TYPE_LABELS[tt] ?? "Combine session",
        userId: (row as { user_id?: string }).user_id,
      });
    }
  }

  // Putting combines store one practice row per hole (JSON notes, no test_type).
  for (const format of PUTTING_COMBINE_FORMATS) {
    const holes: ParsedPuttingHole[] = [];
    for (const row of stats.practiceSessions || []) {
      if (!row || typeof row !== "object") continue;
      if (!rowForUser(row as { user_id?: string }, uid)) continue;
      const type = String((row as { type?: string }).type || "");
      if (type !== format.practiceType) continue;
      const hole = format.parse(row);
      if (hole) holes.push(hole);
    }
    for (const session of clusteredPuttingSessionTotals(holes, format.isComplete)) {
      out.push({
        at: new Date(session.sessionEndMs).toISOString(),
        label: format.label,
        userId: uid,
      });
    }
  }

  return out.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

export function countUserCombineCompletions(stats: CombineCompletionStats): number {
  return listUserCombineCompletionEvents(stats).length;
}
