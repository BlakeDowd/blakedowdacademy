"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Crown, Minus, Plus, RotateCcw, Target, TrendingUp, Trophy, X } from "lucide-react";
import { formatDrillScore, type DrillProgressSummary, type DrillScoreLog } from "@/lib/drillPersonalBests";
import { DRILL_SCORE_TYPE_LABELS, TO_PAR_UNIT, isPerfectScore, type DrillScoring } from "@/lib/drillScoring";
import { parseDrillScoreInput, type DrillProgressState } from "@/hooks/useDrillProgress";

const SPARK_POINTS = 12;
const LONG_UNIT_CHARS = 8;
const MAX_SCORE_CHIPS = 15;

type AttemptResult = "make" | "miss";

function streakFromAttempts(attempts: readonly AttemptResult[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  for (const a of attempts) {
    if (a === "make") {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return { current, best };
}

function sessionMakePct(attempts: readonly AttemptResult[]): {
  made: number;
  total: number;
  pct: number | null;
} {
  const total = attempts.length;
  const made = attempts.filter((a) => a === "make").length;
  return { made, total, pct: total > 0 ? Math.round((made / total) * 100) : null };
}

function logMakePct(log: DrillScoreLog): number | null {
  const d = log.details as
    | { kind?: string; sessionPct?: unknown; attemptResults?: unknown }
    | null
    | undefined;
  if (d && typeof d.sessionPct === "number" && Number.isFinite(d.sessionPct)) {
    return Math.round(d.sessionPct);
  }
  if (d && Array.isArray(d.attemptResults) && d.attemptResults.length > 0) {
    const made = d.attemptResults.filter((a) => a === "make").length;
    return Math.round((made / d.attemptResults.length) * 100);
  }
  if (d?.kind === "makes_attempts" && log.reps != null && log.reps > 0 && log.score >= 0) {
    return Math.round((log.score / log.reps) * 100);
  }
  return null;
}

/** Best make-% from prior logs (details.sessionPct or attemptResults only — not streak score/reps). */
function bestMakePctFromLogs(logs: readonly DrillScoreLog[]): number | null {
  let best: number | null = null;
  for (const log of logs) {
    const pct = logMakePct(log);
    if (pct == null) continue;
    best = best == null ? pct : Math.max(best, pct);
  }
  return best;
}

type AverageTrend = {
  /** Signed change of the metric (positive = metric went up). */
  pctDelta: number;
  /** True when the player is improving for this scoring type. */
  improving: boolean;
  sessions: number;
  label: "make %" | "score";
};

/**
 * Recent half vs older half of the last N sessions (newest first).
 * Prefer make-% when enough sessions logged it; else compare scores.
 */
function averageTrendFromLogs(
  logs: readonly DrillScoreLog[],
  lowerIsBetter: boolean,
  window = 5,
): AverageTrend | null {
  if (logs.length < 2) return null;
  const slice = logs.slice(0, Math.min(window, logs.length));
  const pcts = slice.map(logMakePct);
  const usePct = pcts.filter((p) => p != null).length >= 2;
  const values = (usePct ? pcts.filter((p): p is number => p != null) : slice.map((l) => l.score)) as number[];
  if (values.length < 2) return null;

  const split = Math.max(1, Math.floor(values.length / 2));
  const recent = values.slice(0, split);
  const older = values.slice(split);
  if (!older.length) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r = avg(recent);
  const o = avg(older);
  if (!Number.isFinite(r) || !Number.isFinite(o) || Math.abs(o) < 1e-6) return null;
  const pctDelta = ((r - o) / Math.abs(o)) * 100;
  const improving = lowerIsBetter && !usePct ? pctDelta < 0 : pctDelta > 0;
  return {
    pctDelta,
    improving,
    sessions: recent.length + older.length,
    label: usePct ? "make %" : "score",
  };
}

function formatTrendPct(pctDelta: number): string {
  const rounded = Math.round(pctDelta);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function AverageTrendRow({ trend }: { trend: AverageTrend }) {
  const flat = Math.round(trend.pctDelta) === 0;
  const color = flat ? "text-gray-600" : trend.improving ? "text-green-700" : "text-red-600";
  const bg = flat ? "bg-white" : trend.improving ? "bg-green-50" : "bg-red-50";
  const Icon = flat ? Minus : trend.improving ? ArrowUp : ArrowDown;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${bg} ring-1 ring-black/5`}>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Trend</p>
        <p className={`text-sm font-bold tabular-nums ${color}`}>
          <Icon className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          {formatTrendPct(trend.pctDelta)}
          <span className="ml-1 text-[11px] font-semibold text-gray-500">
            {trend.label} · {trend.sessions} sessions
          </span>
        </p>
      </div>
      <span className={`shrink-0 text-[11px] font-semibold ${color}`}>
        {flat ? "Steady" : trend.improving ? "Improving" : "Off form"}
      </span>
    </div>
  );
}

/** Consecutive Made / Missed — score is the best run this session. */
function StreakAttemptPad({
  attempts,
  setAttempts,
  personalBest,
  personalBestPct,
  onSwitchToTotal,
}: {
  attempts: AttemptResult[];
  setAttempts: (next: AttemptResult[] | ((prev: AttemptResult[]) => AttemptResult[])) => void;
  personalBest: number | null;
  personalBestPct: number | null;
  onSwitchToTotal: () => void;
}) {
  const { current, best } = streakFromAttempts(attempts);
  const { made, total, pct } = sessionMakePct(attempts);
  const isNewRecord = personalBest == null ? best > 0 : best > personalBest;
  const currentIsKing = personalBest == null ? current > 0 : current > personalBest;
  const isNewPctRecord =
    pct != null && total >= 3 && (personalBestPct == null ? pct > 0 : pct > personalBestPct);

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">In a row</p>
        <button
          type="button"
          onClick={onSwitchToTotal}
          className="shrink-0 text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
        >
          Enter total
        </button>
      </div>

      <div
        className={`relative overflow-hidden rounded-xl px-3 py-4 text-center ring-1 transition-colors ${
          currentIsKing
            ? "bg-[#FFA500]/10 ring-[#FFA500]/50"
            : "bg-white ring-gray-200"
        }`}
      >
        {currentIsKing && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#FFA500] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Crown className="h-3 w-3" aria-hidden />
            King
          </span>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Current streak</p>
        <p className="text-5xl font-extrabold tabular-nums leading-none text-[#014421]">{current}</p>
        <p className="mt-1 text-[11px] text-gray-500">
          {current === 0
            ? "Tap Made to start a run · Miss ends it"
            : current === 1
              ? "1 in a row — keep going"
              : `${current} in a row`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Best streak</p>
          <p className="text-lg font-extrabold tabular-nums text-gray-900">{best}</p>
          {isNewRecord ? (
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-[#FFA500]">
              <Crown className="h-3 w-3" aria-hidden />
              New record
            </span>
          ) : personalBest != null ? (
            <p className="text-[10px] text-gray-500">
              Best ever <span className="font-semibold tabular-nums text-gray-800">{personalBest}</span>
            </p>
          ) : (
            <p className="text-[10px] text-gray-400">First session</p>
          )}
        </div>
        <div
          className={`rounded-lg px-2.5 py-2 ring-1 ${
            isNewPctRecord ? "bg-[#FFA500]/10 ring-[#FFA500]/40" : "bg-white ring-gray-200"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Session %</p>
          <p className="text-lg font-extrabold tabular-nums text-gray-900">
            {pct != null ? `${pct}%` : "—"}
          </p>
          {pct != null ? (
            <p className="text-[10px] text-gray-500">
              <span className="font-semibold tabular-nums text-gray-800">
                {made}/{total}
              </span>{" "}
              made
              {isNewPctRecord ? (
                <span className="ml-1 inline-flex items-center gap-0.5 font-bold text-[#FFA500]">
                  <Crown className="h-3 w-3" aria-hidden />
                  Record
                </span>
              ) : personalBestPct != null ? (
                <span>
                  {" "}
                  · best <span className="font-semibold tabular-nums">{personalBestPct}%</span>
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-[10px] text-gray-400">Updates as you tap</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAttempts((prev) => [...prev, "make"])}
          className="rounded-xl bg-[#014421] px-3 py-4 text-base font-extrabold text-white transition-transform hover:bg-[#013320] active:scale-[0.98]"
        >
          <Check className="mx-auto mb-1 h-5 w-5" aria-hidden />
          Made
        </button>
        <button
          type="button"
          onClick={() => setAttempts((prev) => [...prev, "miss"])}
          className="rounded-xl border-2 border-gray-200 bg-white px-3 py-4 text-base font-extrabold text-gray-800 transition-transform hover:border-red-300 active:scale-[0.98]"
        >
          <X className="mx-auto mb-1 h-5 w-5 text-red-500" aria-hidden />
          Missed
        </button>
      </div>

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1" aria-label="Attempt results">
            {attempts.map((a, i) => (
              <span
                key={`${i}-${a}`}
                title={`Shot ${i + 1}: ${a === "make" ? "Made" : "Missed"}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums ${
                  a === "make" ? "bg-[#014421] text-white" : "bg-red-50 text-red-700 ring-1 ring-red-100"
                }`}
              >
                {i + 1}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAttempts((prev) => prev.slice(0, -1))}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#014421]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Undo last
          </button>
        </div>
      )}
    </div>
  );
}

/** Count pad: tick = satisfactory, cross = not — session % when you finish. */
function CountAttemptPad({
  attempts,
  setAttempts,
  unit,
  personalBestPct,
  onSwitchToTotal,
}: {
  attempts: AttemptResult[];
  setAttempts: (next: AttemptResult[] | ((prev: AttemptResult[]) => AttemptResult[])) => void;
  unit: string;
  personalBestPct: number | null;
  onSwitchToTotal: () => void;
}) {
  const unitLabel = unit.trim() || "good";
  const { made, total, pct } = sessionMakePct(attempts);
  const missed = total - made;
  const isNewPctRecord =
    pct != null && total >= 3 && (personalBestPct == null ? pct > 0 : pct > personalBestPct);

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Was that a good shot?
        </p>
        <button
          type="button"
          onClick={onSwitchToTotal}
          className="shrink-0 text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
        >
          Enter total
        </button>
      </div>

      <div
        className={`relative overflow-hidden rounded-xl px-3 py-4 text-center ring-1 transition-colors ${
          isNewPctRecord ? "bg-[#FFA500]/10 ring-[#FFA500]/50" : "bg-white ring-gray-200"
        }`}
      >
        {isNewPctRecord && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#FFA500] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Crown className="h-3 w-3" aria-hidden />
            % record
          </span>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Session %</p>
        <p className="text-5xl font-extrabold tabular-nums leading-none text-[#014421]">
          {pct != null ? `${pct}%` : "—"}
        </p>
        <p className="mt-1 text-[11px] text-gray-500">
          {total === 0
            ? "Tap ✓ or ✗ after each shot"
            : `${made} good · ${missed} miss · ${total} shots`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Good</p>
          <p className="text-lg font-extrabold tabular-nums text-gray-900">
            {made}
            <span className="ml-1 text-xs font-semibold text-gray-500">{unitLabel}</span>
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Best %</p>
          <p className="text-lg font-extrabold tabular-nums text-gray-900">
            {personalBestPct != null ? `${personalBestPct}%` : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAttempts((prev) => [...prev, "make"])}
          className="rounded-xl bg-[#014421] px-3 py-4 text-base font-extrabold text-white transition-transform hover:bg-[#013320] active:scale-[0.98]"
        >
          <Check className="mx-auto mb-1 h-5 w-5" aria-hidden />
          Good
        </button>
        <button
          type="button"
          onClick={() => setAttempts((prev) => [...prev, "miss"])}
          className="rounded-xl border-2 border-gray-200 bg-white px-3 py-4 text-base font-extrabold text-gray-800 transition-transform hover:border-red-300 active:scale-[0.98]"
        >
          <X className="mx-auto mb-1 h-5 w-5 text-red-500" aria-hidden />
          Miss
        </button>
      </div>

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1" aria-label="Shot results">
            {attempts.map((a, i) => (
              <span
                key={`${i}-${a}`}
                title={`Shot ${i + 1}: ${a === "make" ? "Good" : "Miss"}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums ${
                  a === "make" ? "bg-[#014421] text-white" : "bg-red-50 text-red-700 ring-1 ring-red-100"
                }`}
              >
                {i + 1}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAttempts((prev) => prev.slice(0, -1))}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#014421]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Undo last
          </button>
        </div>
      )}
    </div>
  );
}

/** Per-shot Made / Missed pad — score + attempts stay in sync for Log score. */
function MakesAttemptPad({
  max,
  attempts,
  setAttempts,
  personalBestPct,
  onSwitchToTotal,
}: {
  max: number;
  attempts: AttemptResult[];
  setAttempts: (next: AttemptResult[] | ((prev: AttemptResult[]) => AttemptResult[])) => void;
  personalBestPct: number | null;
  onSwitchToTotal: () => void;
}) {
  const made = attempts.filter((a) => a === "make").length;
  const missed = attempts.length - made;
  const full = attempts.length >= max;
  const nextNum = attempts.length + 1;
  const pct = attempts.length > 0 ? Math.round((made / attempts.length) * 100) : null;
  const isNewPctRecord =
    pct != null && attempts.length >= 3 && (personalBestPct == null ? pct > 0 : pct > personalBestPct);

  const push = (result: AttemptResult) => {
    if (full) return;
    setAttempts((prev) => [...prev, result]);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {full ? "Session done" : `Attempt ${nextNum} of ${max}`}
          </p>
          <p className="text-2xl font-extrabold tabular-nums text-gray-900">
            {made}
            <span className="text-base font-bold text-gray-400"> / {max}</span>
          </p>
          <p className="text-[11px] text-gray-500">
            {attempts.length === 0
              ? "Tap Made or Missed after each shot"
              : `${made} made · ${missed} missed · ${attempts.length} attempts`}
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchToTotal}
          className="shrink-0 text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
        >
          Enter total
        </button>
      </div>

      {pct != null && (
        <div
          className={`flex items-center justify-between rounded-lg px-2.5 py-2 ring-1 ${
            isNewPctRecord ? "bg-[#FFA500]/10 ring-[#FFA500]/40" : "bg-white ring-gray-200"
          }`}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Session %</p>
            <p className="text-lg font-extrabold tabular-nums text-gray-900">{pct}%</p>
          </div>
          {isNewPctRecord ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFA500] px-2.5 py-1 text-[11px] font-bold text-white">
              <Crown className="h-3.5 w-3.5" aria-hidden />
              % record
            </span>
          ) : personalBestPct != null ? (
            <p className="text-[11px] text-gray-500">
              Best <span className="font-semibold tabular-nums text-gray-800">{personalBestPct}%</span>
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={full}
          onClick={() => push("make")}
          className="rounded-xl bg-[#014421] px-3 py-4 text-base font-extrabold text-white transition-transform hover:bg-[#013320] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="mx-auto mb-1 h-5 w-5" aria-hidden />
          Made
        </button>
        <button
          type="button"
          disabled={full}
          onClick={() => push("miss")}
          className="rounded-xl border-2 border-gray-200 bg-white px-3 py-4 text-base font-extrabold text-gray-800 transition-transform hover:border-red-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="mx-auto mb-1 h-5 w-5 text-red-500" aria-hidden />
          Missed
        </button>
      </div>

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1" aria-label="Attempt results">
            {attempts.map((a, i) => (
              <span
                key={`${i}-${a}`}
                title={`Attempt ${i + 1}: ${a === "make" ? "Made" : "Missed"}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums ${
                  a === "make" ? "bg-[#014421] text-white" : "bg-red-50 text-red-700 ring-1 ring-red-100"
                }`}
              >
                {i + 1}
              </span>
            ))}
            {!full &&
              Array.from({ length: Math.min(4, max - attempts.length) }, (_, i) => (
                <span
                  key={`empty-${i}`}
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-white text-[11px] font-semibold text-gray-300 ring-1 ring-dashed ring-gray-200"
                >
                  {attempts.length + i + 1}
                </span>
              ))}
          </div>
          <button
            type="button"
            onClick={() => setAttempts((prev) => prev.slice(0, -1))}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#014421]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Undo last
          </button>
        </div>
      )}
    </div>
  );
}

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
  const isStreak = scoring.type === "streak";
  return (
    <div className="rounded-lg bg-[#014421] px-3 py-2.5 text-white">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
        {isStreak ? (
          <Crown className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
        ) : (
          <Trophy className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
        )}
        {perfect ? "Your best" : isStreak ? "King of the hill" : "Beat your best"}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">
        {fmt(summary.best)}
        {isStreak ? <span className="ml-1 text-sm font-semibold text-white/70">in a row</span> : null}
      </p>
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

  if (scoring.type === "topar") {
    const shown = value ?? 0;
    const step = (delta: number) => setDraft(formatDrillScore(shown + delta, TO_PAR_UNIT));
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button type="button" onClick={() => step(-1)} className={STEPPER_BTN} aria-label="One under">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setDraft(formatDrillScore(shown, TO_PAR_UNIT))}
          aria-label="Score to par"
          className={`min-w-0 flex-1 rounded-lg border py-1.5 text-center tabular-nums ${
            value == null ? "border-dashed border-gray-300 text-gray-300" : "border-gray-200 bg-white text-gray-900"
          }`}
        >
          <span className={`block text-lg font-extrabold ${value != null && value < 0 ? "text-red-600" : ""}`}>
            {formatDrillScore(shown, TO_PAR_UNIT)}
          </span>
          <span className="block text-[10px] font-semibold text-gray-400">
            {value == null ? "Tap for even, or use − / +" : value === 0 ? "Even par" : value < 0 ? "Under par" : "Over par"}
          </span>
        </button>
        <button type="button" onClick={() => step(1)} className={STEPPER_BTN} aria-label="One over">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
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
  if (s.type === "gross") return `Gross score (${s.max ?? 18} holes)`;
  if (s.type === "topar") return "Score to par";
  if ((s.type === "strokes" || s.type === "count") && s.unit) return s.unit;
  return "Score";
}

function scoringLabel(s: DrillScoring): string {
  if (s.type === "makes") return `Out of ${s.max ?? 10}`;
  if (s.type === "gross") return `Gross score · ${s.max ?? 18} holes`;
  if (s.type === "topar") return "Over / under par";
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
    saveScore,
    undoLog,
  } = progress;
  const best = summary?.best ?? null;
  const bestPct = bestMakePctFromLogs(logs);
  const lowerIsBetter = scoring.lowerIsBetter;
  const averageTrend = averageTrendFromLogs(logs, lowerIsBetter);
  const isCompletion = scoring.type === "completion";
  const isMakes = scoring.type === "makes" && scoring.max != null && scoring.max <= MAX_SCORE_CHIPS;
  const isStreak = scoring.type === "streak";
  const isCount = scoring.type === "count";
  const makesMax = isMakes ? scoring.max! : 0;
  const [makesMode, setMakesMode] = useState<"tap" | "total">("tap");
  const [streakMode, setStreakMode] = useState<"tap" | "total">("tap");
  const [countMode, setCountMode] = useState<"tap" | "total">("tap");
  const [makeAttempts, setMakeAttempts] = useState<AttemptResult[]>([]);
  const [streakAttempts, setStreakAttempts] = useState<AttemptResult[]>([]);
  const [countAttempts, setCountAttempts] = useState<AttemptResult[]>([]);

  // Whenever a drill is set to Count, open on Good / Miss.
  useEffect(() => {
    if (scoring.type !== "count") return;
    setCountMode("tap");
    setCountAttempts([]);
  }, [scoring.type, scoring.unit]);

  // Keep draft + attempts field in sync with the tap pad.
  useEffect(() => {
    if (!isMakes || makesMode !== "tap") return;
    if (makeAttempts.length === 0) {
      setDraft("");
      setRepsDraft("");
      return;
    }
    setDraft(String(makeAttempts.filter((a) => a === "make").length));
    setRepsDraft(String(makeAttempts.length));
  }, [isMakes, makesMode, makeAttempts, setDraft, setRepsDraft]);

  useEffect(() => {
    if (!isStreak || streakMode !== "tap") return;
    if (streakAttempts.length === 0) {
      setDraft("");
      setRepsDraft("");
      return;
    }
    const { best } = streakFromAttempts(streakAttempts);
    setDraft(String(best));
    setRepsDraft(String(streakAttempts.length));
  }, [isStreak, streakMode, streakAttempts, setDraft, setRepsDraft]);

  useEffect(() => {
    if (!isCount || countMode !== "tap") return;
    if (countAttempts.length === 0) {
      setDraft("");
      setRepsDraft("");
      return;
    }
    setDraft(String(countAttempts.filter((a) => a === "make").length));
    setRepsDraft(String(countAttempts.length));
  }, [isCount, countMode, countAttempts, setDraft, setRepsDraft]);

  // Clear pad after a successful log (draft wiped by saveScore).
  useEffect(() => {
    if (makesMode === "tap" && makeAttempts.length > 0 && !draft.trim() && !repsDraft.trim() && !saving) {
      setMakeAttempts([]);
    }
  }, [draft, repsDraft, saving, makesMode, makeAttempts.length]);

  useEffect(() => {
    if (streakMode === "tap" && streakAttempts.length > 0 && !draft.trim() && !repsDraft.trim() && !saving) {
      setStreakAttempts([]);
    }
  }, [draft, repsDraft, saving, streakMode, streakAttempts.length]);

  useEffect(() => {
    if (countMode === "tap" && countAttempts.length > 0 && !draft.trim() && !repsDraft.trim() && !saving) {
      setCountAttempts([]);
    }
  }, [draft, repsDraft, saving, countMode, countAttempts.length]);

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

          {/* Count always uses Good / Miss + session %, even if the drill has a custom score screen. */}
          {scoring.type === "count" || !scoreEntry ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (isMakes && makesMode === "tap" && makeAttempts.length > 0) {
                  const made = makeAttempts.filter((a) => a === "make").length;
                  const { pct } = sessionMakePct(makeAttempts);
                  const ok = await saveScore(made, makeAttempts.length, {
                    kind: "makes_attempts",
                    attemptResults: makeAttempts,
                    sessionPct: pct,
                  });
                  if (ok) setMakeAttempts([]);
                  return;
                }
                if (isStreak && streakMode === "tap" && streakAttempts.length > 0) {
                  const { best: sessionBest } = streakFromAttempts(streakAttempts);
                  const { made, pct } = sessionMakePct(streakAttempts);
                  const ok = await saveScore(sessionBest, streakAttempts.length, {
                    kind: "streak_attempts",
                    attemptResults: streakAttempts,
                    sessionBest,
                    sessionMakes: made,
                    sessionPct: pct,
                  });
                  if (ok) setStreakAttempts([]);
                  return;
                }
                if (isCount && countMode === "tap" && countAttempts.length > 0) {
                  const made = countAttempts.filter((a) => a === "make").length;
                  const { pct } = sessionMakePct(countAttempts);
                  const ok = await saveScore(made, countAttempts.length, {
                    kind: "count_attempts",
                    attemptResults: countAttempts,
                    sessionPct: pct,
                  });
                  if (ok) setCountAttempts([]);
                  return;
                }
                await logDraft();
              })();
            }}
          >
            {isStreak && streakMode === "tap" ? (
              <StreakAttemptPad
                attempts={streakAttempts}
                setAttempts={setStreakAttempts}
                personalBest={best}
                personalBestPct={bestPct}
                onSwitchToTotal={() => {
                  setStreakMode("total");
                  setStreakAttempts([]);
                  setDraft("");
                  setRepsDraft("");
                }}
              />
            ) : isMakes && makesMode === "tap" ? (
              <MakesAttemptPad
                max={makesMax}
                attempts={makeAttempts}
                setAttempts={setMakeAttempts}
                personalBestPct={bestPct}
                onSwitchToTotal={() => {
                  setMakesMode("total");
                  setMakeAttempts([]);
                  setDraft("");
                  setRepsDraft("");
                }}
              />
            ) : isCount && countMode === "tap" ? (
              <CountAttemptPad
                attempts={countAttempts}
                setAttempts={setCountAttempts}
                unit={scoring.unit}
                personalBestPct={bestPct}
                onSwitchToTotal={() => {
                  setCountMode("total");
                  setCountAttempts([]);
                  setDraft("");
                  setRepsDraft("");
                }}
              />
            ) : isMakes ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={FIELD_LABEL}>Total made</p>
                  <button
                    type="button"
                    onClick={() => setMakesMode("tap")}
                    className="text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
                  >
                    Made / Missed
                  </button>
                </div>
                <ScoreInput
                  scoring={scoring}
                  draft={draft}
                  setDraft={setDraft}
                  target={best}
                  hasLogs={logs.length > 0}
                />
              </div>
            ) : isStreak ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={FIELD_LABEL}>Best streak</p>
                  <button
                    type="button"
                    onClick={() => setStreakMode("tap")}
                    className="text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
                  >
                    Made / Missed
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
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
              </div>
            ) : isCount ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={FIELD_LABEL}>{scoreFieldLabel(scoring)}</p>
                  <button
                    type="button"
                    onClick={() => setCountMode("tap")}
                    className="text-[11px] font-semibold text-gray-500 underline underline-offset-2 hover:text-[#014421]"
                  >
                    Good / Miss
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
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
              </div>
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
              {isMakes && makesMode === "total" && attemptsField}
              <button
                type="submit"
                disabled={
                  saving ||
                  (isMakes && makesMode === "tap"
                    ? makeAttempts.length === 0
                    : isStreak && streakMode === "tap"
                      ? streakAttempts.length === 0
                      : isCount && countMode === "tap"
                        ? countAttempts.length === 0
                        : !draft.trim())
                }
                className="flex-1 rounded-lg bg-[#014421] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#014421]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? "Saving…"
                  : isMakes && makesMode === "tap" && makeAttempts.length > 0
                    ? `Log ${makeAttempts.filter((a) => a === "make").length}/${makeAttempts.length}`
                    : isStreak && streakMode === "tap" && streakAttempts.length > 0
                      ? (() => {
                          const { best: b } = streakFromAttempts(streakAttempts);
                          const { pct } = sessionMakePct(streakAttempts);
                          return pct != null
                            ? `Log ${b} in a row · ${pct}%`
                            : `Log best ${b} in a row`;
                        })()
                      : isCount && countMode === "tap" && countAttempts.length > 0
                        ? (() => {
                            const { made, total, pct } = sessionMakePct(countAttempts);
                            return pct != null
                              ? `End session · ${pct}% (${made}/${total})`
                              : `End session · ${made}/${total}`;
                          })()
                        : "Log score"}
              </button>
            </div>
          </form>
          ) : (
            scoreEntry
          )}
        </>
      )}

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-snug ${FEEDBACK_STYLES[feedback.tone]}`}
        >
          {feedback.tone === "pb" &&
            (isStreak ? (
              <Crown className="mt-px h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-hidden />
            ) : (
              <Trophy className="mt-px h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-hidden />
            ))}
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
          {averageTrend && <AverageTrendRow trend={averageTrend} />}
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
