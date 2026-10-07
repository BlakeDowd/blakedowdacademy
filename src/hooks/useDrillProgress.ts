"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDrillScore,
  fetchDrillProgress,
  insertDrillScore,
  saveDrillScoreSettings,
  summarizeDrillProgress,
  type DrillGoalTarget,
  type DrillScoreLog,
  type DrillScoreSettings,
} from "@/lib/drillPersonalBests";
import {
  computeDrillTarget,
  describeDrillLog,
  type DrillMilestone,
  type DrillScoring,
} from "@/lib/drillScoring";

export type DrillScoreFeedback = {
  text: string;
  tone: "pb" | "up" | "even" | "down" | "error";
  undoLogId?: string;
};

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

/** Score types where the score is a subset of the attempts, so it can't exceed them. */
const SCORE_WITHIN_ATTEMPTS = new Set<DrillScoring["type"]>(["streak", "makes", "count"]);

export type DrillRepsSummary = {
  /** Attempts in the most recent session that recorded them. */
  last: number;
  total: number;
  /** Sessions (within the loaded history) that recorded attempts. */
  sessions: number;
};

function summarizeReps(logs: DrillScoreLog[]): DrillRepsSummary | null {
  const withReps = logs.filter((l) => l.reps != null);
  if (withReps.length === 0) return null;
  return {
    last: withReps[0].reps!,
    total: withReps.reduce((sum, l) => sum + l.reps!, 0),
    sessions: withReps.length,
  };
}

export function useDrillProgress(
  userId: string | null | undefined,
  drillKey: string,
  scoring: DrillScoring,
  enabled = true,
  coachGoal: DrillGoalTarget | null = null,
  milestones: DrillMilestone[] = [],
) {
  const [settings, setSettings] = useState<DrillScoreSettings>(EMPTY_SETTINGS);
  const [logs, setLogs] = useState<DrillScoreLog[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [repsDraft, setRepsDraft] = useState("");
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

  const { unit, lowerIsBetter } = scoring;
  const coachScore = coachGoal?.score ?? null;
  const goal = settings.goalScore ?? coachScore;
  const goalSource: "you" | "coach" | null = settings.goalScore != null ? "you" : coachScore != null ? "coach" : null;

  const summary = useMemo(() => summarizeDrillProgress(logs, lowerIsBetter), [logs, lowerIsBetter]);
  const target = useMemo(() => computeDrillTarget(logs, scoring), [logs, scoring]);
  const repsSummary = useMemo(() => summarizeReps(logs), [logs]);

  /** Logs the current draft (or a session, for completion drills). True when nothing was pending or the save worked. */
  const logDraft = useCallback(async (): Promise<boolean> => {
    if (!userId) return true;
    const score = scoring.type === "completion" ? 1 : parseDrillScoreInput(draft);
    if (score == null) return true;
    let reps: number | null = null;
    if (repsDraft.trim()) {
      const parsed = parseDrillScoreInput(repsDraft);
      if (parsed == null || parsed < 0 || !Number.isInteger(parsed)) {
        setFeedback({ text: "Attempts should be a whole number.", tone: "error" });
        return false;
      }
      if (SCORE_WITHIN_ATTEMPTS.has(scoring.type) && parsed < score) {
        setFeedback({ text: "Attempts can't be less than your score.", tone: "error" });
        return false;
      }
      reps = parsed;
    }
    setSaving(true);
    try {
      const supabase = await getSupabase();
      const { log, error } = await insertDrillScore(supabase, userId, drillKey, score, reps);
      if (error || !log) {
        setFeedback({ text: error ?? "Could not save. Try again.", tone: "error" });
        return false;
      }
      const reaction = describeDrillLog(score, logs, scoring, goal, milestones);
      setLogs((prev) => [log, ...prev]);
      setDraft("");
      setRepsDraft("");
      setFeedback({ ...reaction, undoLogId: log.id });
      if (settings.unit !== unit || settings.lowerIsBetter !== lowerIsBetter) {
        setSettings((s) => ({ ...s, unit, lowerIsBetter }));
        void saveDrillScoreSettings(supabase, userId, drillKey, { unit, lowerIsBetter, goalScore: settings.goalScore });
      }
      return true;
    } finally {
      setSaving(false);
    }
  }, [userId, drillKey, draft, repsDraft, logs, scoring, goal, milestones, settings, unit, lowerIsBetter]);

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

  /** Saves the player's own long-term goal (null falls back to the coach's goal). */
  const updateGoal = useCallback(
    async (goalScore: number | null) => {
      if (!userId) return;
      const prev = settings;
      setSettings((s) => ({ ...s, goalScore, unit, lowerIsBetter }));
      const { error } = await saveDrillScoreSettings(await getSupabase(), userId, drillKey, {
        unit,
        lowerIsBetter,
        goalScore,
      });
      if (error) {
        setSettings(prev);
        setFeedback({ text: error, tone: "error" });
      }
    },
    [userId, drillKey, settings, unit, lowerIsBetter],
  );

  const updateDraft = useCallback((v: string) => {
    setDraft(v);
    setFeedback((f) => (f?.tone === "error" ? null : f));
  }, []);
  const updateRepsDraft = useCallback((v: string) => {
    setRepsDraft(v);
    setFeedback((f) => (f?.tone === "error" ? null : f));
  }, []);
  const clearFeedback = useCallback(() => setFeedback(null), []);

  return {
    scoring,
    settings,
    unit,
    goal,
    goalSource,
    logs,
    summary,
    target,
    available,
    loading,
    saving,
    draft,
    setDraft: updateDraft,
    repsDraft,
    setRepsDraft: updateRepsDraft,
    repsSummary,
    feedback,
    clearFeedback,
    logDraft,
    undoLog,
    updateGoal,
  };
}

export type DrillProgressState = ReturnType<typeof useDrillProgress>;
