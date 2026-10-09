"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Crosshair, Flag, ShieldAlert } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  buildSafeSideSequence,
  ironSafeSideConfig,
  SAFE_SIDE_FINGER_OPTIONS,
  safeSideShotPoints,
  type SafeSideAvoid,
  type SafeSideFingers,
  type SafeSideResult,
} from "@/lib/ironSafeSideConfig";
import {
  buildClubSequence,
  IRON_TEST_DEFAULT_CLUBS,
  IRON_TEST_MIN_CLUBS,
  IRON_TEST_SHOTS,
  sortClubsByLoft,
} from "@/lib/ironCombineClubs";
import { loadSavedClubs, storeClubs } from "@/components/IronPrecisionProtocolRunner";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { asRecord, oneOf } from "@/lib/combineReportData";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  BRAND_ORANGE,
  CombineHero,
  IntroSteps,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  ResultHero,
  SaveStatus,
  ScoreRing,
  ScoringGuide,
  StatTiles,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { ClubPicker } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard } from "@/components/combine/CombineBreakdown";

export type SafeSideShot = {
  shot: number;
  club: string;
  avoid: SafeSideAvoid;
  result: SafeSideResult;
  fingers: SafeSideFingers;
  points: number;
};

const OUTSIDE_FINGERS = 4.5;
const fingerValue = (f: SafeSideFingers) => (f === "outside" ? OUTSIDE_FINGERS : f);
const fingerLabel = (f: SafeSideFingers) => (f === "outside" ? "4+" : String(f));
const sideWord = (s: SafeSideAvoid) => (s === "left" ? "left" : "right");
const otherSide = (s: SafeSideAvoid): SafeSideAvoid => (s === "left" ? "right" : "left");

function pointsTone(points: number): string {
  if (points >= 9) return "bg-[#014421] text-white";
  if (points >= 6) return "bg-green-200 text-[#014421]";
  if (points > 0) return "bg-amber-200 text-amber-900";
  if (points === 0) return "bg-gray-300 text-gray-700";
  return "bg-red-500 text-white";
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function resultLabel(s: Pick<SafeSideShot, "result" | "fingers">): string {
  if (s.result === "line") return "On the flag line";
  if (s.result === "safe") return `Safe side ${fingerLabel(s.fingers)}`;
  return `Crossed ${fingerLabel(s.fingers)}`;
}

/** Saved shots from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseSafeSideShots(strikeData: unknown): SafeSideShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: SafeSideShot[] = [];
  for (const raw of strikeData) {
    const o = asRecord(raw);
    if (!o) return null;
    const avoid = oneOf(o.avoid, ["left", "right"] as const);
    const result = oneOf(o.result, ["safe", "line", "crossed"] as const);
    const fingers: SafeSideFingers | null =
      o.fingers === "outside" ? "outside" : typeof o.fingers === "number" && Number.isFinite(o.fingers) ? o.fingers : null;
    if (!avoid || !result || fingers === null) return null;
    shots.push({
      shot: shots.length + 1,
      club: typeof o.club === "string" && o.club ? o.club : `#${shots.length + 1}`,
      avoid,
      result,
      fingers: result === "line" ? 0 : fingers,
      points: safeSideShotPoints(result, fingers),
    });
  }
  return shots;
}

function sessionTotal(shots: SafeSideShot[]): number {
  return shots.reduce((sum, s) => sum + s.points, 0);
}

function breakdown(shots: SafeSideShot[]) {
  const n = shots.length;
  const max = n * ironSafeSideConfig.maxShotPoints;
  const total = sessionTotal(shots);
  const crossed = shots.filter((s) => s.result === "crossed");
  const safeMisses = shots.filter((s) => s.result === "safe");
  const onLine = shots.filter((s) => s.result === "line").length;
  const close = shots.filter((s) => s.result === "line" || (s.result === "safe" && fingerValue(s.fingers) <= 1)).length;

  const lostSafe = safeMisses.reduce((sum, s) => sum + (ironSafeSideConfig.maxShotPoints - s.points), 0);
  const lostCrossed = crossed.reduce((sum, s) => sum + (ironSafeSideConfig.maxShotPoints - s.points), 0);
  const penalties = crossed.reduce((sum, s) => sum - s.points, 0);
  const avgSafeFingers = safeMisses.length
    ? safeMisses.reduce((sum, s) => sum + fingerValue(s.fingers), 0) / safeMisses.length
    : 0;

  const crossedLeft = crossed.filter((s) => s.avoid === "left").length;
  const crossedRight = crossed.length - crossedLeft;
  const weakSide: SafeSideAvoid | null =
    crossed.length >= 2 && crossedLeft !== crossedRight ? (crossedLeft > crossedRight ? "left" : "right") : null;

  let focus: { title: string; lines: string[] };
  if (lostSafe === 0 && lostCrossed === 0) {
    focus = { title: "Perfect round", lines: ["Every shot on the flag line. Pick tighter flags next time."] };
  } else if (lostCrossed >= lostSafe) {
    focus = {
      title: "Focus next: stay on the safe side",
      lines: [
        `You crossed the flag ${crossed.length} time${crossed.length === 1 ? "" : "s"}, costing ${lostCrossed} pts including ${penalties} in penalties.`,
        weakSide
          ? `Most came when ${sideWord(weakSide)} was the side to avoid. Aim a touch more ${sideWord(otherSide(weakSide))} and commit.`
          : "Pick a target a finger or two on the safe side of the flag and swing to it.",
      ],
    };
  } else {
    focus = {
      title: "Focus next: get closer to the flag",
      lines: [
        `Safe-side misses averaged ${avgSafeFingers.toFixed(1)} fingers and cost ${lostSafe} pts.`,
        crossed.length === 0
          ? "You never crossed, so you can afford to aim a little closer to the flag."
          : "Keep the same discipline, but tighten your aim by a finger.",
      ],
    };
  }

  return { n, max, total, crossed: crossed.length, onLine, close, lostSafe, lostCrossed, penalties, focus };
}

const MAP_RANGE = 5;
const DOT_ROW_PX = 26;
const MIN_DOT_GAP = 1.6;

/** Positive = safe side of the flag, negative = crossed. */
function signedMiss(s: SafeSideShot): number {
  if (s.result === "line") return 0;
  const f = fingerValue(s.fingers);
  return s.result === "safe" ? f : -f;
}

const pctOf = (x: number) => 50 + (x / MAP_RANGE) * 50;

/** Every shot relative to the flag, with the wrong side on the left whatever side it was on the day. */
function SideMap({ shots }: { shots: SafeSideShot[] }) {
  const placed: { x: number; row: number }[] = [];
  const dots = [...shots]
    .sort((a, b) => signedMiss(a) - signedMiss(b))
    .map((s) => {
      const x = signedMiss(s);
      let row = 0;
      while (placed.some((p) => p.row === row && Math.abs(p.x - x) < MIN_DOT_GAP)) row++;
      placed.push({ x, row });
      return { s, x, row };
    });
  const rows = Math.max(1, ...placed.map((p) => p.row + 1));
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl" style={{ height: rows * DOT_ROW_PX + 16 }}>
        <div className="absolute inset-y-0 left-0 w-1/2 bg-red-50" />
        <div className="absolute inset-y-0 bg-green-100" style={{ left: "50%", width: `${(1 / MAP_RANGE) * 50}%` }} />
        <div className="absolute inset-y-0 bg-green-50" style={{ left: `${pctOf(1)}%`, width: `${(2 / MAP_RANGE) * 50}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[#014421]/50" />
        {dots.map(({ s, x, row }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${pointsTone(s.points)}`}
            style={{ left: `${pctOf(x)}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`${s.club}: ${resultLabel(s)}, ${s.points} pts`}
          >
            {s.club}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0 text-red-500">Wrong side</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-[#014421]">Flag</span>
        <span className="absolute right-0">Safe side</span>
      </div>
    </div>
  );
}

/** Bird's-eye view: flag in the middle, the side you must not miss shaded red. */
function SafeSideDiagram({ avoid, className = "" }: { avoid: SafeSideAvoid; className?: string }) {
  const wrongX = avoid === "left" ? 2 : 50;
  const safeAim = avoid === "left" ? 58 : 42;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <linearGradient id="safe-side-fairway" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f8f4e" />
          <stop offset="100%" stopColor="#14592c" />
        </linearGradient>
        <clipPath id="safe-side-card">
          <rect x="2" y="2" width="96" height="116" rx="22" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="url(#safe-side-fairway)" />
      <rect x={wrongX} y="2" width="48" height="116" fill="#ef4444" fillOpacity={0.35} clipPath="url(#safe-side-card)" />
      <ellipse cx="50" cy="32" rx="26" ry="15" fill="#3fae62" fillOpacity={0.7} stroke="white" strokeOpacity={0.35} strokeWidth={1} />
      <line x1="50" y1="4" x2="50" y2="116" stroke="white" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 4" />
      <path
        d={`M50 106 C ${safeAim} 80, ${safeAim} 52, ${safeAim} 36`}
        fill="none"
        stroke="white"
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeDasharray="1 6"
        strokeLinecap="round"
      />
      <line x1="50" y1="32" x2="50" y2="14" stroke="white" strokeWidth={1.5} />
      <path d="M50 14 L62 17 L50 20 Z" fill={BRAND_ORANGE} />
      <circle cx="50" cy="106" r="5" fill="white" />
    </svg>
  );
}

/** Three spots laid out like the shot: wrong side, on the flag line, safe side. */
function ResultPicker({
  avoid,
  value,
  onChange,
}: {
  avoid: SafeSideAvoid;
  value: SafeSideResult | null;
  onChange: (r: SafeSideResult) => void;
}) {
  const options: { key: SafeSideResult; title: string; hint: string; on: string }[] = [
    { key: "crossed", title: "Crossed", hint: `Finished ${sideWord(avoid)} of the flag`, on: "bg-red-500 text-white" },
    { key: "line", title: "On the line", hint: "Dead on the flag", on: "bg-[#014421] text-white" },
    { key: "safe", title: "Safe side", hint: `Finished ${sideWord(otherSide(avoid))} of the flag`, on: "bg-[#014421] text-white" },
  ];
  const ordered = avoid === "left" ? options : [...options].reverse();
  return (
    <div className="grid grid-cols-3 gap-2">
      {ordered.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`rounded-2xl px-2 py-3 text-center transition-colors ${
              active ? o.on : o.key === "crossed" ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            <span className="block text-sm font-bold">{o.title}</span>
            <span className={`block text-[10px] leading-tight ${active ? "text-white/75" : "opacity-70"}`}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

async function persistSafeSideSession(userId: string, shots: SafeSideShot[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const total = sessionTotal(shots);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: ironSafeSideConfig.practiceLogType,
      score: total,
      total_points: total,
      strike_data: shots.map(({ shot, club, avoid, result, fingers, points }) => ({ shot, club, avoid, result, fingers, points })),
    });
    if (!res.ok) {
      console.warn("[IronSafeSide] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[IronSafeSide] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function IronSafeSideReport({ shots }: { shots: SafeSideShot[] }) {
  const summary = breakdown(shots);
  return (
    <>
      <ResultHero>
        <ScoreRing pct={summary.total / summary.max} value={summary.total} caption={`of ${summary.max} points`} />
        <p className="mt-2 text-xs text-white/70">Safe side score · higher is better</p>
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Avg per shot", value: (summary.total / summary.n).toFixed(1) },
          { label: "Crossed", value: `${summary.crossed}/${summary.n}`, sub: summary.penalties ? `${-summary.penalties} pts` : null },
          { label: "Within 1 finger", value: `${summary.close}/${summary.n}`, sub: "safe side" },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Where your points went" aside={`${summary.total} of ${summary.max}`}>
        <BreakdownBar
          segments={[
            { label: "Scored", value: Math.max(0, summary.total), tone: "bg-[#014421]" },
            { label: "Lost on safe misses", value: summary.lostSafe, tone: "bg-[#FFA500]" },
            { label: "Lost crossing the flag", value: summary.lostCrossed, tone: "bg-red-500" },
          ]}
        />
      </BreakdownCard>

      <BreakdownCard title="Miss pattern" aside={`Crossed ${summary.crossed} · On line ${summary.onLine}`}>
        <SideMap shots={shots} />
      </BreakdownCard>

      <EveryShotList>
        {shots.map((s) => (
          <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.club}</span>
            <span className="min-w-0 flex-1 truncate text-gray-600">
              Avoid {sideWord(s.avoid)} · {resultLabel(s)}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>
              {signed(s.points)}
            </span>
          </li>
        ))}
      </EveryShotList>
    </>
  );
}

export function IronSafeSideRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [pickedClubs, setPickedClubs] = useState<string[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [clubSequence, setClubSequence] = useState<string[]>([]);
  const [sides, setSides] = useState<SafeSideAvoid[]>([]);
  const [result, setResult] = useState<SafeSideResult | null>(null);
  const [fingers, setFingers] = useState<SafeSideFingers | null>(null);
  const [shots, setShots] = useState<SafeSideShot[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const clubs = userId ? await loadSavedClubs(userId) : null;
      if (cancelled) return;
      setPickedClubs(clubs ?? IRON_TEST_DEFAULT_CLUBS);
      setLoadedFor(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const clubs = pickedClubs ?? IRON_TEST_DEFAULT_CLUBS;
  const clubsReady = loadedFor === userId;
  const total = clubSequence.length || IRON_TEST_SHOTS;
  const shotIndex = shots.length;
  const currentClub = clubSequence[shotIndex] ?? "";
  const avoid = sides[shotIndex] ?? "left";

  const startTest = useCallback(() => {
    const picks = sortClubsByLoft(clubs);
    if (picks.length < IRON_TEST_MIN_CLUBS) return;
    if (userId) storeClubs(userId, picks);
    const sequence = buildClubSequence(picks);
    setClubSequence(sequence);
    setSides(buildSafeSideSequence(sequence.length));
    setShots([]);
    setResult(null);
    setFingers(null);
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, [clubs, userId]);

  const save = useCallback(
    async (all: SafeSideShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSafeSideSession(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const canRecord = result === "line" || (result != null && fingers != null);
  const livePoints = canRecord ? safeSideShotPoints(result!, result === "line" ? 0 : fingers!) : null;

  const recordShot = useCallback(async () => {
    if (status !== "active" || !canRecord || result == null) return;
    const f: SafeSideFingers = result === "line" ? 0 : fingers!;
    const next = [
      ...shots,
      { shot: shotIndex + 1, club: currentClub, avoid, result, fingers: f, points: safeSideShotPoints(result, f) },
    ];
    setShots(next);
    setResult(null);
    setFingers(null);
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, canRecord, result, fingers, shots, shotIndex, currentClub, avoid, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setResult(last.result);
    setFingers(last.result === "line" ? null : last.fingers);
  }, [status, shots]);

  const swapSide = () => {
    setSides((s) => s.map((side, i) => (i === shotIndex ? otherSide(side) : side)));
    setResult(null);
    setFingers(null);
  };

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    const enough = clubs.length >= IRON_TEST_MIN_CLUBS;
    return (
      <div className="space-y-4">
        <CombineHero
          title={ironSafeSideConfig.testName}
          kicker="Iron combine"
          art={<SafeSideDiagram avoid="left" className="absolute -right-3 -top-2 h-40 w-32 opacity-25" />}
          chips={[`${IRON_TEST_SHOTS} shots`, "Your clubs", "~15 min", "Highest score wins"]}
        />
        {clubsReady ? (
          <ClubPicker selected={clubs} onChange={setPickedClubs} />
        ) : (
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading your clubs" />
        )}
        <IntroSteps
          steps={[
            { icon: <ShieldAlert className="h-5 w-5" aria-hidden />, title: "Each shot has a side you can't miss", hint: "Like a flag tucked by water or a bunker" },
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Get as close to the flag as you dare", hint: "Closer scores more, as long as you don't cross it" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the miss in fingers", hint: "Hold your hand at arm's length, then count from the flag" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>On the flag line: {ironSafeSideConfig.maxShotPoints} pts</li>
            <li>
              Safe side: {ironSafeSideConfig.maxShotPoints} minus {ironSafeSideConfig.safePointsPerFinger} per finger (1 finger = 8, 2 = 6,
              4 = 2, wider = 0)
            </li>
            <li className="text-red-700">
              Crossed the flag: {ironSafeSideConfig.crossPenalties.map((b) => `${b.points} up to ${b.upTo} finger${b.upTo === 1 ? "" : "s"}`).join(", ")},{" "}
              {ironSafeSideConfig.crossPenaltyMax} beyond
            </li>
            <li className="font-semibold text-gray-900">
              Best possible is {IRON_TEST_SHOTS * ironSafeSideConfig.maxShotPoints} points. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest} disabled={!clubsReady || !enough}>
          Start the test
        </PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <IronSafeSideReport shots={shots} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const shotNumber = shotIndex + 1;
  const runningTotal = sessionTotal(shots);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = shots[i];
    return s ? { label: signed(s.points), tone: pointsTone(s.points), ariaLabel: `Shot ${i + 1} (${s.club}): ${s.points} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <SafeSideDiagram avoid={avoid} className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold leading-none text-gray-900">{currentClub}</p>
          <p className="mt-1.5 text-sm font-bold text-red-600">Don&apos;t miss {sideWord(avoid)}</p>
          <button
            type="button"
            onClick={swapSide}
            className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-[#014421] underline-offset-2 hover:underline"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
            Swap to {sideWord(otherSide(avoid))}
          </button>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <ResultPicker
          avoid={avoid}
          value={result}
          onChange={(r) => {
            setResult(r);
            if (r === "line") setFingers(null);
          }}
        />
      </div>

      {result != null && result !== "line" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How many fingers from the flag?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SAFE_SIDE_FINGER_OPTIONS.map((f) => {
              const active = fingers === f;
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFingers(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active
                      ? result === "crossed"
                        ? "bg-red-500 text-white"
                        : "bg-[#014421] text-white"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {fingerLabel(f)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PrimaryButton onClick={() => void recordShot()} disabled={!canRecord}>
        {shotNumber >= total ? "Finish the test" : "Next shot"}
        {livePoints != null && (
          <span className="block text-xs font-semibold text-white/70">
            {livePoints < 0 ? `Penalty: ${livePoints}` : `This shot scores ${livePoints}`}
          </span>
        )}
      </PrimaryButton>
    </div>
  );
}
