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
  ROUTINE_QUIZ_QUESTIONS,
  answersHaveContent,
  appendRoutineTimeLog,
  blankAnswers,
  buildStepsFromAnswers,
  consistencyForStep,
  formatRoutineClock,
  formatRoutineTimePrecise,
  getOrCreateRoutine,
  hasStepDetails,
  loadRoutineStore,
  normalizeAnswers,
  reorderStageIds,
  routineFilledCount,
  saveRoutineStore,
  secondsFromMs,
  starterRoutine,
  stepDetailEntries,
  systemStagesFromAnswers,
  upsertRoutine,
  type GameRoutine,
  type RoutineAnswers,
  type RoutineExtra,
  type RoutineGamePartId,
  type RoutineTimeLog,
} from "@/lib/routineBuilder";

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
          All parts
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

      <div className="flex gap-1" aria-hidden>
        {ROUTINE_QUIZ_QUESTIONS.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= quizIndex ? "bg-[#014421]" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
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
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Your system</p>
        <p className="mt-0.5 text-sm font-semibold">Same order, every shot — drag with the arrows</p>
      </div>

      <ol className="space-y-0">
        {stages.map((stage, i) => (
          <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < stages.length - 1 && (
              <span
                className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-[#014421]/20"
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
          Rehearse
        </button>
      </div>
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
  const titles = [...new Set(rows.map((r) => r.stepTitle.trim()).filter(Boolean))];
  const stats = titles
    .map((t) => consistencyForStep(rows, partId, t))
    .filter((s): s is NonNullable<typeof s> => s != null)
    .sort((a, b) => a.spread - b.spread);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {partLabel} · times
        </p>
      </div>

      <div className="rounded-xl bg-[#014421] px-3 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Why this matters</p>
        <p className="mt-1 text-sm leading-snug text-white/95">
          Elite routines repeat the same rhythm — down to about a{" "}
          <span className="font-bold text-[#FFC966]">hundredth of a second</span>. Shrink the spread.
        </p>
      </div>

      {stats.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Consistency (last reps)
          </p>
          {stats.map((s) => (
            <div
              key={s.stepTitle}
              className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-gray-200"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{s.stepTitle}</p>
                <p className="text-[11px] text-gray-500">
                  Avg {formatRoutineTimePrecise(s.avg)} · {s.count} reps
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-extrabold tabular-nums ${
                    s.spread <= 0.5 ? "text-green-700" : s.spread <= 1.5 ? "text-[#014421]" : "text-orange-700"
                  }`}
                >
                  ±{formatRoutineTimePrecise(s.spread)}
                </p>
                <p className="text-[10px] text-gray-400">spread</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white px-3 py-4 text-center text-sm text-gray-500 ring-1 ring-gray-200">
          No times yet. Rehearse and tap Stop — times save to hundredths.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
          {rows.slice(0, 40).map((row) => (
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
  onBack,
  onSaveStepTime,
  onOpenHistory,
}: {
  routine: GameRoutine;
  onBack: () => void;
  onSaveStepTime: (stepId: string, stepTitle: string, seconds: number) => void;
  onOpenHistory: () => void;
}) {
  const steps = routine.steps;
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const elapsedRef = useRef(0);
  const step = steps[index];
  const stepIdRef = useRef(step?.id);
  stepIdRef.current = step?.id;

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

  const start = useCallback(() => {
    setRunning(true);
  }, []);

  const stepTitleRef = useRef(step?.title ?? "");
  stepTitleRef.current = step?.title ?? "";

  const stop = useCallback(() => {
    setRunning((was) => {
      const id = stepIdRef.current;
      if (was && id) {
        const secs = secondsFromMs(elapsedRef.current);
        onSaveStepTime(id, stepTitleRef.current, secs);
      }
      return false;
    });
  }, [onSaveStepTime]);

  const { listening, supported, error } = useVoiceTimerCommands({
    enabled: voiceOn,
    onStart: start,
    onStop: stop,
  });

  const wake = useWakeLock(true);

  const resetClock = () => {
    setRunning(false);
    elapsedRef.current = 0;
    setElapsedMs(0);
  };

  const go = (next: number) => {
    if (running) stop();
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Your system
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Times
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {partLabel} · {index + 1}/{steps.length}
          </p>
        </div>
      </div>

      <div
        className={`rounded-2xl px-4 py-5 text-center ring-1 ${
          running ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-900 ring-gray-200"
        }`}
      >
        <p
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            running ? "text-white/70" : "text-gray-400"
          }`}
        >
          {step.title.trim() || `Stage ${index + 1}`}
        </p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums leading-none">
          {running ? formatRoutineTimePrecise(elapsedMs / 1000) : formatRoutineClock(seconds)}
        </p>
        <p className={`mt-2 text-xs ${running ? "text-white/75" : "text-gray-500"}`}>
          {running ? "Say “stop” or tap Stop" : "Say “start” or tap Start"}
        </p>
        {wake.supported && (
          <p className={`mt-1.5 text-[10px] ${running ? "text-white/55" : "text-gray-400"}`}>
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
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          <Play className="h-4 w-4" aria-hidden />
          Start
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!running}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-3.5 text-sm font-extrabold text-gray-800 disabled:opacity-40"
        >
          <Square className="h-4 w-4 text-red-500" aria-hidden />
          Stop
        </button>
      </div>

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
        {voiceOn ? (listening ? "Listening for start / stop" : "Voice on…") : "Voice start / stop"}
      </button>
      {!supported && (
        <p className="text-center text-[11px] text-gray-400">
          Voice works best in Chrome or Edge. Buttons always work.
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
          Prev
        </button>
        <button
          type="button"
          onClick={resetClock}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset clock
        </button>
        <button
          type="button"
          disabled={index >= steps.length - 1}
          onClick={() => go(index + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-30"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Questionnaire → system view → rehearse timer for each part of the game. */
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
      return { ...p, filled: r ? routineFilledCount(r) : 0, steps: r?.steps.length ?? 0 };
    });
  }, [hydrated, routine]);

  const partLabel = ROUTINE_GAME_PARTS.find((p) => p.id === partId)?.label ?? "Routine";
  const partTimes = history.filter((h) => h.gamePart === partId).length;

  if (mode === "history") {
    return (
      <HistoryView
        history={history}
        partId={partId}
        onBack={() => setMode(answersHaveContent(answers) ? "system" : "quiz")}
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
        onBack={() => setMode("system")}
        onSaveStepTime={logStepTime}
        onOpenHistory={() => setMode("history")}
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
        onBack={() => setMode("parts")}
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
        onBack={() => setMode("parts")}
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
            Answer a few questions, see your system, then rehearse it on a timer.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(storeSummary ?? ROUTINE_GAME_PARTS).map((p) => {
          const filled = "filled" in p ? p.filled : 0;
          const has = filled > 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPartId(p.id as RoutineGamePartId);
                const store = loadRoutineStore();
                const r = store.routines[p.id as RoutineGamePartId];
                const a = normalizeAnswers(r?.answers);
                setMode(answersHaveContent(a) ? "system" : "quiz");
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-200 transition-colors hover:ring-[#014421]/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
                <ListOrdered className="h-4 w-4 text-[#014421]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                <span className="block text-xs text-gray-500">
                  {has ? `${filled} stage system` : "Answer questions to build your system"}
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
