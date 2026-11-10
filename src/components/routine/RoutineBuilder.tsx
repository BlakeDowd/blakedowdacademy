"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  ListOrdered,
  Play,
} from "lucide-react";
import { useVoiceTimerCommands } from "@/hooks/useVoiceTimerCommands";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  ROUTINE_GAME_PARTS,
  STEP_NAME_CHIPS,
  appendRoutineTimeLog,
  blankStep,
  consistencyForStep,
  formatRoutineClock,
  formatRoutineTimePrecise,
  getOrCreateRoutine,
  hasStepDetails,
  loadRoutineStore,
  routineFilledCount,
  saveRoutineStore,
  secondsFromMs,
  starterRoutine,
  stepDetailEntries,
  upsertRoutine,
  type GameRoutine,
  type RoutineGamePartId,
  type RoutineStep,
  type RoutineTimeLog,
} from "@/lib/routineBuilder";

type Mode = "parts" | "edit" | "rehearse" | "history";

const FIELD =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30";

const DETAIL_FIELDS: {
  key: keyof Pick<
    RoutineStep,
    | "club"
    | "targeting"
    | "practiceSwings"
    | "stepCount"
    | "walkingTempo"
    | "gripPressure"
    | "ballPosition"
    | "alignment"
    | "breath"
  >;
  label: string;
  placeholder: string;
}[] = [
  { key: "club", label: "Club from bag", placeholder: "e.g. 7-iron" },
  { key: "targeting", label: "Targeting", placeholder: "e.g. tree left of flag" },
  { key: "practiceSwings", label: "Practice swings", placeholder: "e.g. 2" },
  { key: "stepCount", label: "Walk-in steps", placeholder: "e.g. 3" },
  { key: "walkingTempo", label: "Walking tempo", placeholder: "e.g. slow and even" },
  { key: "gripPressure", label: "Grip pressure", placeholder: "e.g. 3 out of 10" },
  { key: "ballPosition", label: "Ball position", placeholder: "e.g. centre, forward" },
  { key: "alignment", label: "Alignment", placeholder: "e.g. feet open, face square" },
  { key: "breath", label: "Breath / settle", placeholder: "e.g. one out-breath" },
];

function StepEditor({
  step,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  step: RoutineStep;
  index: number;
  onChange: (next: RoutineStep) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(() => hasStepDetails(step));

  return (
    <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-gray-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          Step {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-red-600"
            aria-label={`Remove step ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Name this step
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STEP_NAME_CHIPS.map((chip) => {
            const active = step.title.trim().toLowerCase() === chip.toLowerCase();
            return (
              <button
                key={chip}
                type="button"
                onClick={() => onChange({ ...step, title: chip })}
                aria-pressed={active}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                  active
                    ? "bg-[#014421] text-white ring-[#014421]"
                    : "bg-gray-50 text-gray-700 ring-gray-200 hover:ring-[#014421]/35"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <input
          className={FIELD}
          value={step.title}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
          placeholder="Or type your own name"
          aria-label={`Step ${index + 1} name`}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          What do you do / think here?
        </span>
        <textarea
          className={`${FIELD} min-h-[5rem] resize-y`}
          value={step.thoughts}
          onChange={(e) => onChange({ ...step, thoughts: e.target.value })}
          placeholder="Write it in your words — feel, cue, order, whatever you need to remember"
          rows={3}
        />
      </label>

      {detailsOpen ? (
        <div className="space-y-2 rounded-xl bg-gray-50 p-2.5 ring-1 ring-gray-100">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Pre-shot details
            </p>
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              className="text-[11px] font-semibold text-gray-500 underline underline-offset-2"
            >
              Hide
            </button>
          </div>
          <p className="text-[11px] leading-snug text-gray-500">
            Fill only what this step needs — club, target, grip, swings, walk-in, set-up.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DETAIL_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {f.label}
                </span>
                <input
                  className={FIELD}
                  value={step[f.key]}
                  onChange={(e) => onChange({ ...step, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="text-[11px] font-semibold text-[#014421] underline underline-offset-2"
        >
          {hasStepDetails(step)
            ? "Edit pre-shot details"
            : "Add club, target, grip, swings…"}
        </button>
      )}

      {step.lastSeconds != null && (
        <p className="text-[11px] text-gray-500">
          Last rehearse:{" "}
          <span className="font-semibold tabular-nums text-gray-800">
            {formatRoutineTimePrecise(step.lastSeconds)}
          </span>
        </p>
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
          Tiger Woods&apos; pre-shot routine is almost the same shot to shot — down to about a{" "}
          <span className="font-bold text-[#FFC966]">hundredth of a second</span>. The goal isn&apos;t
          speed. It&apos;s repeating the same rhythm until it feels automatic.
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
          <p className="text-[11px] leading-snug text-gray-500">
            Shrink the spread. Elite is near-identical every time.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white px-3 py-4 text-center text-sm text-gray-500 ring-1 ring-gray-200">
          No times yet. Rehearse a step and tap Stop — each time is saved here to hundredths.
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

  // Keep the screen on the whole rehearsals so the timer isn't interrupted.
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
        <p className="text-sm text-gray-600">Add stages to this routine first.</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[#014421] underline underline-offset-2"
        >
          Back to editor
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
          Edit routine
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
          {running
            ? "Say “stop” or tap Stop — time saves to hundredths"
            : "Say “start” or tap Start"}
        </p>
        {wake.supported && (
          <p className={`mt-1.5 text-[10px] ${running ? "text-white/55" : "text-gray-400"}`}>
            {wake.active ? "Screen stays on while you rehearse" : "Trying to keep screen on…"}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white px-3 py-3 text-left ring-1 ring-gray-200">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          What you do / think
        </p>
        <p className="mt-1 text-sm leading-snug text-gray-900">
          {step.thoughts.trim() || "No notes yet — add them in Edit routine."}
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
        {voiceOn
          ? listening
            ? "Listening for start / stop"
            : "Voice on…"
          : "Voice start / stop"}
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

/** Script and rehearse pre-shot routines for each part of the game. */
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

  const persist = useCallback((next: GameRoutine) => {
    setRoutine(next);
    const store = upsertRoutine(loadRoutineStore(), next);
    saveRoutineStore(store);
    setHistory(store.history ?? []);
  }, []);

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

  const updateStep = (stepId: string, next: RoutineStep) => {
    persist({ ...routine, steps: routine.steps.map((s) => (s.id === stepId ? next : s)) });
  };

  const removeStep = (stepId: string) => {
    if (routine.steps.length <= 1) return;
    persist({ ...routine, steps: routine.steps.filter((s) => s.id !== stepId) });
  };

  const addStep = () => {
    persist({ ...routine, steps: [...routine.steps, blankStep()] });
  };

  const resetStarter = () => {
    if (!confirm("Replace this routine with the starter stages?")) return;
    persist(starterRoutine(partId));
  };

  const storeSummary = useMemo(() => {
    if (!hydrated) return null;
    const store = loadRoutineStore();
    return ROUTINE_GAME_PARTS.map((p) => {
      const r = store.routines[p.id];
      return { ...p, filled: r ? routineFilledCount(r) : 0, steps: r?.steps.length ?? 0 };
    });
  }, [hydrated, routine]);

  if (mode === "history") {
    return (
      <HistoryView
        history={history}
        partId={partId}
        onBack={() => setMode("edit")}
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
        onBack={() => setMode("edit")}
        onSaveStepTime={logStepTime}
        onOpenHistory={() => setMode("history")}
      />
    );
  }

  if (mode === "edit") {
    const label = ROUTINE_GAME_PARTS.find((p) => p.id === partId)?.label ?? "Routine";
    const partTimes = history.filter((h) => h.gamePart === partId).length;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMode("parts")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            All parts
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("history")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#014421]"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              Times{partTimes > 0 ? ` (${partTimes})` : ""}
            </button>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          </div>
        </div>

        <p className="text-xs leading-snug text-gray-500">
          Name each step, write what you do and think, then add pre-shot details only where they matter
          (club, target, grip, swings, walk-in…).
        </p>

        <div className="space-y-2.5">
          {routine.steps.map((step, i) => (
            <StepEditor
              key={step.id}
              step={step}
              index={i}
              onChange={(next) => updateStep(step.id, next)}
              onRemove={() => removeStep(step.id)}
              canRemove={routine.steps.length > 1}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addStep}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#014421]/30 py-2.5 text-sm font-bold text-[#014421]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add step
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetStarter}
            className="rounded-xl bg-white py-2.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200"
          >
            Reset starter
          </button>
          <button
            type="button"
            onClick={() => setMode("rehearse")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-2.5 text-sm font-bold text-white"
          >
            <Play className="h-4 w-4" aria-hidden />
            Rehearse
          </button>
        </div>
      </div>
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
            Script your routine for each part of the game, then rehearse it on a timer. Voice says start
            and stop only.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(storeSummary ?? ROUTINE_GAME_PARTS).map((p) => {
          const filled = "filled" in p ? p.filled : 0;
          const steps = "steps" in p ? p.steps : 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPartId(p.id as RoutineGamePartId);
                setMode("edit");
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-gray-200 transition-colors hover:ring-[#014421]/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
                <ListOrdered className="h-4 w-4 text-[#014421]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                <span className="block text-xs text-gray-500">
                  {steps > 0
                    ? `${steps} step${steps === 1 ? "" : "s"}${filled > 0 ? ` · ${filled} filled` : ""}`
                    : "Tap to script your routine"}
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
