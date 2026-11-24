"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Pause,
  Play,
  Plus,
  Timer,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackToolUse } from "@/lib/appUsage";
import {
  DEFAULT_REST_SEC,
  MUSCLE_GROUPS,
  addCustomExercise,
  allExercises,
  completedSetCount,
  deleteCustomExercise,
  deleteRoutine,
  deleteWorkout,
  exerciseUsesBodyweight,
  finishWorkout,
  formatElapsedClock,
  formatLastPerformance,
  formatSetShort,
  formatWorkoutDuration,
  isSetPersonalBest,
  lastPerformanceForExercise,
  loadActiveWorkout,
  loadBodyWeightKg,
  loadRoutines,
  loadWorkouts,
  newEmptySet,
  pauseWorkoutTimer,
  previousSetForIndex,
  saveActiveWorkout,
  saveBodyWeightKg,
  sessionHasBodyweightExercise,
  sessionTotalReps,
  sessionVolumeKg,
  startEmptyWorkout,
  startWorkoutFromRoutine,
  startWorkoutTimer,
  upsertRoutine,
  workoutDurationMinutes,
  workoutElapsedMs,
  workoutExerciseFromLibrary,
  workoutTrendSeries,
  type Exercise,
  type MuscleGroup,
  type PersonalBestHit,
  type WorkoutExercise,
  type WorkoutRoutine,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/weightTraining";

type Tab = "workout" | "routines" | "history" | "exercises";

type MuscleFilter = MuscleGroup | "All";

const MUSCLE_FILTERS: MuscleFilter[] = ["All", ...MUSCLE_GROUPS];

/** Horizontal category slider with prev/next — easy to reach Golf → Legs → Back on phone. */
function MuscleCategorySlider({
  value,
  onChange,
}: {
  value: MuscleFilter;
  onChange: (next: MuscleFilter) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, MUSCLE_FILTERS.indexOf(value));

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const chip = scroller.querySelector<HTMLElement>(`[data-muscle="${value}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [value]);

  const step = (dir: -1 | 1) => {
    const next = MUSCLE_FILTERS[(index + dir + MUSCLE_FILTERS.length) % MUSCLE_FILTERS.length];
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1 border border-[#014421]/15 bg-[#fffef9]">
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex h-9 w-8 shrink-0 items-center justify-center border-r border-[#014421]/12 text-[#014421] active:bg-[#014421]/8"
        aria-label="Previous category"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <div
        ref={scrollerRef}
        className="flex min-w-0 flex-1 gap-0 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {MUSCLE_FILTERS.map((m) => {
          const on = value === m;
          return (
            <button
              key={m}
              type="button"
              data-muscle={m}
              onClick={() => onChange(m)}
              className={`snap-center shrink-0 border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
                on
                  ? "border-[#014421] bg-[#014421] text-white"
                  : "border-transparent text-stone-500 hover:bg-[#014421]/5 hover:text-[#014421]"
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        className="flex h-9 w-8 shrink-0 items-center justify-center border-l border-[#014421]/12 text-[#014421] active:bg-[#014421]/8"
        aria-label="Next category"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs]);
  return now;
}

const SET_GRID =
  "grid-cols-[1.35rem_minmax(2.6rem,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_1.65rem_1.35rem]";

function SetRow({
  set,
  index,
  previousLabel,
  isPb,
  usesBodyweight,
  onChange,
  onRemove,
  onCompleted,
}: {
  set: WorkoutSet;
  index: number;
  previousLabel: string;
  isPb?: boolean;
  usesBodyweight?: boolean;
  onChange: (next: WorkoutSet) => void;
  onRemove: () => void;
  onCompleted?: () => void;
}) {
  const done = set.completed;
  const fieldClass = `h-8 w-full min-w-0 border px-1 text-center text-xs tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
    done
      ? "border-[#014421]/35 bg-[#014421]/6 font-semibold text-[#014421] focus:border-[#014421]"
      : "border-[#014421]/15 bg-white text-stone-900 focus:border-[#014421]"
  }`;
  return (
    <div
      className={`grid ${SET_GRID} items-center gap-1 border-b border-[#014421]/08 px-0.5 py-1 ${
        isPb ? "bg-[#FFA500]/10" : done ? "bg-[#014421]/5" : "bg-transparent"
      }`}
    >
      <span
        className={`text-center text-[11px] font-bold tabular-nums ${
          isPb ? "text-[#b45309]" : done ? "text-[#014421]" : "text-stone-400"
        }`}
      >
        {index + 1}
      </span>
      <span
        className="truncate text-center font-mono text-[10px] font-medium tabular-nums text-stone-400"
        title={previousLabel || "No previous"}
      >
        {previousLabel || "—"}
      </span>
      <input
        type="number"
        inputMode="decimal"
        placeholder={usesBodyweight ? "+kg" : "kg"}
        value={set.weight ?? ""}
        onChange={(e) => {
          const t = e.target.value.trim();
          onChange({ ...set, weight: t === "" ? null : Number(t) });
        }}
        className={fieldClass}
      />
      <input
        type="number"
        inputMode="numeric"
        placeholder="reps"
        value={set.reps ?? ""}
        onChange={(e) => {
          const t = e.target.value.trim();
          onChange({ ...set, reps: t === "" ? null : Math.round(Number(t)) });
        }}
        className={fieldClass}
      />
      <button
        type="button"
        onClick={() => {
          const next = !set.completed;
          onChange({ ...set, completed: next });
          if (next) onCompleted?.();
        }}
        aria-label={set.completed ? "Mark set incomplete" : "Complete set"}
        className={`mx-auto flex h-7 w-7 items-center justify-center border ${
          isPb
            ? "border-[#FFA500] bg-[#FFA500] text-white"
            : done
              ? "border-[#014421] bg-[#014421] text-white"
              : "border-[#014421]/20 bg-transparent text-stone-400"
        }`}
      >
        {isPb ? <Trophy className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove set"
        className="mx-auto flex h-7 w-7 items-center justify-center text-stone-300 hover:bg-stone-100 hover:text-stone-600"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function BodyWeightField({
  value,
  onChange,
  emphasize,
}: {
  value: number | null;
  onChange: (kg: number | null) => void;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 border px-3 py-2 ${
        emphasize ? "border-[#FFA500] bg-[#FFA500]/10" : "strength-panel"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="strength-display text-sm font-semibold uppercase tracking-wide text-[#014421]">
          Body weight
        </p>
        <p className="text-[11px] text-stone-500">
          {emphasize
            ? "Needed so pull-ups, push-ups and other BW moves count in volume"
            : "Added to bodyweight exercises (+ any extra kg on the set)"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step={0.1}
          placeholder="kg"
          value={value ?? ""}
          onChange={(e) => {
            const t = e.target.value.trim();
            const n = t === "" ? null : Number(t);
            onChange(n != null && Number.isFinite(n) && n > 0 ? n : null);
          }}
          className="h-9 w-16 border border-[#014421]/20 bg-white px-1.5 text-center text-sm font-semibold tabular-nums focus:border-[#014421] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs font-semibold text-stone-400">kg</span>
      </div>
    </div>
  );
}

function HistoryTrendCharts({ workouts }: { workouts: WorkoutSession[] }) {
  const series = useMemo(() => workoutTrendSeries(workouts, 12), [workouts]);
  if (series.length < 1) return null;

  const charts: { key: "volumeKg" | "reps" | "durationMin"; label: string; unit: string; color: string }[] = [
    { key: "volumeKg", label: "Volume", unit: "kg", color: "#014421" },
    { key: "reps", label: "Reps", unit: "", color: "#FFA500" },
    { key: "durationMin", label: "Duration", unit: "min", color: "#0b6634" },
  ];

  return (
    <section className="strength-panel border-l-4 border-l-[#014421] p-3">
      <p className="strength-display text-base font-bold uppercase tracking-wide text-[#014421]">Over time</p>
      <p className="mt-0.5 text-[11px] text-stone-500">
        Last {series.length} workout{series.length === 1 ? "" : "s"}
      </p>
      <div className="mt-3 space-y-4">
        {charts.map((c) => {
          const values = series.map((p) => p[c.key]);
          const max = Math.max(...values, 1);
          const latest = values[values.length - 1] ?? 0;
          return (
            <div key={c.key} className="border-t border-[#014421]/10 pt-2">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">{c.label}</p>
                <p className="font-mono text-[11px] font-semibold tabular-nums text-stone-700">
                  {latest}
                  {c.unit ? ` ${c.unit}` : ""}
                </p>
              </div>
              <div className="flex h-12 items-end gap-px border-b border-[#014421]/20">
                {series.map((p, i) => {
                  const v = values[i] ?? 0;
                  const h = Math.max(4, Math.round((v / max) * 100));
                  return (
                    <div
                      key={p.id}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={`${p.label}: ${v}${c.unit ? ` ${c.unit}` : ""}`}
                    >
                      <div
                        className="w-full"
                        style={{
                          height: `${h}%`,
                          backgroundColor: c.color,
                          opacity: 0.65 + (i / Math.max(1, series.length - 1)) * 0.35,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9px] text-stone-400">
                <span>{series[0]?.label}</span>
                <span>{series[series.length - 1]?.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CustomExerciseForm({
  onCreated,
  onCancel,
}: {
  onCreated: (ex: Exercise) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup>("Golf");
  const [equipment, setEquipment] = useState("");
  const [grip, setGrip] = useState("");

  const save = () => {
    if (!name.trim()) return;
    onCreated(
      addCustomExercise({
        name: name.trim(),
        muscle,
        equipment: equipment.trim() || undefined,
        grip: grip.trim() || undefined,
      }),
    );
  };

  return (
    <div className="space-y-3 border-b border-[#014421]/15 bg-[#fffef9] px-3 py-3">
      <p className="strength-display text-lg font-bold uppercase tracking-wide text-[#014421]">
        Create exercise
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        className="w-full border border-[#014421]/20 bg-white px-3 py-2.5 text-sm focus:border-[#014421] focus:outline-none"
      />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Muscle group
        </span>
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.target.value as MuscleGroup)}
          className="w-full border border-[#014421]/20 bg-white px-3 py-2.5 text-sm focus:border-[#014421] focus:outline-none"
        >
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <input
        value={equipment}
        onChange={(e) => setEquipment(e.target.value)}
        placeholder="Tool / equipment (e.g. cable, dumbbell, band)"
        className="w-full border border-[#014421]/20 bg-white px-3 py-2.5 text-sm focus:border-[#014421] focus:outline-none"
      />
      <input
        value={grip}
        onChange={(e) => setGrip(e.target.value)}
        placeholder="Grip / stance (e.g. overhand, neutral, sumo)"
        className="w-full border border-[#014421]/20 bg-white px-3 py-2.5 text-sm focus:border-[#014421] focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-[#014421]/20 px-3 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="flex-1 bg-[#014421] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          Save &amp; add
        </button>
      </div>
    </div>
  );
}

function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [muscle, setMuscle] = useState<MuscleFilter>("Golf");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [catalog, setCatalog] = useState(() => allExercises());
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return catalog.filter((e) => {
      if (muscle !== "All" && e.muscle !== muscle) return false;
      if (!query) return true;
      return (
        e.name.toLowerCase().includes(query) ||
        (e.equipment ?? "").toLowerCase().includes(query) ||
        (e.grip ?? "").toLowerCase().includes(query)
      );
    });
  }, [muscle, q, catalog]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex justify-center bg-[#014421]/55 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex h-full w-full max-w-md flex-col bg-[#f3f1ea] pt-[env(safe-area-inset-top)]">
        <header className="flex shrink-0 items-center gap-1.5 border-b border-[#014421]/15 bg-[#fffef9] px-2 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#014421] hover:bg-[#014421]/8"
            aria-label="Close"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <h2 className="strength-display min-w-0 flex-1 truncate text-xl font-bold uppercase tracking-wide text-[#014421]">
            Add exercise
          </h2>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="shrink-0 border border-[#014421] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#014421]"
            >
              + Custom
            </button>
          )}
        </header>
        {creating ? (
          <div className="shrink-0 overflow-y-auto">
            <CustomExerciseForm
              onCancel={() => setCreating(false)}
              onCreated={(ex) => {
                setCatalog(allExercises());
                setCreating(false);
                onPick(ex);
              }}
            />
          </div>
        ) : (
          <div className="shrink-0 space-y-2 border-b border-[#014421]/15 bg-[#fffef9] px-2.5 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, tool or grip"
              autoFocus
              className="w-full border border-[#014421]/20 bg-white px-2.5 py-1.5 text-sm focus:border-[#014421] focus:outline-none"
            />
            <MuscleCategorySlider value={muscle} onChange={setMuscle} />
            <p className="font-mono text-[10px] font-medium text-stone-400">
              {list.length} exercise{list.length === 1 ? "" : "s"}
              {muscle !== "All" ? ` in ${muscle}` : ""}
            </p>
          </div>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          {list.map((ex) => {
            const last = formatLastPerformance(lastPerformanceForExercise(ex.id));
            const meta = [ex.equipment, ex.grip].filter(Boolean).join(" · ");
            return (
              <li key={ex.id} className="border-b border-[#014421]/08">
                <button
                  type="button"
                  onClick={() => onPick(ex)}
                  className="flex w-full items-center gap-2 px-1.5 py-2 text-left active:bg-[#014421]/6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-semibold leading-tight text-stone-900">
                        {ex.name}
                      </span>
                      {ex.custom ? (
                        <span className="shrink-0 bg-[#FFA500]/20 px-1 text-[9px] font-bold uppercase text-[#9a3412]">
                          Yours
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] leading-tight text-stone-500">
                      <span className="shrink-0">{ex.muscle}</span>
                      {meta ? <span className="truncate">· {meta}</span> : null}
                      {last ? <span className="truncate font-medium text-[#014421]">· Last {last}</span> : null}
                    </span>
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
                </button>
              </li>
            );
          })}
          {list.length === 0 && !creating && (
            <p className="py-8 text-center text-sm text-stone-500">No exercises match.</p>
          )}
        </ul>
      </div>
    </div>
  );
}

function ActiveWorkout({
  session,
  onChange,
  onFinish,
  onDiscard,
}: {
  session: WorkoutSession;
  onChange: (next: WorkoutSession) => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [restSec, setRestSec] = useState<number | null>(null);
  const [restTarget, setRestTarget] = useState(DEFAULT_REST_SEC);
  const timerRunning = Boolean(session.timerStartedAt);
  const now = useNow(timerRunning);
  const elapsed = formatElapsedClock(workoutElapsedMs(session, now));
  const volume = Math.round(sessionVolumeKg(session));
  const setsDone = completedSetCount(session);
  const needsBw = sessionHasBodyweightExercise(session);
  const bodyKg = session.bodyWeightKg ?? loadBodyWeightKg();

  useEffect(() => {
    if (restSec == null || restSec <= 0) return;
    const id = window.setTimeout(() => setRestSec((s) => (s == null ? null : s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [restSec]);

  const startRest = () => {
    setRestSec(restTarget);
  };

  const setBodyWeight = (kg: number | null) => {
    saveBodyWeightKg(kg);
    onChange({ ...session, bodyWeightKg: kg });
  };

  const updateExercise = (id: string, patch: Partial<WorkoutExercise> | ((e: WorkoutExercise) => WorkoutExercise)) => {
    onChange({
      ...session,
      exercises: session.exercises.map((e) => {
        if (e.id !== id) return e;
        return typeof patch === "function" ? patch(e) : { ...e, ...patch };
      }),
    });
  };

  const addExercise = (ex: Exercise) => {
    onChange({
      ...session,
      exercises: [...session.exercises, workoutExerciseFromLibrary(ex)],
    });
    setPicking(false);
  };

  if (picking) return <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={session.title}
          onChange={(e) => onChange({ ...session, title: e.target.value })}
          className="strength-display min-w-0 flex-1 border border-[#014421]/20 bg-[#fffef9] px-3 py-2 text-xl font-bold uppercase tracking-wide text-[#014421] focus:border-[#014421] focus:outline-none"
        />
        <button
          type="button"
          onClick={onDiscard}
          className="border border-red-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 hover:bg-red-50"
        >
          Discard
        </button>
      </div>

      <div
        className={`border ${
          timerRunning ? "border-[#014421] bg-[#014421] text-white" : "border-[#014421]/20 bg-[#fffef9]"
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                timerRunning ? "text-[#FFC966]" : "text-stone-400"
              }`}
            >
              {timerRunning ? "Timer running" : session.timerOffsetMs > 0 ? "Timer paused" : "Workout timer"}
            </p>
            <p
              className={`strength-display mt-0.5 text-4xl font-bold tabular-nums leading-none ${
                timerRunning ? "text-white" : "text-[#014421]"
              }`}
            >
              {elapsed}
            </p>
          </div>
          {timerRunning ? (
            <button
              type="button"
              onClick={() => onChange(pauseWorkoutTimer(session))}
              className="inline-flex items-center gap-2 border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white active:bg-white/20"
            >
              <Pause className="h-5 w-5" aria-hidden />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange(startWorkoutTimer(session))}
              className="inline-flex items-center gap-2 bg-[#FFA500] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm active:brightness-95"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden />
              {session.timerOffsetMs > 0 ? "Resume" : "Start timer"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 divide-x divide-[#014421]/15 border-t border-[#014421]/15 bg-[#fffef9]">
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Volume</p>
            <p className="strength-display mt-0.5 text-2xl font-bold tabular-nums text-stone-900">
              {volume}
              <span className="ml-0.5 text-xs font-semibold text-stone-400">kg</span>
            </p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Sets</p>
            <p className="strength-display mt-0.5 text-2xl font-bold tabular-nums text-stone-900">{setsDone}</p>
          </div>
        </div>
        <p
          className={`border-t px-3 py-1.5 text-center text-[10px] font-medium ${
            timerRunning
              ? "border-white/15 bg-[#014421] text-white/70"
              : "border-[#014421]/10 bg-[#fffef9] text-stone-400"
          }`}
        >
          Autosaved on this device · timer keeps running if you leave and come back
        </p>
      </div>

      {(needsBw || bodyKg != null) && (
        <BodyWeightField value={bodyKg} onChange={setBodyWeight} emphasize={needsBw && !(bodyKg != null && bodyKg > 0)} />
      )}

      {restSec != null && restSec > 0 && (
        <div className="flex items-center gap-3 border border-[#014421] bg-[#014421] px-3 py-3 text-white">
          <Timer className="h-5 w-5 shrink-0 text-[#FFC966]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFC966]">Rest</p>
            <p className="strength-display text-3xl font-bold tabular-nums leading-none">
              {formatElapsedClock(restSec * 1000)}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setRestSec((s) => Math.max(0, (s ?? 0) - 15))}
              className="border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-bold"
            >
              −15
            </button>
            <button
              type="button"
              onClick={() => setRestSec((s) => (s ?? 0) + 15)}
              className="border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-bold"
            >
              +15
            </button>
            <button
              type="button"
              onClick={() => setRestSec(null)}
              className="bg-[#FFA500] px-2.5 py-1.5 text-xs font-bold text-white"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {session.exercises.map((ex) => {
        const last = formatLastPerformance(lastPerformanceForExercise(ex.exerciseId));
        const usesBw = exerciseUsesBodyweight(ex);
        return (
        <section key={ex.id} className="strength-panel border-l-4 border-l-[#014421] p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="strength-display text-lg font-bold uppercase tracking-wide text-[#014421]">
                {ex.name}
              </h3>
              <p className="text-[11px] text-stone-500">
                {ex.muscle}
                {ex.equipment ? ` · ${ex.equipment}` : ""}
                {ex.grip ? ` · ${ex.grip}` : ""}
                {usesBw ? " · uses body weight" : ""}
              </p>
              {last ? (
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-[#014421]">Last: {last}</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-stone-400">No previous log — set your first baseline</p>
              )}
              {usesBw && (
                <p className="mt-0.5 text-[10px] text-stone-400">
                  Enter extra load in +kg (vest/plates). Volume = body weight{bodyKg ? ` (${bodyKg} kg)` : ""} + extra × reps.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({ ...session, exercises: session.exercises.filter((e) => e.id !== ex.id) })
              }
              className="p-1.5 text-stone-300 hover:bg-stone-100 hover:text-stone-600"
              aria-label={`Remove ${ex.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className={`mb-1 grid ${SET_GRID} gap-1 border-b border-[#014421]/15 pb-1 text-[10px] font-bold uppercase tracking-wide text-stone-400`}>
            <span className="text-center">#</span>
            <span className="text-center">Prev</span>
            <span className="text-center">{usesBw ? "+kg" : "kg"}</span>
            <span className="text-center">Reps</span>
            <span className="text-center">✓</span>
            <span />
          </div>

          <div className="space-y-1.5">
            {ex.sets.map((set, i) => {
              const prev = previousSetForIndex(ex.exerciseId, i);
              const pb = isSetPersonalBest(ex.exerciseId, set, session.id, ex, bodyKg);
              return (
              <SetRow
                key={set.id}
                set={set}
                index={i}
                previousLabel={formatSetShort(prev, { bodyweight: usesBw })}
                isPb={pb}
                usesBodyweight={usesBw}
                onChange={(next) =>
                  updateExercise(ex.id, { sets: ex.sets.map((s) => (s.id === set.id ? next : s)) })
                }
                onCompleted={startRest}
                onRemove={() =>
                  updateExercise(ex.id, {
                    sets: ex.sets.length > 1 ? ex.sets.filter((s) => s.id !== set.id) : ex.sets,
                  })
                }
              />
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => updateExercise(ex.id, { sets: [...ex.sets, newEmptySet()] })}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[#014421]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add set
          </button>
        </section>
        );
      })}

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-[#014421]/40 bg-[#014421]/5 py-3 text-sm font-bold uppercase tracking-wide text-[#014421]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add exercise
      </button>

      <div className="flex items-center justify-between gap-2 border border-[#014421]/12 bg-[#fffef9] px-3 py-2">
        <p className="text-xs font-medium text-stone-600">Rest between sets</p>
        <div className="flex items-center gap-1">
          {[60, 90, 120, 180].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setRestTarget(sec)}
              className={`border px-2.5 py-1 text-[11px] font-bold ${
                restTarget === sec
                  ? "border-[#014421] bg-[#014421] text-white"
                  : "border-[#014421]/15 bg-white text-stone-600"
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onFinish}
        disabled={completedSetCount(session) === 0}
        className="flex w-full items-center justify-center gap-2 bg-[#FFA500] py-3.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
      >
        Finish workout
      </button>
    </div>
  );
}

/** Blake Dowd strength log: live workout, routines, history, exercise library. */
export function WeightTrainingApp() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("workout");
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
  const [muscle, setMuscle] = useState<MuscleFilter>("All");
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [creatingEx, setCreatingEx] = useState(false);
  const [catalog, setCatalog] = useState(() => allExercises());
  const [pbCelebration, setPbCelebration] = useState<PersonalBestHit[] | null>(null);

  const refresh = () => {
    setActive(loadActiveWorkout());
    setHistory(loadWorkouts());
    setRoutines(loadRoutines());
  };

  useEffect(() => {
    refresh();
    setReady(true);
    trackToolUse("weight-training");
  }, []);

  /** Flush in-progress workout when the tab hides — no leave prompt (autosave already keeps it). */
  useEffect(() => {
    if (!active) return;
    const flush = () => saveActiveWorkout(active);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [active]);

  const persistActive = (next: WorkoutSession | null) => {
    setActive(next);
    saveActiveWorkout(next);
  };

  const startEmpty = () => {
    const name = window.prompt("Name this workout", "Workout");
    if (name == null) return;
    const title = name.trim() || "Workout";
    const session = startEmptyWorkout(title);
    persistActive(session);
    setTab("workout");
  };

  const startRoutine = (routine: WorkoutRoutine) => {
    const name = window.prompt("Name this workout", routine.name);
    if (name == null) return;
    const session = startWorkoutFromRoutine(routine);
    persistActive({ ...session, title: name.trim() || routine.name });
    setTab("workout");
  };

  const finish = async () => {
    if (!active || finishing) return;
    let sessionToFinish = active;
    if (sessionHasBodyweightExercise(active) && !(sessionToFinish.bodyWeightKg ?? loadBodyWeightKg())) {
      const raw = window.prompt(
        "Enter your body weight (kg) so pull-ups, push-ups and other bodyweight moves count toward volume",
        "",
      );
      if (raw == null) return;
      const kg = Number(raw.trim());
      if (Number.isFinite(kg) && kg > 0) {
        saveBodyWeightKg(kg);
        sessionToFinish = { ...active, bodyWeightKg: kg };
        persistActive(sessionToFinish);
      }
    }
    if (!window.confirm("Finish this workout and save it to your history and calendar?")) return;
    setFinishing(true);
    try {
      const finished = finishWorkout(sessionToFinish);
      if (user?.id) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const mins = workoutDurationMinutes(finished);
          const vol = Math.round(sessionVolumeKg(finished));
          const title = finished.title.trim() || "Gym Planner";
          const pbNote =
            finished.personalBests && finished.personalBests.length > 0
              ? ` · ${finished.personalBests.length} PB`
              : "";
          await createClient()
            .from("practice")
            .insert({
              user_id: user.id,
              type: title,
              duration_minutes: mins,
              notes: `Gym Planner · ${completedSetCount(finished)} sets · ${vol} kg volume${pbNote}`,
              completed_at: finished.finishedAt,
            });
          window.dispatchEvent(new Event("practiceActivityUpdated"));
          window.dispatchEvent(new Event("practiceSessionsUpdated"));
        } catch (err) {
          console.warn("[weight-training] calendar save failed:", err);
        }
      }
      if (finished.personalBests && finished.personalBests.length > 0) {
        setPbCelebration(finished.personalBests);
      } else {
        setPbCelebration(null);
      }
      refresh();
      setTab("history");
    } finally {
      setFinishing(false);
    }
  };

  const discard = () => {
    if (!window.confirm("Discard this workout? Nothing will be saved.")) return;
    persistActive(null);
  };

  const saveCurrentAsRoutine = () => {
    if (!active || active.exercises.length === 0) return;
    const name = window.prompt("Routine name", active.title || "My routine");
    if (!name?.trim()) return;
    upsertRoutine({
      id: `routine-${Date.now()}`,
      name: name.trim(),
      exerciseIds: active.exercises.map((e) => e.exerciseId),
      updatedAt: new Date().toISOString(),
    });
    refresh();
  };

  const library = useMemo(
    () => catalog.filter((e) => muscle === "All" || e.muscle === muscle),
    [muscle, catalog],
  );

  if (!ready) {
    return <div className="h-40 animate-pulse border border-[#014421]/10 bg-[#014421]/5" aria-hidden />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "workout", label: "Workout" },
    { id: "routines", label: "Routines" },
    { id: "history", label: "History" },
    { id: "exercises", label: "Exercises" },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-4 border-b border-[#014421]/20">
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`strength-display border-b-2 py-2.5 text-sm font-bold uppercase tracking-wide ${
                on
                  ? "border-[#014421] text-[#014421]"
                  : "border-transparent text-stone-400 hover:text-stone-600"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "workout" && (
        active ? (
          <div className="space-y-3">
            <p className="border border-[#014421]/15 bg-[#014421]/5 px-3 py-2 text-[11px] text-[#014421]">
              In progress — sets and timer autosave on this phone. Tap <span className="font-bold">Finish workout</span>{" "}
              to lock it into History and your calendar.
            </p>
            <ActiveWorkout
              session={active}
              onChange={persistActive}
              onFinish={() => void finish()}
              onDiscard={discard}
            />
            {active.exercises.length > 0 && (
              <button
                type="button"
                onClick={saveCurrentAsRoutine}
                className="w-full text-center text-xs font-bold uppercase tracking-wide text-[#014421] hover:underline"
              >
                Save as routine
              </button>
            )}
            {finishing && <p className="text-center text-xs text-stone-500">Saving to calendar…</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={startEmpty}
              className="strength-fairway relative flex w-full flex-col items-start gap-2 overflow-hidden px-4 py-7 text-left text-white"
            >
              <div className="strength-fairway-noise pointer-events-none absolute inset-0" aria-hidden />
              <Dumbbell className="relative h-6 w-6 text-[#FFC966]" aria-hidden />
              <span className="strength-display relative text-3xl font-bold uppercase tracking-wide">
                Start workout
              </span>
              <span className="relative text-sm text-white/75">
                Name it, add lifts, log sets as you go.
              </span>
            </button>
            {routines.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">
                  Quick start
                </p>
                <ul className="divide-y divide-[#014421]/10 border border-[#014421]/15 bg-[#fffef9]">
                  {routines.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => startRoutine(r)}
                        className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-[#014421]/4"
                      >
                        <span>
                          <span className="block text-sm font-bold text-stone-900">{r.name}</span>
                          <span className="text-xs text-stone-500">{r.exerciseIds.length} exercises</span>
                        </span>
                        <span className="bg-[#FFA500] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                          Start
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}

      {tab === "routines" && (
        <div className="space-y-3">
          {routines.length === 0 ? (
            <p className="strength-panel px-4 py-8 text-center text-sm text-stone-500">
              No routines yet. Start a workout, add your lifts, then tap Save as routine.
            </p>
          ) : (
            <ul className="divide-y divide-[#014421]/10 border border-[#014421]/15 bg-[#fffef9]">
              {routines.map((r) => (
                <li key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="strength-display text-lg font-bold uppercase tracking-wide text-[#014421]">
                        {r.name}
                      </p>
                      <p className="text-xs text-stone-500">{r.exerciseIds.length} exercises</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete routine “${r.name}”?`)) return;
                        deleteRoutine(r.id);
                        refresh();
                      }}
                      className="p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-500"
                      aria-label={`Delete ${r.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => startRoutine(r)}
                    className="mt-2 w-full bg-[#014421] py-2 text-sm font-bold uppercase tracking-wide text-white"
                  >
                    Start workout
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {pbCelebration && pbCelebration.length > 0 && (
            <div className="border border-[#FFA500] border-l-4 bg-[#FFA500]/10 p-3">
              <div className="flex items-start gap-3">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-[#FFA500]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="strength-display text-lg font-bold uppercase tracking-wide text-[#9a3412]">
                    {pbCelebration.length === 1 ? "Personal best" : `${pbCelebration.length} personal bests`}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {pbCelebration.map((pb) => (
                      <li key={pb.exerciseId} className="font-mono text-xs text-[#7c2d12]">
                        <span className="font-semibold">{pb.name}</span>
                        {" · "}
                        {pb.weight}×{pb.reps}
                        {pb.previousBestOneRm != null
                          ? ` (was ~${pb.previousBestOneRm} kg e1RM)`
                          : " · first logged best"}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setPbCelebration(null)}
                  className="p-1 text-[#9a3412]/60 hover:bg-[#FFA500]/20 hover:text-[#9a3412]"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          )}
          {history.length === 0 ? (
            <p className="strength-panel px-4 py-8 text-center text-sm text-stone-500">
              Finished workouts show up here.
            </p>
          ) : (
            <>
            <HistoryTrendCharts workouts={history} />
            <ul className="divide-y divide-[#014421]/10 border border-[#014421]/15 bg-[#fffef9]">
            {history.map((w) => {
              const pbs = w.personalBests ?? [];
              const pbIds = new Set(pbs.map((p) => p.exerciseId));
              const reps = sessionTotalReps(w);
              const vol = Math.round(sessionVolumeKg(w));
              return (
              <li key={w.id} className={`p-3 ${pbs.length > 0 ? "border-l-4 border-l-[#FFA500]" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      {pbs.length > 0 && (
                        <Trophy className="h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-label="Personal best" />
                      )}
                      <span className="strength-display truncate text-lg font-bold uppercase tracking-wide text-[#014421]">
                        {w.title}
                      </span>
                    </p>
                    <p className="font-mono text-[11px] text-stone-500">
                      {formatWhen(w.finishedAt || w.startedAt)}
                      {formatWorkoutDuration(w) ? ` · ${formatWorkoutDuration(w)}` : ""}
                      {` · ${completedSetCount(w)} sets`}
                      {reps > 0 ? ` · ${reps} reps` : ""}
                      {vol > 0 ? ` · ${vol} kg` : ""}
                      {pbs.length > 0 ? ` · ${pbs.length} PB` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Delete this workout from history?")) return;
                      deleteWorkout(w.id);
                      refresh();
                    }}
                    className="p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-500"
                    aria-label="Delete workout"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <ul className="mt-2 space-y-0.5">
                  {w.exercises.map((e) => (
                    <li key={e.id} className="flex items-center gap-1 truncate text-xs text-stone-600">
                      {pbIds.has(e.exerciseId) && (
                        <Trophy className="h-3 w-3 shrink-0 text-[#FFA500]" aria-hidden />
                      )}
                      <span className="truncate">
                        {e.name} · {e.sets.filter((s) => s.completed).length} sets
                        {formatLastPerformance(e) ? ` · ${formatLastPerformance(e)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
              );
            })}
            </ul>
            </>
          )}
        </div>
      )}

      {tab === "exercises" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setCreatingEx((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border border-[#014421]/25 bg-[#014421]/5 py-2.5 text-sm font-bold uppercase tracking-wide text-[#014421]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {creatingEx ? "Close" : "Add your own exercise"}
          </button>
          {creatingEx && (
            <div className="overflow-hidden border border-[#014421]/15 bg-[#fffef9]">
              <CustomExerciseForm
                onCancel={() => setCreatingEx(false)}
                onCreated={() => {
                  setCatalog(allExercises());
                  setCreatingEx(false);
                }}
              />
            </div>
          )}
          <MuscleCategorySlider value={muscle} onChange={setMuscle} />
          <ul className="divide-y divide-[#014421]/10 border border-[#014421]/15 bg-[#fffef9]">
            {library.map((ex) => {
              const last = formatLastPerformance(lastPerformanceForExercise(ex.id));
              return (
                <li key={ex.id} className="flex items-start gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900">
                      {ex.name}
                      {ex.custom ? (
                        <span className="ml-1.5 bg-[#FFA500]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#9a3412]">
                          Yours
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-stone-500">
                      {ex.muscle}
                      {ex.equipment ? ` · ${ex.equipment}` : ""}
                      {ex.grip ? ` · ${ex.grip}` : ""}
                    </p>
                    {last ? (
                      <p className="mt-0.5 font-mono text-[11px] font-medium text-[#014421]">Last: {last}</p>
                    ) : null}
                  </div>
                  {ex.custom && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete “${ex.name}”?`)) return;
                        deleteCustomExercise(ex.id);
                        setCatalog(allExercises());
                      }}
                      className="p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-500"
                      aria-label={`Delete ${ex.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
