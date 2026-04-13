import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";

/** `log_type` values written to `practice_logs` by combine protocol runners (leaderboard + completion stats). */
export const COMBINE_PRACTICE_LOG_TYPE_VALUES: readonly string[] = [
  gauntletPrecisionProtocolConfig.practiceLogType,
  ironPrecisionProtocolConfig.practiceLogType,
  startLineAndSpeedControlTestConfig.practiceLogType,
  strikeAndSpeedControlTestConfig.practiceLogType,
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
 * Logged combine completions: protocol rows in practice_logs and session rows in practice
 * with a known combine test_type (per-hole putting tests that only set `type` are excluded).
 */
export function listUserCombineCompletionEvents(stats: CombineCompletionStats): {
  at: string;
  label: string;
}[] {
  const uid = stats.userId;
  const out: { at: string; label: string }[] = [];

  for (const row of stats.practiceLogs || []) {
    if (!row || typeof row !== "object") continue;
    if (!rowForUser(row as { user_id?: string }, uid)) continue;
    const lt = String((row as { log_type?: string }).log_type || "");
    if (COMBINE_PRACTICE_LOG_TYPES.has(lt)) {
      const at = String((row as { created_at?: string }).created_at || "");
      out.push({ at, label: "Combine protocol (practice_logs)" });
    }
  }

  for (const row of stats.practiceSessions || []) {
    if (!row || typeof row !== "object") continue;
    if (!rowForUser(row as { user_id?: string }, uid)) continue;
    const tt = String((row as { test_type?: string }).test_type || "");
    if (COMBINE_PRACTICE_TEST_TYPES.has(tt)) {
      const r = row as { completed_at?: string; created_at?: string };
      const at = String(r.completed_at || r.created_at || "");
      out.push({ at, label: `Combine session (${tt})` });
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
