"use client";

import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import {
  lateBreakTransitionMessage,
  meanAbsError33,
  meanAbsError66,
  twentySlopeDataPoints,
  type MidRangeSlopePuttReadings,
} from "@/lib/midRangeSlopeSensingScoring";
import {
  totalPointsSession,
  calibrationScorePercent,
  averageBias,
  readerLabelFromBias,
} from "@/lib/aimpoint6ftCombineScoring";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { AimpointCombineRunner, type AimpointFormat } from "@/components/combine/AimpointCombineRunner";

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** @returns null on success, or a user-visible error string */
async function persistSession(userId: string, putts: MidRangeSlopePuttReadings[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const totalPoints = totalPointsSession(putts);
    const calPct = calibrationScorePercent(totalPoints);
    const bias = averageBias(putts);
    const late = lateBreakTransitionMessage(putts);
    const aggregates: Record<string, unknown> = {
      total_points: totalPoints,
      calibration_accuracy_pct: calPct,
      avg_bias: bias,
      reader_label: readerLabelFromBias(bias),
      mean_abs_error_33: meanAbsError33(putts),
      mean_abs_error_66: meanAbsError66(putts),
      late_break_flag: late != null,
      late_break_message: late,
    };
    const payload = {
      version: 1,
      band_ft: "8-20",
      putts,
      data_points_20: twentySlopeDataPoints(putts),
      aggregates,
    };

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: midRangeSlopeSensingConfig.testType,
      test_type: midRangeSlopeSensingConfig.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: midRangeSlopeSensingConfig.noteKind,
        total_points: totalPoints,
        calibration_accuracy_pct: calPct,
        payload,
      }),
    });
    if (error) {
      console.warn("[MidRangeSlopeSensing] practice insert:", error.message);
      return "Could not save. Check your connection and try again.";
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[MidRangeSlopeSensing] practice insert failed", e);
    return "Could not save. Check your connection and try again.";
  }
}

const FORMAT: AimpointFormat<MidRangeSlopePuttReadings> = {
  title: "8–20 ft AimPoint Combine",
  chips: [`${midRangeSlopeSensingConfig.puttCount} putts`, "8 to 20 ft", "~20 min", "2 reads a putt"],
  marks: ["33", "66"],
  puttCount: midRangeSlopeSensingConfig.puttCount,
  buildDistances: () => shuffle([...midRangeSlopeSensingConfig.distances]),
  toRow: (putt, targetFt, r) => ({
    putt,
    target_ft: targetFt,
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
      message: lateBreakTransitionMessage(log),
    };
  },
};

export function MidRangeSlopeSensingRunner() {
  return <AimpointCombineRunner format={FORMAT} />;
}
