"use client";

import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import {
  type LongRangePuttReadings,
  totalPointsSession,
  calibrationAccuracyPercent,
  averageBiasLongRange,
  midPointTumbleMessage,
  avgPointsMark,
  thirtyDataPoints,
} from "@/lib/aimpointLongRange2040Scoring";
import { readerLabelFromBias } from "@/lib/aimpoint6ftCombineScoring";
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
async function persistSession(userId: string, putts: LongRangePuttReadings[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const totalPoints = totalPointsSession(putts);
    const calPct = calibrationAccuracyPercent(totalPoints);
    const bias = averageBiasLongRange(putts);
    const tumble = midPointTumbleMessage(putts);
    const aggregates: Record<string, unknown> = {
      total_points: totalPoints,
      calibration_accuracy_pct: calPct,
      avg_bias: bias,
      reader_label: readerLabelFromBias(bias),
      avg_points_33: avgPointsMark(putts, "33"),
      avg_points_50: avgPointsMark(putts, "50"),
      avg_points_66: avgPointsMark(putts, "66"),
      mid_point_tumble_flag: tumble != null,
      mid_point_tumble_message: tumble,
    };
    const payload = {
      version: 1,
      band_ft: "20-40",
      putts,
      data_points_30: thirtyDataPoints(putts),
      aggregates,
    };

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: aimpointLongRange2040Config.testType,
      test_type: aimpointLongRange2040Config.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: aimpointLongRange2040Config.noteKind,
        total_points: totalPoints,
        calibration_accuracy_pct: calPct,
        payload,
      }),
    });
    if (error) {
      console.warn("[AimpointLongRange2040] practice insert:", error.message);
      return "Could not save. Check your connection and try again.";
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[AimpointLongRange2040] practice insert failed", e);
    return "Could not save. Check your connection and try again.";
  }
}

const FORMAT: AimpointFormat<LongRangePuttReadings> = {
  title: "20–40 ft AimPoint Combine",
  chips: [`${aimpointLongRange2040Config.puttCount} putts`, "20 to 40 ft", "~20 min", "3 reads a putt"],
  marks: ["33", "50", "66"],
  puttCount: aimpointLongRange2040Config.puttCount,
  buildDistances: () => shuffle([...aimpointLongRange2040Config.distances]),
  toRow: (putt, targetFt, r) => ({
    putt,
    target_ft: targetFt,
    pct_33_guess: r["33"].guess,
    pct_33_actual: r["33"].actual,
    pct_50_guess: r["50"].guess,
    pct_50_actual: r["50"].actual,
    pct_66_guess: r["66"].guess,
    pct_66_actual: r["66"].actual,
  }),
  fromRow: (p) => ({
    "33": { guess: p.pct_33_guess, actual: p.pct_33_actual },
    "50": { guess: p.pct_50_guess, actual: p.pct_50_actual },
    "66": { guess: p.pct_66_guess, actual: p.pct_66_actual },
  }),
  persist: persistSession,
  summarize: (log) => {
    const bias = averageBiasLongRange(log);
    return {
      totalPoints: totalPointsSession(log),
      maxPoints: 300,
      bias,
      reader: readerLabelFromBias(bias),
      message: midPointTumbleMessage(log),
    };
  },
};

export function AimpointLongRange2040Runner() {
  return <AimpointCombineRunner format={FORMAT} />;
}
