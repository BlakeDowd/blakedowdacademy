"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Flag, Target, TrendingUp, Trophy } from "lucide-react";
import { formatDrillScore, type DrillScoreLog } from "@/lib/drillPersonalBests";
import { parseDrillScoreInput, type DrillProgressState } from "@/hooks/useDrillProgress";

const SPARK_POINTS = 12;
const LONG_UNIT_CHARS = 8;

export type DrillGoalOption = { label: string; score: number };

function Sparkline({ logs, lowerIsBetter, best }: { logs: DrillScoreLog[]; lowerIsBetter: boolean; best: number }) {
  const points = logs.slice(0, SPARK_POINTS).reverse();
  if (points.length < 2) return null;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const pad = 3;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const t = (p.score - min) / range;
    const y = pad + (lowerIsBetter ? t : 1 - t) * (h - pad * 2);
    return { x, y, score: p.score };
  });
  let bestIdx = -1;
  coords.forEach((c, i) => {
    if (c.score === best) bestIdx = i;
  });
  const lastIdx = coords.length - 1;
  const dot = (i: number, color: string) => (
    <span
      key={`${i}-${color}`}
      className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-gray-50"
      style={{ left: `${coords[i].x}%`, top: `${(coords[i].y / h) * 100}%`, backgroundColor: color }}
    />
  );
  return (
    <div
      className="relative h-9 w-full"
      role="img"
      aria-label={`Last ${points.length} scores, higher on the chart is better`}
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke="#014421"
          strokeOpacity={0.35}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {bestIdx >= 0 && bestIdx !== lastIdx && dot(bestIdx, "#FFA500")}
      {dot(lastIdx, bestIdx === lastIdx ? "#FFA500" : "#014421")}
    </div>
  );
}

function suggestNextGoal(goal: number, lowerIsBetter: boolean): number {
  if (lowerIsBetter) return Math.max(0, Math.min(goal - 1, Math.floor(goal * 0.9)));
  return Math.max(goal + 1, Math.ceil(goal * 1.2));
}

const FEEDBACK_STYLES: Record<string, string> = {
  pb: "bg-orange-50 text-orange-900",
  up: "bg-green-50 text-[#014421]",
  even: "bg-white text-gray-700",
  down: "bg-white text-gray-700",
  error: "bg-red-50 text-red-700",
};

const INPUT_CLASS =
  "min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30";

export default function DrillProgressTracker({
  progress,
  coachGoalText = "",
  goalOptions = [],
}: {
  progress: DrillProgressState;
  /** Catalog Goal/Reps text that couldn't be read as a number; shown as-is. */
  coachGoalText?: string;
  goalOptions?: DrillGoalOption[];
}) {
  const {
    settings,
    unit,
    goal,
    goalSource,
    logs,
    summary,
    loading,
    saving,
    draft,
    setDraft,
    feedback,
    logDraft,
    undoLog,
    updateSettings,
  } = progress;
  const [editingSettings, setEditingSettings] = useState(false);
  const [unitDraft, setUnitDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const lowerIsBetter = settings.lowerIsBetter;
  const tileScore = (n: number) => (unit.length > LONG_UNIT_CHARS ? formatDrillScore(n, "") : formatDrillScore(n, unit));

  const openSettings = () => {
    setUnitDraft(unit);
    setGoalDraft(goal != null ? String(goal) : "");
    setEditingSettings(true);
  };

  const saveSettings = () => {
    const parsedGoal = parseDrillScoreInput(goalDraft);
    void updateSettings({
      unit: unitDraft,
      goalScore: parsedGoal != null && parsedGoal >= 0 ? parsedGoal : null,
    });
    setEditingSettings(false);
  };

  const goalReached =
    goal != null && summary != null && (lowerIsBetter ? summary.best <= goal : summary.best >= goal);
  const goalPct =
    goal == null || summary == null
      ? 0
      : goalReached
        ? 100
        : lowerIsBetter
          ? Math.max(0, Math.min(100, (goal / summary.best) * 100))
          : goal > 0
            ? Math.max(0, Math.min(100, (summary.best / goal) * 100))
            : 0;
  const toGo = goal != null && summary != null ? Math.round(Math.abs(goal - summary.best) * 100) / 100 : null;

  return (
    <div className="space-y-2.5 rounded-xl bg-gray-50 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Your progress
        </span>
        {!editingSettings && (
          <button
            type="button"
            onClick={openSettings}
            className="min-w-0 truncate text-[11px] font-medium text-gray-500 underline-offset-2 hover:text-[#014421] hover:underline"
          >
            {lowerIsBetter ? "Lower is better" : "Higher is better"}
            {unit ? ` · ${unit}` : " · add unit"}
          </button>
        )}
      </div>

      {editingSettings && (
        <div className="space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-gray-200">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {[false, true].map((lower) => (
              <button
                key={String(lower)}
                type="button"
                onClick={() => void updateSettings({ lowerIsBetter: lower })}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  lowerIsBetter === lower ? "bg-white text-[#014421] shadow-sm" : "text-gray-500"
                }`}
              >
                {lower ? "Lower is better" : "Higher is better"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Goal</span>
              <input
                type="text"
                inputMode="decimal"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="e.g. 10"
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Unit</span>
              <input
                value={unitDraft}
                onChange={(e) => setUnitDraft(e.target.value)}
                maxLength={40}
                placeholder="in a row, /10, strokes"
                className={INPUT_CLASS}
              />
            </label>
          </div>
          {goalOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {goalOptions.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setGoalDraft(String(o.score))}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors ${
                    parseDrillScoreInput(goalDraft) === o.score
                      ? "bg-[#014421] text-white ring-[#014421]"
                      : "bg-white text-gray-700 ring-gray-200 hover:ring-[#014421]/40"
                  }`}
                >
                  {o.label} · {formatDrillScore(o.score, "")}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {settings.goalScore != null && goalSource === "you" ? (
              <button
                type="button"
                onClick={() => {
                  void updateSettings({ goalScore: null });
                  setEditingSettings(false);
                }}
                className="text-[11px] font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700"
              >
                Clear my goal
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-lg bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#014421]/90"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {coachGoalText && (
        <p className="text-xs leading-snug text-gray-600">
          <span className="font-semibold text-gray-900">Coach&apos;s goal: </span>
          {coachGoalText}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-white px-1 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Best</p>
              <p className="text-sm font-bold tabular-nums text-[#FFA500]">{tileScore(summary.best)}</p>
            </div>
            <div className="rounded-lg bg-white px-1 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Last</p>
              <p className="inline-flex items-center gap-0.5 text-sm font-bold tabular-nums text-gray-900">
                {tileScore(summary.last)}
                {summary.lastChange != null && summary.lastChange !== 0 && (
                  summary.lastChange > 0 ? (
                    <ArrowUp className="h-3 w-3 text-green-600" aria-label="Better than the time before" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-red-500" aria-label="Worse than the time before" />
                  )
                )}
              </p>
            </div>
            <div className="rounded-lg bg-white px-1 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Sessions</p>
              <p className="text-sm font-bold tabular-nums text-gray-900">{summary.count}</p>
            </div>
          </div>
          <Sparkline logs={logs} lowerIsBetter={lowerIsBetter} best={summary.best} />
        </>
      ) : (
        <p className="text-xs leading-snug text-gray-500">
          Log a score each time you do this drill and we&apos;ll track your best and push you to beat it.
          {settings.legacyText && (
            <span className="mt-1 block text-gray-400">Your old note: {settings.legacyText}</span>
          )}
        </p>
      )}

      {!loading && goal != null ? (
        <div className="rounded-lg bg-white px-2.5 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-gray-900">
              <Flag className="h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-hidden />
              <span className="truncate">Goal: {formatDrillScore(goal, unit)}</span>
            </span>
            {summary && (
              <span className="shrink-0 tabular-nums text-gray-500">
                {formatDrillScore(summary.best, "")} / {formatDrillScore(goal, "")}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${goalReached ? "bg-[#FFA500]" : "bg-[#014421]"}`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>
              {goalReached
                ? "Goal reached!"
                : toGo != null
                  ? `${formatDrillScore(toGo, "")} to go`
                  : "Log a score to start"}
              {" · "}
              {goalSource === "coach" ? "Coach's goal" : "Your goal"}
            </span>
            {goalReached ? (
              <button
                type="button"
                onClick={() => void updateSettings({ goalScore: suggestNextGoal(goal, lowerIsBetter) })}
                className="shrink-0 font-semibold text-[#014421] underline underline-offset-2"
              >
                Raise to {formatDrillScore(suggestNextGoal(goal, lowerIsBetter), "")}
              </button>
            ) : (
              <button
                type="button"
                onClick={openSettings}
                className="shrink-0 font-medium underline underline-offset-2 hover:text-[#014421]"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : !loading && !editingSettings ? (
        <button
          type="button"
          onClick={openSettings}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#014421] hover:underline"
        >
          <Flag className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
          Set a goal
        </button>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void logDraft();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={summary ? "Today's score" : "Your score"}
            aria-label="Score for this drill"
            className={`w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30 ${
              unit ? "pr-24" : "pr-3"
            }`}
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 max-w-[5.5rem] -translate-y-1/2 truncate text-xs text-gray-400">
              {unit}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || loading || !draft.trim()}
          className="rounded-lg bg-[#014421] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#014421]/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Log"}
        </button>
      </form>

      {feedback ? (
        <div
          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-snug ${FEEDBACK_STYLES[feedback.tone]}`}
        >
          {feedback.tone === "pb" && <Trophy className="mt-px h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-hidden />}
          <span className="min-w-0 flex-1">{feedback.text}</span>
          {feedback.undoLogId && (
            <button
              type="button"
              onClick={() => void undoLog(feedback.undoLogId!)}
              className="shrink-0 font-semibold underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              Undo
            </button>
          )}
        </div>
      ) : summary ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#014421]">
          <Target className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
          Beat {formatDrillScore(summary.best, unit)} for a new personal best
        </p>
      ) : null}
    </div>
  );
}
