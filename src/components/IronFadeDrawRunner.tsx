"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crosshair, Spline, Swords } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  buildFadeDrawSequence,
  correctStartSide,
  curveDirection,
  curvePoints,
  fadeDrawShotPoints,
  FINISH_FINGER_OPTIONS,
  finishPoints,
  ironFadeDrawConfig,
  startPoints,
  type ClubOrder,
  type CurveResult,
  type FinishFingers,
  type Handedness,
  type ShotShape,
  type StartSide,
} from "@/lib/ironFadeDrawConfig";
import { IRON_TEST_CLUBS, sortClubsByLoft } from "@/lib/ironCombineClubs";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { asRecord, oneOf } from "@/lib/combineReportData";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  CombineHero,
  IntroSteps,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  ResultHero,
  SaveStatus,
  ScoreRing,
  ScoringGuide,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { IronHeroArt, IronShotDiagram, Segmented } from "@/components/combine/IronCombineUi";
import { BreakdownCard, EveryShotList, FocusCard } from "@/components/combine/CombineBreakdown";

export type FadeDrawShot = {
  shot: number;
  club: string;
  shape: ShotShape;
  hand: Handedness;
  start: StartSide;
  curve: CurveResult;
  fingers: FinishFingers;
  points: number;
};

const SETUP_STORAGE_PREFIX = "iron-fade-draw-setup:";
const DEFAULT_CLUBS = ["7i"];
/** Each club hits one fade and one draw, so 10 shots covers at most 5 clubs. */
const MAX_CLUBS = Math.ceil(ironFadeDrawConfig.shotCount / 2);
const OUTSIDE_FINGERS = 4.5;

type Setup = { clubs: string[]; order: ClubOrder; hand: Handedness };

const DEFAULT_SETUP: Setup = { clubs: DEFAULT_CLUBS, order: "order", hand: "right" };

function readSetup(userId: string): Setup | null {
  try {
    const raw = window.localStorage.getItem(SETUP_STORAGE_PREFIX + userId);
    if (!raw) return null;
    const o = asRecord(JSON.parse(raw));
    if (!o) return null;
    const clubs = sortClubsByLoft(Array.isArray(o.clubs) ? o.clubs.filter((c): c is string => typeof c === "string") : []).slice(
      0,
      MAX_CLUBS,
    );
    if (clubs.length === 0) return null;
    return {
      clubs,
      order: oneOf(o.order, ["order", "random"] as const) ?? "random",
      hand: oneOf(o.hand, ["right", "left"] as const) ?? "right",
    };
  } catch {
    return null;
  }
}

function storeSetup(userId: string, setup: Setup) {
  try {
    window.localStorage.setItem(SETUP_STORAGE_PREFIX + userId, JSON.stringify(setup));
  } catch {
    /* storage full or blocked */
  }
}

const SHAPE_LABEL: Record<ShotShape, string> = { fade: "Fade", draw: "Draw" };
const CURVE_LABEL: Record<CurveResult, string> = { called: "Curved as called", straight: "Straight", double: "Double cross" };
const fingerValue = (f: FinishFingers) => (f === "outside" ? OUTSIDE_FINGERS : f);
const fingerLabel = (f: FinishFingers) => (f === "outside" ? "4+" : f === 0 ? "On target" : `${f} finger${f === 1 ? "" : "s"}`);
const sideWord = (s: "left" | "right") => (s === "left" ? "left" : "right");
const startLabel = (s: StartSide) => (s === "line" ? "Started on target" : `Started ${s}`);

function pointsTone(points: number): string {
  if (points >= 9) return "bg-[#014421] text-white";
  if (points >= 6) return "bg-green-200 text-[#014421]";
  if (points > 0) return "bg-amber-200 text-amber-900";
  if (points === 0) return "bg-gray-300 text-gray-700";
  return "bg-red-500 text-white";
}

/** Saved shots from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseFadeDrawShots(strikeData: unknown): FadeDrawShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: FadeDrawShot[] = [];
  for (const raw of strikeData) {
    const o = asRecord(raw);
    if (!o) return null;
    const shape = oneOf(o.shape, ["fade", "draw"] as const);
    const hand = oneOf(o.hand, ["right", "left"] as const) ?? "right";
    const start = oneOf(o.start, ["left", "line", "right"] as const);
    const curve = oneOf(o.curve, ["called", "straight", "double"] as const);
    const fingers: FinishFingers | null =
      o.fingers === "outside" ? "outside" : typeof o.fingers === "number" && Number.isFinite(o.fingers) ? o.fingers : null;
    if (!shape || !start || !curve || fingers === null) return null;
    shots.push({
      shot: shots.length + 1,
      club: typeof o.club === "string" && o.club ? o.club : `#${shots.length + 1}`,
      shape,
      hand,
      start,
      curve,
      fingers,
      points: fadeDrawShotPoints(shape, hand, start, curve, fingers),
    });
  }
  return shots;
}

const sessionTotal = (shots: FadeDrawShot[]) => shots.reduce((sum, s) => sum + s.points, 0);

function shapeStats(shots: FadeDrawShot[], shape: ShotShape) {
  const list = shots.filter((s) => s.shape === shape);
  const n = list.length;
  const total = sessionTotal(list);
  const startRight = list.filter((s) => s.start !== "line" && s.start === correctStartSide(s.shape, s.hand)).length;
  const called = list.filter((s) => s.curve === "called").length;
  const doubles = list.filter((s) => s.curve === "double").length;
  const straight = list.filter((s) => s.curve === "straight").length;
  const avgFingers = n ? list.reduce((sum, s) => sum + fingerValue(s.fingers), 0) / n : 0;
  const lost = {
    start: list.reduce((sum, s) => sum + ironFadeDrawConfig.ptsStartCorrect - startPoints(s.start, s.shape, s.hand), 0),
    curve: list.reduce((sum, s) => sum + ironFadeDrawConfig.ptsCurveCalled - curvePoints(s.curve), 0),
    finish: list.reduce((sum, s) => sum + ironFadeDrawConfig.finishBands[0].points - finishPoints(s.fingers), 0),
  };
  return { shape, n, total, avg: n ? total / n : 0, startRight, called, doubles, straight, avgFingers, lost };
}

type ShapeStats = ReturnType<typeof shapeStats>;

function shapeTip(st: ShapeStats, hand: Handedness): string {
  const start = sideWord(correctStartSide(st.shape, hand));
  const curve = sideWord(curveDirection(st.shape, hand));
  const leak = (Object.entries(st.lost) as [keyof ShapeStats["lost"], number][]).sort((a, b) => b[1] - a[1])[0]!;
  if (leak[1] === 0) return `Your ${st.shape}s were perfect.`;
  if (leak[0] === "curve") {
    if (st.doubles > 0) {
      return `${st.doubles} of your ${st.shape}s double-crossed. Start it ${start} with the face pointing ${start} of target, then swing ${
        st.shape === "draw" ? "more in to out" : "more out to in"
      } than the face so it bends back ${curve}.`;
    }
    return `${st.straight} of your ${st.shape}s didn't curve. Exaggerate the path ${
      st.shape === "draw" ? "in to out" : "out to in"
    } relative to the face.`;
  }
  if (leak[0] === "start") {
    return `Your ${st.shape}s started ${start} of target only ${st.startRight} of ${st.n} times. Aim the face a touch ${start} and trust it to curve ${curve}.`;
  }
  return `Shape was there, but ${st.shape}s finished ${st.avgFingers.toFixed(1)} fingers from the target on average. Match the start line to how much it curves.`;
}

function breakdown(shots: FadeDrawShot[]) {
  const hand = shots[0]?.hand ?? "right";
  const fade = shapeStats(shots, "fade");
  const draw = shapeStats(shots, "draw");
  const total = sessionTotal(shots);
  const diff = draw.avg - fade.avg;
  const winner: ShotShape | null = Math.abs(diff) < 0.5 ? null : diff > 0 ? "draw" : "fade";
  const weaker = winner ? (winner === "draw" ? fade : draw) : fade.total <= draw.total ? fade : draw;

  const focus = winner
    ? {
        title: `Your go-to shape: the ${winner}`,
        lines: [
          `${SHAPE_LABEL[winner]}s averaged ${(winner === "draw" ? draw : fade).avg.toFixed(1)} pts a shot, ${
            SHAPE_LABEL[winner === "draw" ? "fade" : "draw"].toLowerCase()
          }s ${weaker.avg.toFixed(1)}.`,
          `To close the gap: ${shapeTip(weaker, hand)}`,
        ],
      }
    : {
        title: "Even split: both shapes are on par",
        lines: [`Fades averaged ${fade.avg.toFixed(1)} pts, draws ${draw.avg.toFixed(1)}.`, shapeTip(weaker, hand)],
      };

  const clubs = sortClubsByLoft([...new Set(shots.map((s) => s.club))]);
  const byClub = clubs.map((club) => {
    const avg = (shape: ShotShape) => {
      const list = shots.filter((s) => s.club === club && s.shape === shape);
      return list.length ? sessionTotal(list) / list.length : null;
    };
    return { club, fade: avg("fade"), draw: avg("draw") };
  });

  return { total, fade, draw, winner, focus, byClub };
}

/** Two columns, fade vs draw, with the better value on each row highlighted. */
function HeadToHead({ fade, draw }: { fade: ShapeStats; draw: ShapeStats }) {
  const rows: { label: string; f: number; d: number; show: (v: number, st: ShapeStats) => string; lowerIsBetter?: boolean }[] = [
    { label: "Avg points", f: fade.avg, d: draw.avg, show: (v) => v.toFixed(1) },
    { label: "Started correct side", f: fade.startRight, d: draw.startRight, show: (v, st) => `${v}/${st.n}` },
    { label: "Curved as called", f: fade.called, d: draw.called, show: (v, st) => `${v}/${st.n}` },
    { label: "Double crosses", f: fade.doubles, d: draw.doubles, show: (v, st) => `${v}/${st.n}`, lowerIsBetter: true },
    { label: "Avg fingers from target", f: fade.avgFingers, d: draw.avgFingers, show: (v) => v.toFixed(1), lowerIsBetter: true },
  ];
  const cell = (v: number, other: number, st: ShapeStats, show: (v: number, st: ShapeStats) => string, lower?: boolean) => {
    const better = lower ? v < other : v > other;
    return (
      <span
        className={`rounded-lg px-2 py-1 text-center text-sm font-bold tabular-nums ${
          better ? "bg-[#014421] text-white" : "bg-gray-50 text-gray-800"
        }`}
      >
        {show(v, st)}
      </span>
    );
  };
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
        <span />
        <span>Fade</span>
        <span>Draw</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-700">{r.label}</span>
          {cell(r.f, r.d, fade, r.show, r.lowerIsBetter)}
          {cell(r.d, r.f, draw, r.show, r.lowerIsBetter)}
        </div>
      ))}
    </div>
  );
}

async function persistFadeDrawSession(userId: string, shots: FadeDrawShot[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const total = sessionTotal(shots);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: ironFadeDrawConfig.practiceLogType,
      score: total,
      total_points: total,
      strike_data: shots.map(({ shot, club, shape, hand, start, curve, fingers, points }) => ({
        shot,
        club,
        shape,
        hand,
        start,
        curve,
        fingers,
        points,
      })),
    });
    if (!res.ok) {
      console.warn("[IronFadeDraw] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[IronFadeDraw] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function IronFadeDrawReport({ shots }: { shots: FadeDrawShot[] }) {
  const summary = breakdown(shots);
  const max = shots.length * ironFadeDrawConfig.maxShotPoints;
  return (
    <>
      <ResultHero>
        <ScoreRing pct={summary.total / max} value={summary.total} caption={`of ${max} points`} />
        <p className="mt-2 text-xs text-white/70">
          {summary.winner ? `Stronger shape: ${SHAPE_LABEL[summary.winner]}` : "Fade and draw even"} · higher is better
        </p>
      </ResultHero>

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Fade vs draw" aside={`${summary.fade.total} vs ${summary.draw.total} pts`}>
        <HeadToHead fade={summary.fade} draw={summary.draw} />
      </BreakdownCard>

      {summary.byClub.length > 1 && (
        <BreakdownCard title="By club" aside="Avg points">
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <span />
              <span>Fade</span>
              <span>Draw</span>
            </div>
            {summary.byClub.map((c) => (
              <div key={c.club} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-1.5">
                <span className="text-sm font-bold text-gray-800">{c.club}</span>
                {[c.fade, c.draw].map((v, i) => (
                  <span
                    key={i}
                    className={`rounded-lg px-2 py-1 text-center text-sm font-bold tabular-nums ${
                      v == null ? "bg-gray-50 text-gray-300" : pointsTone(v)
                    }`}
                  >
                    {v == null ? "–" : Number.isInteger(v) ? v : v.toFixed(1)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </BreakdownCard>
      )}

      <EveryShotList>
        {shots.map((s) => (
          <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.club}</span>
            <span className="min-w-0 flex-1 truncate text-gray-600">
              <span className="font-semibold text-gray-800">{SHAPE_LABEL[s.shape]}</span> · {startLabel(s.start)} · {CURVE_LABEL[s.curve]} ·{" "}
              {fingerLabel(s.fingers)}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>
              {s.points}
            </span>
          </li>
        ))}
      </EveryShotList>
    </>
  );
}

function ClubChips({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const full = selected.length >= MAX_CLUBS;
  const groups = (["Irons", "Hybrids", "Woods"] as const).map((g) => ({ group: g, clubs: IRON_TEST_CLUBS.filter((c) => c.group === g) }));
  return (
    <div className="space-y-3">
      {groups.map(({ group, clubs }) => (
        <div key={group}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
            {clubs.map((c) => {
              const on = selected.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onChange(on ? selected.filter((k) => k !== c.key) : [...selected, c.key])}
                  disabled={!on && full}
                  aria-pressed={on}
                  className={`relative rounded-xl py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    on ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {c.key}
                  {on && <Check className="absolute right-1 top-1 h-3 w-3 text-[#FFA500]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function IronFadeDrawRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [sequence, setSequence] = useState<{ club: string; shape: ShotShape }[]>([]);
  const [start, setStart] = useState<StartSide | null>(null);
  const [curve, setCurve] = useState<CurveResult | null>(null);
  const [fingers, setFingers] = useState<FinishFingers | null>(null);
  const [shots, setShots] = useState<FadeDrawShot[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setSetup((userId && readSetup(userId)) || DEFAULT_SETUP);
      setLoadedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const current = setup ?? DEFAULT_SETUP;
  const ready = loadedFor === userId;
  const clubs = sortClubsByLoft(current.clubs);
  const total = sequence.length || ironFadeDrawConfig.shotCount;
  const shotIndex = shots.length;
  const now = sequence[shotIndex];

  const resetShot = () => {
    setStart(null);
    setCurve(null);
    setFingers(null);
  };

  const startTest = useCallback(() => {
    if (clubs.length === 0) return;
    if (userId) storeSetup(userId, { ...current, clubs });
    setSequence(buildFadeDrawSequence(clubs, current.order));
    setShots([]);
    resetShot();
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, [clubs, current, userId]);

  const save = useCallback(
    async (all: FadeDrawShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistFadeDrawSession(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const canRecord = start != null && curve != null && fingers != null;
  const livePoints = canRecord && now ? fadeDrawShotPoints(now.shape, current.hand, start, curve, fingers) : null;

  const recordShot = useCallback(async () => {
    if (status !== "active" || !now || start == null || curve == null || fingers == null) return;
    const next = [
      ...shots,
      {
        shot: shotIndex + 1,
        club: now.club,
        shape: now.shape,
        hand: current.hand,
        start,
        curve,
        fingers,
        points: fadeDrawShotPoints(now.shape, current.hand, start, curve, fingers),
      },
    ];
    setShots(next);
    resetShot();
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, now, start, curve, fingers, shots, shotIndex, current.hand, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setStart(last.start);
    setCurve(last.curve);
    setFingers(last.fingers);
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    const update = (patch: Partial<Setup>) => setSetup({ ...current, ...patch });
    return (
      <div className="space-y-4">
        <CombineHero
          title={ironFadeDrawConfig.testName}
          kicker="Iron combine"
          art={<IronHeroArt curve="draw" />}
          chips={[`${ironFadeDrawConfig.shotCount} shots`, "5 fades · 5 draws", "~15 min", "Find your shape"]}
        />

        {ready ? (
          <div className="space-y-4 rounded-2xl border border-gray-100 p-4">
            <div className="space-y-2">
              <p className="text-base font-bold text-gray-900">You swing</p>
              <Segmented
                options={[
                  { key: "right", label: "Right-handed" },
                  { key: "left", label: "Left-handed" },
                ]}
                value={current.hand}
                onChange={(hand) => update({ hand })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-base font-bold text-gray-900">Clubs</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    clubs.length ? "bg-[#014421] text-white" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {clubs.length} picked
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Pick 1 to {MAX_CLUBS} clubs. Each hits a fade and a draw, so the comparison is fair.
              </p>
              <ClubChips selected={current.clubs} onChange={(next) => update({ clubs: next })} />
            </div>
            {clubs.length > 1 && (
              <div className="space-y-2">
                <p className="text-base font-bold text-gray-900">Club order</p>
                <Segmented
                  options={[
                    { key: "order", label: "In order", hint: "Short to long" },
                    { key: "random", label: "Random", hint: "Mixed up" },
                  ]}
                  value={current.order}
                  onChange={(order) => update({ order })}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading your setup" />
        )}

        <IntroSteps
          steps={[
            { icon: <Swords className="h-5 w-5" aria-hidden />, title: "The app calls fade or draw", hint: "Five of each, one of each per club" },
            { icon: <Spline className="h-5 w-5" aria-hidden />, title: "Log the start line and the curve", hint: "Did it start on the correct side and bend back, or double-cross?" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the finish in fingers", hint: "Hold your hand at arm's length, then count from the target" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>
              Started on the correct side: +{ironFadeDrawConfig.ptsStartCorrect} (on target +{ironFadeDrawConfig.ptsStartOnLine})
            </li>
            <li>Curved the way it was called: +{ironFadeDrawConfig.ptsCurveCalled}</li>
            <li className="text-red-700">Double cross (curved the wrong way): {ironFadeDrawConfig.ptsDoubleCross}</li>
            <li>Finished 0 to 0.5 fingers from target: +3 · 1 to 1.5: +2 · 2 to 2.5: +1</li>
            <li className="font-semibold text-gray-900">
              Up to {ironFadeDrawConfig.maxShotPoints} per shot, {ironFadeDrawConfig.maxSessionPoints} in total. Your report compares
              fades against draws.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest} disabled={!ready || clubs.length === 0}>
          Start the test
        </PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <IronFadeDrawReport shots={shots} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  if (!now) return null;
  const hand = current.hand;
  const goodStart = correctStartSide(now.shape, hand);
  const bend = curveDirection(now.shape, hand);
  const diagramCurve = hand === "right" ? now.shape : now.shape === "draw" ? "fade" : "draw";
  const runningTotal = sessionTotal(shots);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = shots[i];
    return s ? { label: String(s.points), tone: pointsTone(s.points), ariaLabel: `Shot ${i + 1} (${s.club} ${s.shape}): ${s.points} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram curve={diagramCurve} className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotIndex + 1} of {total} · {now.club}
          </p>
          <p className="text-5xl font-extrabold leading-none text-gray-900">{SHAPE_LABEL[now.shape]}</p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">
            Start it {sideWord(goodStart)}, curve it {sideWord(bend)}
          </p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it start?</p>
        <ChoiceRow
          options={[
            { key: "left", label: "Left", hint: goodStart === "left" ? "Correct side" : "Wrong side" },
            { key: "line", label: "On target", hint: "Straight at it" },
            { key: "right", label: "Right", hint: goodStart === "right" ? "Correct side" : "Wrong side" },
          ]}
          value={start}
          onChange={setStart}
        />
      </div>

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Did it curve?</p>
        <ChoiceRow
          options={[
            { key: "called", label: "As called", hint: `Bent ${sideWord(bend)}` },
            { key: "straight", label: "Straight", hint: "No curve" },
            { key: "double", label: "Double cross", hint: `Bent ${sideWord(bend === "left" ? "right" : "left")}`, danger: true },
          ]}
          value={curve}
          onChange={setCurve}
        />
      </div>

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How many fingers from the target?</p>
        <div className="grid grid-cols-5 gap-1.5">
          {FINISH_FINGER_OPTIONS.map((f) => {
            const active = fingers === f;
            return (
              <button
                key={String(f)}
                type="button"
                onClick={() => setFingers(f)}
                aria-pressed={active}
                className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                  active ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {f === "outside" ? "4+" : f}
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton onClick={() => void recordShot()} disabled={!canRecord}>
        {shotIndex + 1 >= total ? "Finish the test" : "Next shot"}
        {livePoints != null && <span className="block text-xs font-semibold text-white/70">This shot scores {livePoints}</span>}
      </PrimaryButton>
    </div>
  );
}

/** Like Segmented, but starts with nothing picked and can flag a bad option in red. */
function ChoiceRow<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; hint?: string; danger?: boolean }[];
  value: K | null;
  onChange: (k: K) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`rounded-2xl border-2 px-1 py-2.5 transition-all active:scale-[0.97] ${
              active
                ? o.danger
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-[#014421] bg-[#014421] text-white"
                : o.danger
                  ? "border-red-100 bg-red-50 text-red-700 hover:border-red-200"
                  : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-bold">{o.label}</span>
            {o.hint && <span className={`block text-[10px] ${active ? "text-white/70" : "opacity-60"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
