"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDrillScore,
  describeNewDrillScore,
  fetchDrillProgress,
  insertDrillScore,
  saveDrillScoreSettings,
  summarizeDrillProgress,
  type DrillGoalTarget,
  type DrillScoreLog,
  type DrillScoreSettings,
} from "@/lib/drillPersonalBests";

export type DrillScoreFeedback = {
  text: string;
  tone: "pb" | "up" | "even" | "down" | "error";
  undoLogId?: string;
};

export type DrillSettingsPatch = Partial<Pick<DrillScoreSettings, "unit" | "lowerIsBetter" | "goalScore">>;

const EMPTY_SETTINGS: DrillScoreSettings = { unit: "", lowerIsBetter: false, goalScore: null, legacyText: "" };

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

export function parseDrillScoreInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function useDrillProgress(
  userId: string | null | undefined,
  drillKey: string,
  enabled = true,
  coachGoal: DrillGoalTarget | null = null,
) {
  const [settings, setSettings] = useState<DrillScoreSettings>(EMPTY_SETTINGS);
  const [logs, setLogs] = useState<DrillScoreLog[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<DrillScoreFeedback | null>(null);

  useEffect(() => {
    if (!userId || !enabled) {
      setLogs([]);
      setSettings(EMPTY_SETTINGS);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await fetchDrillProgress(await getSupabase(), userId, drillKey);
        if (cancelled) return;
        setSettings(data.settings);
        setLogs(data.logs);
        setAvailable(data.available);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, drillKey, enabled]);

  const coachScore = coachGoal?.score ?? null;
  const coachUnit = coachGoal?.unit ?? "";
  const unit = settings.unit || coachUnit;
  const goal = settings.goalScore ?? coachScore;
  const goalSource: "you" | "coach" | null = settings.goalScore != null ? "you" : coachScore != null ? "coach" : null;

  const summary = useMemo(
    () => summarizeDrillProgress(logs, settings.lowerIsBetter),
    [logs, settings.lowerIsBetter],
  );

  /** Logs the current draft. Returns true when nothing was pending or the save worked. */
  const logDraft = useCallback(async (): Promise<boolean> => {
    if (!userId) return true;
    const score = parseDrillScoreInput(draft);
    if (score == null) return true;
    setSaving(true);
    try {
      const supabase = await getSupabase();
      const { log, error } = await insertDrillScore(supabase, userId, drillKey, score);
      if (error || !log) {
        setFeedback({ text: error ?? "Could not save. Try again.", tone: "error" });
        return false;
      }
      const reaction = describeNewDrillScore(score, logs, settings.lowerIsBetter, unit, goal);
      setLogs((prev) => [log, ...prev]);
      setDraft("");
      setFeedback({ ...reaction, undoLogId: log.id });
      return true;
    } finally {
      setSaving(false);
    }
  }, [userId, drillKey, draft, logs, settings.lowerIsBetter, unit, goal]);

  const undoLog = useCallback(async (logId: string) => {
    const supabase = await getSupabase();
    const { error } = await deleteDrillScore(supabase, logId);
    if (error) {
      setFeedback({ text: error, tone: "error" });
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    setFeedback(null);
  }, []);

  const updateSettings = useCallback(
    async (patch: DrillSettingsPatch) => {
      if (!userId) return;
      const prev = settings;
      const next = {
        unit: (patch.unit ?? settings.unit).trim(),
        lowerIsBetter: patch.lowerIsBetter ?? settings.lowerIsBetter,
        goalScore: patch.goalScore !== undefined ? patch.goalScore : settings.goalScore,
      };
      setSettings((s) => ({ ...s, ...next }));
      const { error } = await saveDrillScoreSettings(await getSupabase(), userId, drillKey, next);
      if (error) {
        setSettings(prev);
        setFeedback({ text: error, tone: "error" });
      }
    },
    [userId, drillKey, settings],
  );

  const updateDraft = useCallback((v: string) => {
    setDraft(v);
    setFeedback((f) => (f?.tone === "error" ? null : f));
  }, []);
  const clearFeedback = useCallback(() => setFeedback(null), []);

  return {
    settings,
    unit,
    goal,
    goalSource,
    logs,
    summary,
    available,
    loading,
    saving,
    draft,
    setDraft: updateDraft,
    feedback,
    clearFeedback,
    logDraft,
    undoLog,
    updateSettings,
  };
}

export type DrillProgressState = ReturnType<typeof useDrillProgress>;
