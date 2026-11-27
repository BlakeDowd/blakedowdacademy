"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  ListOrdered,
  Play,
  Check,
} from "lucide-react";
import { useVoiceTimerCommands } from "@/hooks/useVoiceTimerCommands";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  ROUTINE_GAME_PARTS,
  ROUTINE_PHASES,
  ROUTINE_QUIZ_QUESTIONS,
  answersHaveContent,
  appendRoutineTimeLog,
  blankAnswers,
  buildStepsFromAnswers,
  consistencyForPart,
  consistencyForStep,
  consistencyGradeLabel,
  consistencyGradeTone,
  formatRoutineClock,
  formatRoutineTimePrecise,
  getOrCreateRoutine,
  hasStepDetails,
  loadRoutineStore,
  normalizeAnswers,
  overallConsistency,
  reorderStageIds,
  routineFilledCount,
  routinePhaseLabel,
  saveRoutineStore,
  secondsFromMs,
  starterRoutine,
  stepDetailEntries,
  systemStagesFromAnswers,
  upsertRoutine,
  type ConsistencyStat,
  type GameRoutine,
  type RoutineAnswers,
  type RoutineExtra,
  type RoutineGamePartId,
  type RoutinePhase,
  type RoutineTimeLog,
} from "@/lib/routineBuilder";

const PHASE_TONE: Record<RoutinePhase, string> = {
  physical: "bg-[#014421]/10 text-[#014421]",
  mental: "bg-[#FFA500]/20 text-[#9a6700]",
  post: "bg-stone-200 text-stone-700",
};

type Mode = "parts" | "quiz" | "system" | "rehearse" | "history";

const FIELD =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30";

function newExtraId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `extra-${Date.now()}`;
}

function QuizView({
  partLabel,
  answers,
  onChange,
  onBack,
  onBuild,
  onOpenHistory,
  partTimes,
}: {
  partLabel: string;
  answers: RoutineAnswers;
  onChange: (next: RoutineAnswers) => void;
  onBack: () => void;
  onBuild: () => void;
  onOpenHistory: () => void;
  partTimes: number;
}) {
  const [quizIndex, setQuizIndex] = useState(0);
  const q = ROUTINE_QUIZ_QUESTIONS[quizIndex]!;
  const value = answers[q.id];
  const isLast = quizIndex >= ROUTINE_QUIZ_QUESTIONS.length - 1;

  const setField = (id: typeof q.id, v: string) => {
    onChange({ ...answers, [id]: v });
  };

  const addExtra = () => {
    onChange({
      ...answers,
      extras: [...answers.extras, { id: newExtraId(), label: "", value: "" }],
    });
  };

  const updateExtra = (id: string, patch: Partial<RoutineExtra>) => {
    onChange({
      ...answers,
      extras: answers.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  };

  const removeExtra = (id: string) => {
    onChange({ ...answers, extras: answers.extras.filter((e) => e.id !== id) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Timer
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Times{partTimes > 0 ? ` (${partTimes})` : ""}
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {partLabel} · {quizIndex + 1}/{ROUTINE_QUIZ_QUESTIONS.length}
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {ROUTINE_PHASES.map((p) => {
          const active = q.phase === p.id;
          return (
            <span
              key={p.id}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                active ? PHASE_TONE[p.id] : "bg-stone-100 text-stone-400"
              }`}
            >
              {p.label}
            </span>
          );
        })}
      </div>

      <div className="flex gap-1" aria-hidden>
        {ROUTINE_QUIZ_QUESTIONS.map((qq, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i <= quizIndex
                ? qq.phase === "mental"
                  ? "bg-[#FFA500]"
                  : qq.phase === "post"
                    ? "bg-stone-500"
                    : "bg-[#014421]"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
        <p
          className={`mb-2 text-[10px] font-bold uppercase tracking-wide ${
            q.phase === "mental" ? "text-[#9a6700]" : q.phase === "post" ? "text-stone-700" : "text-[#014421]"
          }`}
        >
          {routinePhaseLabel(q.phase)}
        </p>
        <p className="text-sm font-semibold text-gray-900">{q.prompt}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {q.chips.map((chip) => {
            const on = value.trim().toLowerCase() === chip.toLowerCase();
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={on}
                onClick={() => setField(q.id, chip)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  on
                    ? "bg-[#014421] text-white"
                    : "bg-stone-50 text-stone-700 ring-1 ring-stone-200"
                }`}
              >
                {on ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3" aria-hidden />
                    {chip}
                  </span>
                ) : (
                  chip
                )}
              </button>
            );
          })}
        </div>
        <input
          className={`${FIELD} mt-3`}
          value={value}
          onChange={(e) => setField(q.id, e.target.value)}
          placeholder={q.placeholder}
        />
      </div>

      {isLast && (
        <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-stone-800">Anything else?</p>
            <button
              type="button"
              onClick={addExtra}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#014421]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </button>
          </div>
          {answers.extras.length === 0 ? (
            <p className="text-[11px] text-stone-500">Optional cues that aren&apos;t covered above.</p>
          ) : (
            answers.extras.map((extra) => (
              <div key={extra.id} className="flex gap-2">
                <input
                  className={FIELD}
                  value={extra.label}
                  onChange={(e) => updateExtra(extra.id, { label: e.target.value })}
                  placeholder="Label"
                />
                <input
                  className={FIELD}
                  value={extra.value}
                  onChange={(e) => updateExtra(extra.id, { value: e.target.value })}
                  placeholder="Detail"
                />
                <button
                  type="button"
                  onClick={() => removeExtra(extra.id)}
                  className="shrink-0 rounded-xl p-2 text-stone-400 hover:text-red-600"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={quizIndex <= 0}
          onClick={() => setQuizIndex((i) => Math.max(0, i - 1))}
          className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onBuild}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-3 text-sm font-bold text-white"
          >
            Build my system
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setQuizIndex((i) => Math.min(ROUTINE_QUIZ_QUESTIONS.length - 1, i + 1))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-3 text-sm font-bold text-white"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {answersHaveContent(answers) && (
        <button
          type="button"
          onClick={onBuild}
          className="w-full text-center text-[11px] font-semibold text-[#014421] underline underline-offset-2"
        >
          Skip to system view
        </button>
      )}
    </div>
  );
}

function SystemView({
  partLabel,
  answers,
  onEditQuiz,
  onRehearse,
  onBack,
  onOpenHistory,
  onReorder,
  partTimes,
}: {
  partLabel: string;
  answers: RoutineAnswers;
  onEditQuiz: () => void;
  onRehearse: () => void;
  onBack: () => void;
  onOpenHistory: () => void;
  onReorder: (nextOrder: string[]) => void;
  partTimes: number;
}) {
  const stages = systemStagesFromAnswers(answers);

  const move = (index: number, direction: -1 | 1) => {
    const ids = stages.map((s) => s.id);
    onReorder(reorderStageIds(ids, index, direction));
  };

  const phaseBlocks = ROUTINE_PHASES.map((p) => ({
    ...p,
    items: stages
      .map((stage, index) => ({ stage, index }))
      .filter(({ stage }) => stage.phase === p.id),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Timer
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Times{partTimes > 0 ? ` (${partTimes})` : ""}
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{partLabel}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[#014421] px-4 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Plan stages</p>
        <p className="mt-0.5 text-sm font-semibold">Physical → Mental → Post-shot — then time it</p>
      </div>

      <div className="space-y-4">
        {phaseBlocks.map((block) => (
          <div key={block.id} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <p className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${PHASE_TONE[block.id]}`}>
                {block.label}
              </p>
              <p className="text-[10px] text-stone-400">{block.hint}</p>
            </div>
            <ol className="space-y-0">
              {block.items.map(({ stage, index: i }, localIdx) => (
                <li key={stage.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {localIdx < block.items.length - 1 && (
                    <span
                      className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-[#014421]/15"
                      aria-hidden
                    />
                  )}
                  <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#014421] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 ring-1 ring-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#014421]">
                          {stage.title}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{stage.detail}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="rounded-md p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                          aria-label={`Move ${stage.title} up`}
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={i >= stages.length - 1}
                          onClick={() => move(i, 1)}
                          className="rounded-md p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                          aria-label={`Move ${stage.title} down`}
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEditQuiz}
          className="rounded-xl bg-white py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200"
        >
          Edit answers
        </button>
        <button
          type="button"
          onClick={onRehearse}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-3 text-sm font-bold text-white"
        >
          <Play className="h-4 w-4" aria-hidden />
          Back to timer
        </button>
      </div>
    </div>
  );
}

function ConsistencyCard({ stat }: { stat: ConsistencyStat }) {
  const trendLabel =
    stat.trend == null
      ? null
      : Math.abs(stat.trend) < 0.05
        ? "Steady"
        : stat.trend < 0
          ? "Getting tighter"
          : "Getting looser";

  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{stat.stepTitle}</p>
          <p className={`mt-0.5 text-[11px] font-bold ${consistencyGradeTone(stat.grade)}`}>
            {consistencyGradeLabel(stat.grade)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-extrabold tabular-nums ${consistencyGradeTone(stat.grade)}`}>
            ±{formatRoutineTimePrecise(stat.spread)}
          </p>
          <p className="text-[10px] text-gray-400">spread</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-stone-100 pt-2 text-center">
        <div>
          <p className="text-[10px] text-gray-400">Avg</p>
          <p className="text-xs font-bold tabular-nums text-gray-900">{formatRoutineTimePrecise(stat.avg)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Latest</p>
          <p className="text-xs font-bold tabular-nums text-gray-900">{formatRoutineTimePrecise(stat.latest)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Reps</p>
          <p className="text-xs font-bold tabular-nums text-gray-900">{stat.count}</p>
        </div>
      </div>
      {trendLabel && (
        <p className="mt-1.5 text-[10px] font-medium text-stone-500">{trendLabel}</p>
      )}
    </div>
  );
}

function HistoryView({
  history,
  partId,
  onBack,
  onClear,
}: {
  history: RoutineTimeLog[];
  partId: RoutineGamePartId;
  onBack: () => void;
  onClear: () => void;
}) {
  const partLabel = ROUTINE_GAME_PARTS.find((p) => p.id === partId)?.label ?? "Routine";
  const rows = history.filter((h) => h.gamePart === partId);
  const stats = consistencyForPart(history, partId);
  const overall = overallConsistency(stats);
  const [filter, setFilter] = useState<string>("all");
  const stageFilters = ["all", ...stats.map((s) => s.stepTitle)];
  const visibleRows =
    filter === "all" ? rows : rows.filter((r) => r.stepTitle.trim() === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Timer
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {partLabel} · history
        </p>
      </div>

      <div className="rounded-xl bg-[#014421] px-3 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Consistency</p>
        {overall ? (
          <>
            <p className="mt-1 text-lg font-extrabold text-[#FFC966]">
              {consistencyGradeLabel(overall.grade)}
            </p>
            <p className="mt-0.5 text-xs text-white/80">
              Avg spread ±{formatRoutineTimePrecise(overall.avgSpread)} across {stats.length} stage
              {stats.length === 1 ? "" : "s"} · {overall.reps} reps
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-white/90">
            Time each stage at least twice to see how consistent you are.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-snug text-white/70">
          Elite routines keep the same rhythm — aim for under half a second of spread.
        </p>
      </div>

      {stats.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            By stage
          </p>
          {stats.map((s) => (
            <ConsistencyCard key={s.stepTitle} stat={s} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white px-3 py-4 text-center text-sm text-gray-500 ring-1 ring-gray-200">
          No times yet. Rehearse and tap Stop &amp; save — every rep is kept here.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Time history
            </p>
            <p className="text-[10px] text-gray-400">{rows.length} logged</p>
          </div>
          {stageFilters.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {stageFilters.map((f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      active
                        ? "bg-[#014421] text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {f === "all" ? "All stages" : f}
                  </button>
                );
              })}
            </div>
          )}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
            {visibleRows.slice(0, 60).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{row.stepTitle || "Step"}</p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(row.at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p className="shrink-0 text-base font-extrabold tabular-nums text-[#014421]">
                  {formatRoutineTimePrecise(row.seconds)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Clear ${partLabel} time history?`)) onClear();
          }}
          className="w-full text-center text-[11px] font-semibold text-gray-400 underline underline-offset-2 hover:text-red-600"
        >
          Clear {partLabel} history
        </button>
      )}
    </div>
  );
}

function RehearseView({
  routine,
  history,
  onBack,
  onSaveStepTime,
  onOpenHistory,
  onPlanStages,
}: {
  routine: GameRoutine;
  history: RoutineTimeLog[];
  onBack: () => void;
  onSaveStepTime: (stepId: string, stepTitle: string, seconds: number) => void;
  onOpenHistory: () => void;
  onPlanStages: () => void;
}) {
  const steps = routine.steps;
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const elapsedRef = useRef(0);
  const step = steps[index];
  const stepIdRef = useRef(step?.id);
  stepIdRef.current = step?.id;
  const stepStat = useMemo(
    () =>
      step?.title
        ? consistencyForStep(history, routine.gamePart, step.title)
        : null,
    [history, routine.gamePart, step?.title],
  );
  const partTimes = history.filter((h) => h.gamePart === routine.gamePart).length;

  useEffect(() => {
    if (!running) return;
    const started = Date.now() - elapsedRef.current;
    const id = window.setInterval(() => {
      const next = Date.now() - started;
      elapsedRef.current = next;
      setElapsedMs(next);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  const stepTitleRef = useRef(step?.title ?? "");
  stepTitleRef.current = step?.title ?? "";

  /** Fresh take every Start — clears the clock then runs. */
  const start = useCallback(() => {
    setJustSaved(false);
    elapsedRef.current = 0;
    setElapsedMs(0);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning((was) => {
      const id = stepIdRef.current;
      if (was && id) {
        const secs = secondsFromMs(elapsedRef.current);
        if (secs > 0) {
          onSaveStepTime(id, stepTitleRef.current, secs);
          setJustSaved(true);
        }
      }
      return false;
    });
  }, [onSaveStepTime]);

  const { listening, supported, error } = useVoiceTimerCommands({
    enabled: voiceOn,
    running,
    onStart: start,
    onStop: stop,
  });

  const wake = useWakeLock(true);

  const resetClock = () => {
    setRunning(false);
    setJustSaved(false);
    elapsedRef.current = 0;
    setElapsedMs(0);
  };

  const go = (next: number) => {
    if (running) stop();
    setJustSaved(false);
    elapsedRef.current = 0;
    setElapsedMs(0);
    setIndex(next);
  };

  if (!step) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Build your system from the questionnaire first.</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[#014421] underline underline-offset-2"
        >
          Back
        </button>
      </div>
    );
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const partLabel =
    ROUTINE_GAME_PARTS.find((p) => p.id === routine.gamePart)?.label ?? "Routine";
  const hint = running
    ? voiceOn
      ? 'Running — say “stop” or tap Stop'
      : "Running — tap Stop when done"
    : voiceOn
      ? 'Ready — say “start” or tap Start'
      : "Ready — tap Start to time this stage";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All parts
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {partLabel} · {index + 1}/{steps.length}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPlanStages}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200"
        >
          <ListOrdered className="h-3.5 w-3.5 text-[#014421]" aria-hidden />
          Plan stages
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200"
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          History{partTimes > 0 ? ` (${partTimes})` : ""}
        </button>
      </div>

      {stepStat && !running && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-gray-200"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              This stage
            </p>
            <p className={`text-xs font-bold ${consistencyGradeTone(stepStat.grade)}`}>
              {consistencyGradeLabel(stepStat.grade)} · ±{formatRoutineTimePrecise(stepStat.spread)}
            </p>
          </div>
          <div className="shrink-0 text-right text-[11px] text-gray-500">
            <p>
              Avg {formatRoutineTimePrecise(stepStat.avg)} · last{" "}
              {formatRoutineTimePrecise(stepStat.latest)}
            </p>
            <p className="text-[#014421] font-semibold">{stepStat.count} reps →</p>
          </div>
        </button>
      )}

      {/* Stage dots */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            className={`h-2.5 rounded-full transition-all ${
              i === index ? "w-6 bg-[#014421]" : "w-2.5 bg-gray-200 hover:bg-gray-300"
            }`}
            aria-label={`Stage ${i + 1}: ${s.title || "Untitled"}`}
            aria-current={i === index ? "step" : undefined}
          />
        ))}
      </div>

      <div
        className={`rounded-2xl px-4 py-6 text-center ring-1 transition-colors ${
          running ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-900 ring-gray-200"
        }`}
      >
        <p
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            running ? "bg-white/15 text-white" : PHASE_TONE[step.phase ?? "physical"]
          }`}
        >
          {routinePhaseLabel(step.phase ?? "physical")}
        </p>
        <p
          className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${
            running ? "text-white/70" : "text-gray-400"
          }`}
        >
          {step.title.trim() || `Stage ${index + 1}`}
        </p>
        <p className="mt-2 text-5xl font-extrabold tabular-nums leading-none tracking-tight">
          {running ? formatRoutineTimePrecise(elapsedMs / 1000) : formatRoutineClock(seconds)}
        </p>
        <p className={`mt-3 text-sm font-medium ${running ? "text-white/85" : "text-gray-600"}`}>
          {hint}
        </p>
        {justSaved && !running && (
          <p className={`mt-1.5 text-xs font-semibold ${running ? "text-white/70" : "text-[#014421]"}`}>
            Time saved for this stage
          </p>
        )}
        {wake.supported && (
          <p className={`mt-2 text-[10px] ${running ? "text-white/55" : "text-gray-400"}`}>
            {wake.active ? "Screen stays on while you rehearse" : "Trying to keep screen on…"}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white px-3 py-3 text-left ring-1 ring-gray-200">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cue</p>
        <p className="mt-1 text-sm leading-snug text-gray-900">
          {step.thoughts.trim() || "No cue — edit your answers."}
        </p>
      </div>

      {hasStepDetails(step) && (
        <div className="grid grid-cols-2 gap-2 text-left text-xs sm:grid-cols-3">
          {stepDetailEntries(step).map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-white px-2.5 py-2 ring-1 ring-gray-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-0.5 font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-4 text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
          >
            <Play className="h-5 w-5 fill-current" aria-hidden />
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-4 text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
          >
            <Square className="h-5 w-5 fill-current" aria-hidden />
            Stop &amp; save
          </button>
        )}
      </div>

      {supported ? (
        <button
          type="button"
          onClick={() => setVoiceOn((v) => !v)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ${
            voiceOn
              ? "bg-[#FFA500]/15 text-orange-900 ring-[#FFA500]/40"
              : "bg-white text-gray-700 ring-gray-200"
          }`}
        >
          {voiceOn ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
          {voiceOn
            ? listening
              ? "Mic on — say “start” or “stop”"
              : "Mic on — connecting…"
            : "Turn mic on for voice commands"}
        </button>
      ) : (
        <p className="text-center text-[11px] text-gray-400">
          Voice needs Chrome or Edge. Use the Start / Stop buttons.
        </p>
      )}
      {error && <p className="text-center text-[11px] text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => go(index - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Prev stage
        </button>
        <button
          type="button"
          onClick={resetClock}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </button>
        <button
          type="button"
          disabled={index >= steps.length - 1}
          onClick={() => go(index + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-30"
        >
          Next stage
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Timer first — plan stages when you want to customise. */
export default function RoutineBuilder({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("parts");
  const [partId, setPartId] = useState<RoutineGamePartId>("tee");
  const [routine, setRoutine] = useState<GameRoutine>(() => starterRoutine("tee"));
  const [history, setHistory] = useState<RoutineTimeLog[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const store = loadRoutineStore();
    const next = getOrCreateRoutine(store, partId);
    setRoutine(next);
    setHistory(store.history ?? []);
    setHydrated(true);
  }, [partId]);

  const answers = useMemo(
    () => normalizeAnswers(routine.answers ?? blankAnswers()),
    [routine.answers],
  );

  const persist = useCallback((next: GameRoutine) => {
    setRoutine(next);
    const store = upsertRoutine(loadRoutineStore(), next);
    saveRoutineStore(store);
    setHistory(store.history ?? []);
  }, []);

  const persistAnswers = useCallback(
    (nextAnswers: RoutineAnswers) => {
      const normalized = normalizeAnswers(nextAnswers);
      persist({
        ...routine,
        answers: normalized,
        steps: buildStepsFromAnswers(normalized, routine.steps),
      });
    },
    [persist, routine],
  );

  const buildSystem = useCallback(() => {
    persistAnswers(answers);
    setMode("system");
  }, [answers, persistAnswers]);

  const openPlanStages = useCallback(() => {
    setMode(answersHaveContent(answers) ? "system" : "quiz");
  }, [answers]);

  const logStepTime = useCallback(
    (stepId: string, stepTitle: string, seconds: number) => {
      const store0 = loadRoutineStore();
      const withTime = upsertRoutine(store0, {
        ...routine,
        steps: routine.steps.map((s) =>
          s.id === stepId ? { ...s, lastSeconds: seconds } : s,
        ),
      });
      const withLog = appendRoutineTimeLog(withTime, {
        gamePart: routine.gamePart,
        stepId,
        stepTitle: stepTitle.trim() || "Step",
        seconds,
      });
      saveRoutineStore(withLog);
      setRoutine(withLog.routines[routine.gamePart] ?? routine);
      setHistory(withLog.history ?? []);
    },
    [routine],
  );

  const storeSummary = useMemo(() => {
    if (!hydrated) return null;
    const store = loadRoutineStore();
    return ROUTINE_GAME_PARTS.map((p) => {
      const r = store.routines[p.id];
      const times = (store.history ?? []).filter((h) => h.gamePart === p.id).length;
      const stats = consistencyForPart(store.history ?? [], p.id);
      const overall = overallConsistency(stats);
      return {
        ...p,
        filled: r ? routineFilledCount(r) : 0,
        steps: r?.steps.length ?? 0,
        times,
        consistency: overall,
      };
    });
  }, [hydrated, routine, history]);

  const partLabel = ROUTINE_GAME_PARTS.find((p) => p.id === partId)?.label ?? "Routine";
  const partTimes = history.filter((h) => h.gamePart === partId).length;

  if (mode === "history") {
    return (
      <HistoryView
        history={history}
        partId={partId}
        onBack={() => setMode("rehearse")}
        onClear={() => {
          const store = loadRoutineStore();
          const next = {
            ...store,
            history: (store.history ?? []).filter((h) => h.gamePart !== partId),
          };
          saveRoutineStore(next);
          setHistory(next.history ?? []);
        }}
      />
    );
  }

  if (mode === "rehearse") {
    return (
      <RehearseView
        routine={routine}
        history={history}
        onBack={() => setMode("parts")}
        onSaveStepTime={logStepTime}
        onOpenHistory={() => setMode("history")}
        onPlanStages={openPlanStages}
      />
    );
  }

  if (mode === "system") {
    return (
      <SystemView
        partLabel={partLabel}
        answers={answers}
        onEditQuiz={() => setMode("quiz")}
        onRehearse={() => setMode("rehearse")}
        onBack={() => setMode("rehearse")}
        onOpenHistory={() => setMode("history")}
        onReorder={(nextOrder) => {
          persistAnswers({ ...answers, stageOrder: nextOrder });
        }}
        partTimes={partTimes}
      />
    );
  }

  if (mode === "quiz") {
    return (
      <QuizView
        partLabel={partLabel}
        answers={answers}
        onChange={persistAnswers}
        onBack={() => setMode("rehearse")}
        onBuild={buildSystem}
        onOpenHistory={() => setMode("history")}
        partTimes={partTimes}
      />
    );
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
            Routine builder
            <span className="rounded bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c77c00]">
              Beta
            </span>
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-gray-500">
            Time your pre-shot routine. Plan the stages when you want to customise.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(storeSummary ?? ROUTINE_GAME_PARTS).map((p) => {
          const steps = "steps" in p ? p.steps : 0;
          const times = "times" in p ? p.times : 0;
          const consistency = "consistency" in p ? p.consistency : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPartId(p.id as RoutineGamePartId);
                setMode("rehearse");
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-200 transition-colors hover:ring-[#014421]/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
                <Play className="h-4 w-4 text-[#014421]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                <span className="block text-xs text-gray-500">
                  {consistency
                    ? `${consistencyGradeLabel(consistency.grade)} · ±${formatRoutineTimePrecise(consistency.avgSpread)} · ${times} reps`
                    : times > 0
                      ? `${times} timed · keep going for consistency`
                      : steps > 0
                        ? `${steps} stages · tap to start timing`
                        : "Tap to start timing"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
