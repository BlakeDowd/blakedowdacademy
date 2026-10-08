"use client";

import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import {
  type AimpointPuttReadings,
  totalPointsSession,
  calibrationScorePercent,
  averageBias,
  readerLabelFromBias,
  captureZonePerceptionMessage,
  avgPointsAt33,
  avgPointsAt66,
} from "@/lib/aimpoint6ftCombineScoring";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { AimpointCombineRunner, type AimpointFormat } from "@/components/combine/AimpointCombineRunner";

/** @returns null on success, or a user-visible error string */
async function persistSession(userId: string, putts: AimpointPuttReadings[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const totalPoints = totalPointsSession(putts);
    const calPct = calibrationScorePercent(totalPoints);
    const bias = averageBias(putts);
    const cap = captureZonePerceptionMessage(putts);
    const aggregates: Record<string, unknown> = {
      total_points: totalPoints,
      calibration_score_pct: calPct,
      avg_bias: bias,
      reader_label: readerLabelFromBias(bias),
      avg_points_33: avgPointsAt33(putts),
      avg_points_66: avgPointsAt66(putts),
      capture_zone_flag: cap != null,
      capture_zone_message: cap,
    };
    const payload = {
      version: 1,
      distance_ft: aimpoint6ftCombineConfig.distanceFt,
      putts,
      aggregates,
    };

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: aimpoint6ftCombineConfig.testType,
      test_type: aimpoint6ftCombineConfig.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: aimpoint6ftCombineConfig.noteKind,
        total_points: totalPoints,
        calibration_score_pct: calPct,
        payload,
      }),
    });
    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[Aimpoint6ftCombine] practice insert:", msg);
      return msg;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[Aimpoint6ftCombine] practice insert failed", msg);
    return msg;
  }
}

const FORMAT: AimpointFormat<AimpointPuttReadings> = {
  title: "6 ft AimPoint Combine",
  chips: [`${aimpoint6ftCombineConfig.puttCount} putts`, "6 ft", "~15 min", "2 reads a putt"],
  marks: ["33", "66"],
  puttCount: aimpoint6ftCombineConfig.puttCount,
  buildDistances: () => Array<number>(aimpoint6ftCombineConfig.puttCount).fill(aimpoint6ftCombineConfig.distanceFt),
  toRow: (putt, _targetFt, r) => ({
    putt,
    pct_33_guess: r["33"].guess,
    pct_33_actual: r["33"].actual,
    pct_66_guess: r["66"].guess,
    pct_66_actual: r["66"].actual,
  }),
  fromRow: (p) => ({
    "33": { guess: p.pct_33_guess, actual: p.pct_33_actual },
    "66": { guess: p.pct_66_guess, actual: p.pct_66_actual },
  }),
  persist: persistSession,
  summarize: (log) => {
    const bias = averageBias(log);
    return {
      totalPoints: totalPointsSession(log),
      maxPoints: 200,
      bias,
      reader: readerLabelFromBias(bias),
      message: captureZonePerceptionMessage(log),
    };
  },
};

export function Aimpoint6ftCombineRunner() {
  return <AimpointCombineRunner format={FORMAT} />;
}
