"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Target, TrendingUp, Trophy } from "lucide-react";
import { formatDrillScore, type DrillProgressSummary, type DrillScoreLog } from "@/lib/drillPersonalBests";
import { DRILL_SCORE_TYPE_LABELS, isPerfectScore, type DrillScoring } from "@/lib/drillScoring";
import { parseDrillScoreInput, type DrillProgressState } from "@/hooks/useDrillProgress";

const SPARK_POINTS = 12;
const LONG_UNIT_CHARS = 8;
const MAX_SCORE_CHIPS = 15;

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

function BeatYourBest({ summary, scoring }: { summary: DrillProgressSummary | null; scoring: DrillScoring }) {
  if (!summary) {
    return (
      <p className="rounded-lg bg-white px-2.5 py-2 text-xs leading-snug text-gray-600">
        <Target className="mr-1 inline h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
        Log your first score. That becomes your best, then try to beat it every time.
      </p>
    );
  }
  const fmt = (n: number) => formatDrillScore(n, scoring.unit);
  const perfect = isPerfectScore(summary.best, scoring);
  return (
    <div className="rounded-lg bg-[#014421] px-3 py-2.5 text-white">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
        <Trophy className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
        {perfect ? "Your best" : "Beat your best"}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{fmt(summary.best)}</p>
      <p className="text-[11px] leading-snug text-white/75">
        {perfect
          ? "Perfect score. Match it again to own this drill."
          : summary.count === 1
            ? "Your first score. Go again and beat it."
            : summary.last === summary.best
              ? "You hit your best last time. Go one better."
              : `Last time: ${fmt(summary.last)}.`}
      </p>
    </div>
  );
}

const STEPPER_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-[#014421]/40 disabled:opacity-40";

function ScoreInput({
  scoring,
  draft,
  setDraft,
  target,
  hasLogs,
}: {
  scoring: DrillScoring;
  draft: string;
  setDraft: (v: string) => void;
  target: number | null;
  hasLogs: boolean;
}) {
  const value = parseDrillScoreInput(draft);

  if (scoring.type === "makes" && scoring.max != null && scoring.max <= MAX_SCORE_CHIPS) {
    return (
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.ceil((scoring.max + 1) / 2)}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={`Score out of ${scoring.max}`}
      >
        {Array.from({ length: scoring.max + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => setDraft(String(n))}
            className={`h-9 rounded-lg text-sm font-semibold tabular-nums ring-1 transition-colors ${
              value === n
                ? "bg-[#014421] text-white ring-[#014421]"
                : target === n
                  ? "bg-orange-50 text-gray-900 ring-[#FFA500]"
                  : "bg-white text-gray-700 ring-gray-200 hover:ring-[#014421]/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  const stepper = scoring.type !== "time" && scoring.type !== "speed";
  const nudge = (delta: number) => {
    const base = value ?? (target != null ? target - delta : 0);
    setDraft(String(Math.max(0, base + delta)));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {stepper && (
        <button type="button" onClick={() => nudge(-1)} disabled={value === 0} className={STEPPER_BTN} aria-label="One less">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode={stepper ? "numeric" : "decimal"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={target != null ? String(target) : hasLogs ? "Today's score" : "Your score"}
          aria-label="Score for this drill"
          className={`w-full rounded-lg border border-gray-200 bg-white py-2 text-center text-sm font-semibold tabular-nums text-gray-900 placeholder:font-normal placeholder:text-gray-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30 ${
            scoring.unit ? "pl-2 pr-16" : "px-2"
          }`}
        />
        {scoring.unit && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 max-w-[4rem] -translate-y-1/2 truncate text-[11px] text-gray-400">
            {scoring.unit}
          </span>
        )}
      </div>
      {stepper && (
        <button type="button" onClick={() => nudge(1)} className={STEPPER_BTN} aria-label="One more">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

const FEEDBACK_STYLES: Record<string, string> = {
  pb: "bg-orange-50 text-orange-900",
  up: "bg-green-50 text-[#014421]",
  even: "bg-white text-gray-700",
  down: "bg-white text-gray-700",
  error: "bg-red-50 text-red-700",
};

const FIELD_LABEL = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400";

function scoreFieldLabel(s: DrillScoring): string {
  if (s.type === "streak") return "Consecutive";
  if (s.type === "time") return "Time";
  if (s.type === "speed") return "Top speed";
  if ((s.type === "strokes" || s.type === "count") && s.unit) return s.unit;
  return "Score";
}

function scoringLabel(s: DrillScoring): string {
  if (s.type === "makes") return `Out of ${s.max ?? 10}`;
  if (s.type === "completion" || !s.unit) return DRILL_SCORE_TYPE_LABELS[s.type];
  return `${DRILL_SCORE_TYPE_LABELS[s.type]} · ${s.unit}`;
}

export default function DrillProgressTracker({
  progress,
  coachGoalText = "",
  scoreEntry,
}: {
  progress: DrillProgressState;
  /** Catalog Goal/Reps text that couldn't be read as a number; shown as-is. */
  coachGoalText?: string;
  /** Replaces the typed score form for drills with their own score screen. */
  scoreEntry?: ReactNode;
}) {
  const {
    scoring,
    settings,
    unit,
    logs,
    summary,
    loading,
    saving,
    draft,
    setDraft,
    repsDraft,
    setRepsDraft,
    repsSummary,
    feedback,
    logDraft,
    undoLog,
  } = progress;
  const best = summary?.best ?? null;
  const lowerIsBetter = scoring.lowerIsBetter;
  const isCompletion = scoring.type === "completion";
  const isMakes = scoring.type === "makes" && scoring.max != null && scoring.max <= MAX_SCORE_CHIPS;
  const attemptsLabel = scoring.type === "speed" ? "Swings" : "Attempts";
  const attemptsField = (
    <label className="w-20 shrink-0">
      <span className={`block ${FIELD_LABEL}`}>{attemptsLabel}</span>
      <input
        type="text"
        inputMode="numeric"
        value={repsDraft}
        onChange={(e) => setRepsDraft(e.target.value)}
        placeholder={repsSummary ? String(repsSummary.last) : "Optional"}
        aria-label={`${attemptsLabel} (optional)`}
        className="w-full rounded-lg border border-gray-200 bg-white py-2 text-center text-sm font-semibold tabular-nums text-gray-900 placeholder:text-xs placeholder:font-normal placeholder:text-gray-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30"
      />
    </label>
  );
  const tileScore = (n: number) => (unit.length > LONG_UNIT_CHARS ? formatDrillScore(n, "") : formatDrillScore(n, unit));

  return (
    <div className="space-y-2.5 rounded-xl bg-gray-50 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Your progress
        </span>
        <span className="min-w-0 truncate text-[11px] font-medium text-gray-500">{scoringLabel(scoring)}</span>
      </div>

      {coachGoalText && (
        <p className="text-xs leading-snug text-gray-600">
          <span className="font-semibold text-gray-900">Coach&apos;s goal: </span>
          {coachGoalText}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : isCompletion ? (
        <div className="flex items-end gap-2">
          <p className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-2 text-xs leading-snug text-gray-600">
            {logs.length > 0 ? (
              <>
                Done <span className="font-semibold text-gray-900">{logs.length}</span>{" "}
                {logs.length === 1 ? "time" : "times"}, last on{" "}
                {new Date(logs[0].created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.{" "}
              </>
            ) : null}
            Tap Complete Drill each time you do it.
          </p>
          {attemptsField}
        </div>
      ) : (
        <>
          <BeatYourBest summary={summary} scoring={scoring} />
          {logs.length === 0 && settings.legacyText && (
            <p className="text-[11px] text-gray-400">Your old note: {settings.legacyText}</p>
          )}

          {scoreEntry ?? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void logDraft();
            }}
          >
            {isMakes ? (
              <ScoreInput
                scoring={scoring}
                draft={draft}
                setDraft={setDraft}
                target={best}
                hasLogs={logs.length > 0}
              />
            ) : (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <p className={FIELD_LABEL}>{scoreFieldLabel(scoring)}</p>
                  <ScoreInput
                    scoring={scoring}
                    draft={draft}
                    setDraft={setDraft}
                    target={best}
                    hasLogs={logs.length > 0}
                  />
                </div>
                {attemptsField}
              </div>
            )}
            <div className="flex items-end gap-2">
              {isMakes && attemptsField}
              <button
                type="submit"
                disabled={saving || !draft.trim()}
                className="flex-1 rounded-lg bg-[#014421] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#014421]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Log score"}
              </button>
            </div>
          </form>
          )}
        </>
      )}

      {feedback && (
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
      )}

      {!loading && !isCompletion && summary && (
        <>
          <div className="grid grid-cols-2 gap-1.5 text-center">
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
      )}

      {!loading && repsSummary && (
        <p className="text-[11px] text-gray-500">
          {attemptsLabel}: <span className="font-semibold text-gray-900 tabular-nums">{repsSummary.last}</span> last time
          {repsSummary.sessions > 1 && (
            <>
              {" · "}
              <span className="font-semibold text-gray-900 tabular-nums">{repsSummary.total}</span> across{" "}
              {repsSummary.sessions} sessions
            </>
          )}
        </p>
      )}

    </div>
  );
}
