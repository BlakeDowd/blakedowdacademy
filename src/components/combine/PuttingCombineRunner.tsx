"use client";

import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CircleDot, Crosshair, Eye, Gauge, ListChecks, Trophy } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import type { PrimaryMissReason } from "@/lib/puttingTestMissDiagnostics";
import {
  PUTTING_TEST_MISS_CATEGORY_LABELS,
  scorePuttingTestMissHole,
} from "@/lib/puttingTestMissScoring";
import {
  getPuttingTestSkillGrade,
  PUTTING_TEST_MAX_POINTS,
  PUTTING_TEST_PGA_TOUR_AVERAGE_POINTS,
  type PuttingTestGradeVariant,
} from "@/lib/puttingTestSkillGrade";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  ChoiceCard,
  CombineHero,
  HoleTrack,
  IntroSteps,
  MissSpotPicker,
  PlayAgainButton,
  PuttLineDiagram,
  puttShapeLabel,
  puttShapeShort,
  ResultHero,
  ScoreRing,
  StatTiles,
  StepDots,
  type HoleResult,
} from "@/components/combine/PuttingCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, RateRow } from "@/components/combine/CombineBreakdown";

type ShapeKey = (typeof puttingTestConfig.shapes)[number];
type MissCategory = "highLong" | "highShort" | "lowLong" | "lowShort" | "lipOut";

export type PuttingCombineHoleRecord = {
  holeIndex: number;
  distance: number;
  shape: ShapeKey;
  outcome: "make" | "miss";
  missReason: MissCategory | null;
  /** Primary reason for a missed first putt; null on makes. */
  primaryMissReason: PrimaryMissReason | null;
  /** Human-readable first-putt miss category for reports; null on makes. */
  missCategoryLabel?: string | null;
  secondPuttDistanceFt: number | null;
  putts: 1 | 2 | 3;
  points: number;
  isThreePutt: boolean;
};

export type PuttingCombineFormat = {
  holeCount: number;
  gradeVariant: PuttingTestGradeVariant;
  title: string;
  distances: readonly number[];
  /** How many of each break; must add up to holeCount. */
  shapeCounts: { straight: number; leftToRight: number; rightToLeft: number };
  distanceRange: string;
  duration: string;
  /** Saved to public.practice.type */
  practiceType: string;
  /** Saved to notes.kind */
  noteKind: string;
  logTag: string;
  allowLipOut: boolean;
  scratch?: { points: number; putts: number };
};

type HoleSetup = { distance: number; shape: ShapeKey };

type ActivePhase = "first-putt" | "miss-category" | "primary-reason" | "second-putt";

const SECOND_PUTT_CHIPS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10] as const;

const POINTS_GUIDE: { label: string; points: string; tone: string }[] = [
  { label: "Holed first putt", points: "+10", tone: "bg-[#014421] text-white" },
  { label: "Lip out, then holed", points: "+9", tone: "bg-green-100 text-[#014421]" },
  { label: "Past on the high side, holed next", points: "+8 / +5", tone: "bg-green-100 text-[#014421]" },
  { label: "Past on the low side, holed next", points: "+3 / 0", tone: "bg-amber-100 text-amber-900" },
  { label: "Left it short, holed next", points: "−5", tone: "bg-amber-100 text-amber-900" },
  { label: "Three putt", points: "−10", tone: "bg-red-100 text-red-700" },
];

const REASONS: { key: PrimaryMissReason; title: string; hint: string; icon: React.ReactNode }[] = [
  { key: "read", title: "Read", hint: "Misjudged the break", icon: <Eye className="h-5 w-5" aria-hidden /> },
  { key: "speed", title: "Speed", hint: "Too firm or too soft", icon: <Gauge className="h-5 w-5" aria-hidden /> },
  { key: "startLine", title: "Start line", hint: "Started it off line", icon: <Crosshair className="h-5 w-5" aria-hidden /> },
];

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildHoles(format: PuttingCombineFormat): HoleSetup[] {
  const distances = shuffle([...format.distances]);
  const { straight, leftToRight, rightToLeft } = format.shapeCounts;
  const shapePool: ShapeKey[] = [
    ...Array<ShapeKey>(straight).fill("Straight"),
    ...Array<ShapeKey>(leftToRight).fill("Left-to-Right"),
    ...Array<ShapeKey>(rightToLeft).fill("Right-to-Left"),
  ];
  const shapes = shuffle(shapePool);
  return distances.map((distance, i) => ({ distance, shape: shapes[i]! }));
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

async function persistHoleToSupabase(format: PuttingCombineFormat, userId: string, record: PuttingCombineHoleRecord) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: format.practiceType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: format.noteKind,
        holeIndex: record.holeIndex,
        distance: record.distance,
        shape: record.shape,
        outcome: record.outcome,
        missReason: record.missReason,
        missCategoryLabel: record.missCategoryLabel ?? null,
        primaryMissReason: record.primaryMissReason,
        secondPuttDistanceFt: record.secondPuttDistanceFt,
        putts: record.putts,
        points: record.points,
        isThreePutt: record.isThreePutt,
      }),
    });
    if (error) {
      console.warn(`[${format.logTag}] Supabase save:`, error.message);
    } else {
      if (record.holeIndex === format.holeCount - 1) {
        void awardCombineCompletionXp(userId);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("practiceSessionsUpdated"));
      }
    }
  } catch (e) {
    console.warn(`[${format.logTag}] Supabase save failed`, e);
  }
}

function holeResultText(r: PuttingCombineHoleRecord): string {
  if (r.outcome === "make") return "Holed it!";
  if (r.isThreePutt) return "Three putt";
  if (r.missReason === "lipOut") return "Lip out, holed the next";
  return "Two putts";
}

function scoreTone(h: PuttingCombineHoleRecord): string {
  if (h.putts === 1) return "bg-[#014421] text-white";
  if (h.isThreePutt) return "bg-red-500 text-white";
  if (h.points >= 5) return "bg-green-100 text-[#014421]";
  return "bg-amber-100 text-amber-900";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type DistanceBand = { label: string; min: number; max: number };

/** Splits distances into bands with roughly equal putt counts, never splitting one distance across two bands. */
function distanceBands(distances: number[], groups: number): DistanceBand[] {
  const sorted = [...distances].sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  if (unique.length <= 4) return unique.map((d) => ({ label: `${d} ft`, min: d, max: d }));
  const bands: DistanceBand[] = [];
  let start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cut = (sorted.length * (bands.length + 1)) / groups;
    const last = i === sorted.length - 1;
    if (last || (i + 1 >= cut && sorted[i + 1] !== sorted[i] && bands.length < groups - 1)) {
      const min = sorted[start]!;
      const max = sorted[i]!;
      bands.push({ label: min === max ? `${min} ft` : `${min}–${max} ft`, min, max });
      start = i + 1;
    }
  }
  return bands;
}

/** Rough tour make rates, only used to judge which range is weakest relative to how hard it is. */
const MAKE_RATE_GUIDE: [number, number][] = [
  [3, 0.96],
  [4, 0.88],
  [5, 0.77],
  [6, 0.66],
  [8, 0.5],
  [10, 0.4],
  [12, 0.33],
  [15, 0.23],
  [20, 0.15],
  [25, 0.1],
  [30, 0.07],
  [40, 0.04],
];

function expectedMakeRate(ft: number): number {
  const first = MAKE_RATE_GUIDE[0]!;
  const last = MAKE_RATE_GUIDE[MAKE_RATE_GUIDE.length - 1]!;
  if (ft <= first[0]) return first[1];
  if (ft >= last[0]) return last[1];
  for (let i = 1; i < MAKE_RATE_GUIDE.length; i++) {
    const [d1, r1] = MAKE_RATE_GUIDE[i]!;
    const [d0, r0] = MAKE_RATE_GUIDE[i - 1]!;
    if (ft <= d1) return r0 + ((ft - d0) / (d1 - d0)) * (r1 - r0);
  }
  return last[1];
}

type LeakKey = "short" | "lowSide" | "past" | "lipOut" | "threePutt";

const LEAKS: { key: LeakKey; label: string; tone: string }[] = [
  { key: "short", label: "Left short", tone: "bg-red-400" },
  { key: "lowSide", label: "Low side", tone: "bg-amber-500" },
  { key: "past", label: "Ran past", tone: "bg-sky-400" },
  { key: "lipOut", label: "Lip outs", tone: "bg-green-300" },
  { key: "threePutt", label: "Three putts", tone: "bg-red-600" },
];

/** Which bucket a hole's lost points belong to. Straight putts have no low side, so their misses past count as "ran past". */
function leakOf(h: PuttingCombineHoleRecord): LeakKey | null {
  if (h.outcome === "make") return null;
  if (h.isThreePutt) return "threePutt";
  if (h.missReason === "lipOut") return "lipOut";
  if (h.missReason === "highShort" || h.missReason === "lowShort") return "short";
  if (h.missReason === "lowLong" && h.shape !== "Straight") return "lowSide";
  return "past";
}

const REASON_TEXT: Record<PrimaryMissReason, string> = { read: "read", speed: "speed", startLine: "start line" };

function missSpotText(h: PuttingCombineHoleRecord): string {
  if (h.missReason === "lipOut") return "Lip out";
  if (h.missReason == null) return "Missed";
  const pace = h.missReason.endsWith("Short") ? "Short" : "Past";
  const high = h.missReason.startsWith("high");
  const side = h.shape === "Straight" ? (high ? "left" : "right") : high ? "high side" : "low side";
  return `${pace}, ${side}`;
}

function holeDetail(h: PuttingCombineHoleRecord): string {
  if (h.outcome === "make") return "Holed first putt";
  const parts = [missSpotText(h)];
  if (h.primaryMissReason) parts.push(`${REASON_TEXT[h.primaryMissReason]} miss`);
  if (h.secondPuttDistanceFt != null) parts.push(`${h.secondPuttDistanceFt} ft left`);
  parts.push(h.isThreePutt ? "3 putts" : "2 putts");
  return parts.join(" · ");
}

const SHAPES: ShapeKey[] = ["Straight", "Left-to-Right", "Right-to-Left"];

/** Everything the putting results screen shows, including the "focus next" tip. */
function puttingBreakdown(holes: PuttingCombineHoleRecord[], holeCount: number) {
  const makePts = puttingTestConfig.points.make;
  const holed = holes.filter((h) => h.outcome === "make").length;
  const misses = holes.filter((h) => h.outcome === "miss");

  const lost: Record<LeakKey, number> = { short: 0, lowSide: 0, past: 0, lipOut: 0, threePutt: 0 };
  const count: Record<LeakKey, number> = { short: 0, lowSide: 0, past: 0, lipOut: 0, threePutt: 0 };
  for (const h of holes) {
    const k = leakOf(h);
    if (!k) continue;
    lost[k] += makePts - h.points;
    count[k]++;
  }
  const totalLost = Object.values(lost).reduce((s, x) => s + x, 0);

  const bands = distanceBands(
    holes.map((h) => h.distance),
    holeCount >= 18 ? 4 : 3,
  ).map((b) => {
    const at = holes.filter((h) => h.distance >= b.min && h.distance <= b.max);
    const made = at.filter((h) => h.outcome === "make").length;
    const expected = at.reduce((s, h) => s + expectedMakeRate(h.distance), 0);
    return { ...b, made, n: at.length, gap: made - expected };
  });
  const weakest = [...bands].sort((a, b) => a.gap - b.gap)[0];
  const weakBand = weakest && weakest.gap <= -0.5 ? weakest : null;

  const byShape = SHAPES.map((shape) => {
    const at = holes.filter((h) => h.shape === shape);
    return { shape, made: at.filter((h) => h.outcome === "make").length, n: at.length };
  }).filter((s) => s.n > 0);

  const firstPuttMisses = misses.filter((h) => h.missReason !== "lipOut");
  const short = firstPuttMisses.filter((h) => h.missReason === "highShort" || h.missReason === "lowShort").length;
  const breakingMisses = firstPuttMisses.filter((h) => h.shape !== "Straight" && h.missReason != null);
  const highSide = breakingMisses.filter((h) => h.missReason!.startsWith("high")).length;
  const causes: Record<PrimaryMissReason, number> = { read: 0, speed: 0, startLine: 0 };
  for (const h of misses) if (h.primaryMissReason) causes[h.primaryMissReason]++;
  const leaves = misses.filter((h) => h.secondPuttDistanceFt != null).map((h) => h.secondPuttDistanceFt!);
  const avgLeave = leaves.length > 0 ? leaves.reduce((s, x) => s + x, 0) / leaves.length : null;

  const fixable = (["threePutt", "short", "lowSide"] as const)
    .map((k) => ({ k, n: count[k], lost: lost[k] }))
    .sort((a, b) => b.lost - a.lost)[0]!;

  let focus: { title: string; lines: string[] };
  if (holed === holes.length) {
    focus = { title: "Perfect round", lines: ["You holed every putt first time. Move the balls further back next time."] };
  } else if (fixable.lost === 0) {
    focus = {
      title: "Focus next: holing more",
      lines: [
        `You holed ${holed} of ${holes.length} first time, and every miss was a good one.`,
        "Keep that pace and pick a smaller target, like one edge of the cup.",
      ],
    };
  } else if (fixable.k === "threePutt") {
    focus = {
      title: "Focus next: no more three putts",
      lines: [
        `${plural(fixable.n, "three putt")} cost you ${fixable.lost} pts.`,
        "On long putts think pace first: try to stop every ball inside a 1 m circle round the hole.",
      ],
    };
    if (avgLeave != null && avgLeave >= 3) focus.lines.push(`Your misses left you ${avgLeave.toFixed(1)} ft on average.`);
  } else if (fixable.k === "short") {
    focus = {
      title: "Focus next: getting it to the hole",
      lines: [
        `You left ${plural(fixable.n, "putt")} short, which cost you ${fixable.lost} pts.`,
        "Picture the ball finishing 30–45 cm past the hole. A putt that stops short can't drop.",
      ],
    };
  } else {
    focus = {
      title: "Focus next: playing more break",
      lines: [
        `${plural(fixable.n, "breaking putt")} slid by on the low side, costing ${fixable.lost} pts.`,
        "Aim higher than looks right. A putt on the high side always has a chance to fall in.",
      ],
    };
  }
  if (weakBand && holed < holes.length) {
    focus.lines.push(`Weakest range: ${weakBand.label}, where you holed ${weakBand.made} of ${weakBand.n}.`);
  }

  return {
    holed,
    misses: misses.length,
    lost,
    totalLost,
    bands,
    weakBand,
    byShape,
    short,
    past: firstPuttMisses.length - short,
    lipOuts: count.lipOut,
    highSide,
    lowSide: breakingMisses.length - highSide,
    causes,
    avgLeave,
    nextHoled: misses.filter((h) => !h.isThreePutt).length,
    focus,
  };
}

export function PuttingCombineRunner({ format }: { format: PuttingCombineFormat }) {
  const user = useCombineUser();
  const userId = user?.id;
  const HOLES = format.holeCount;
  const MAX_POINTS = PUTTING_TEST_MAX_POINTS[format.gradeVariant];
  const TOUR_AVERAGE = PUTTING_TEST_PGA_TOUR_AVERAGE_POINTS[format.gradeVariant];

  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [holes, setHoles] = useState<HoleSetup[]>([]);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalPutts, setTotalPutts] = useState(0);
  const [holeLog, setHoleLog] = useState<PuttingCombineHoleRecord[]>([]);
  const [phase, setPhase] = useState<ActivePhase>("first-putt");
  const [missCategory, setMissCategory] = useState<MissCategory | null>(null);
  const [primaryMissReason, setPrimaryMissReason] = useState<PrimaryMissReason | null>(null);
  const [secondPuttDistanceInput, setSecondPuttDistanceInput] = useState("");
  const [showStationSetupList, setShowStationSetupList] = useState(true);
  const [showPointsGuide, setShowPointsGuide] = useState(false);

  const currentHole = holes[currentHoleIndex];
  const secondPuttDistanceNum = parseFloat(secondPuttDistanceInput);
  const secondDistanceValid =
    secondPuttDistanceInput.trim() !== "" &&
    !Number.isNaN(secondPuttDistanceNum) &&
    secondPuttDistanceNum > 0;

  const startTest = useCallback(() => {
    setHoles(buildHoles(format));
    setCurrentHoleIndex(0);
    setTotalPoints(0);
    setTotalPutts(0);
    setHoleLog([]);
    setPhase("first-putt");
    setMissCategory(null);
    setPrimaryMissReason(null);
    setSecondPuttDistanceInput("");
    setShowStationSetupList(true);
    setStatus("active");
  }, [format]);

  const finishHole = useCallback(
    (record: PuttingCombineHoleRecord) => {
      flushSync(() => {
        setHoleLog((prev) => [...prev, record]);
        setTotalPoints((p) => p + record.points);
        setTotalPutts((p) => p + record.putts);
      });
      if (userId) {
        void persistHoleToSupabase(format, userId, record);
      }
      setMissCategory(null);
      setPrimaryMissReason(null);
      setSecondPuttDistanceInput("");
      setPhase("first-putt");

      const nextIndex = currentHoleIndex + 1;
      if (nextIndex >= HOLES) {
        setStatus("complete");
      } else {
        setCurrentHoleIndex(nextIndex);
      }
    },
    [format, userId, currentHoleIndex, HOLES],
  );

  const onMake = useCallback(() => {
    if (!currentHole || status !== "active") return;
    finishHole({
      holeIndex: currentHoleIndex,
      distance: currentHole.distance,
      shape: currentHole.shape,
      outcome: "make",
      missReason: null,
      primaryMissReason: null,
      missCategoryLabel: null,
      secondPuttDistanceFt: null,
      putts: 1,
      points: puttingTestConfig.points.make,
      isThreePutt: false,
    });
  }, [currentHole, currentHoleIndex, finishHole, status]);

  const onPickCategory = useCallback((cat: MissCategory) => {
    setMissCategory(cat);
    setPhase("primary-reason");
  }, []);

  const onPickPrimaryMissReason = useCallback((reason: PrimaryMissReason) => {
    setPrimaryMissReason(reason);
    setPhase("second-putt");
  }, []);

  const onSecondPuttResult = useCallback(
    (made: boolean) => {
      if (!currentHole || missCategory == null || primaryMissReason == null || !secondDistanceValid) return;
      const { points, putts, isThreePutt } = scorePuttingTestMissHole({
        missCategory,
        secondPuttDistanceFt: secondPuttDistanceNum,
        madeSecondPutt: made,
      });
      finishHole({
        holeIndex: currentHoleIndex,
        distance: currentHole.distance,
        shape: currentHole.shape,
        outcome: "miss",
        missReason: missCategory,
        primaryMissReason,
        missCategoryLabel: PUTTING_TEST_MISS_CATEGORY_LABELS[missCategory],
        secondPuttDistanceFt: secondPuttDistanceNum,
        putts,
        points,
        isThreePutt,
      });
    },
    [currentHole, currentHoleIndex, finishHole, missCategory, primaryMissReason, secondDistanceValid, secondPuttDistanceNum],
  );

  const goBackPhase = useCallback(() => {
    if (phase === "miss-category") {
      setPhase("first-putt");
      return;
    }
    if (phase === "primary-reason") {
      setPhase("miss-category");
      setMissCategory(null);
      return;
    }
    if (phase === "second-putt") {
      setPhase("primary-reason");
      setPrimaryMissReason(null);
    }
  }, [phase]);

  const summary = useMemo(() => {
    if (holeLog.length === 0) return null;
    return {
      points: holeLog.reduce((s, h) => s + h.points, 0),
      putts: holeLog.reduce((s, h) => s + h.putts, 0),
    };
  }, [holeLog]);

  const trackResults: HoleResult[] = Array.from({ length: HOLES }, (_, i) => {
    const r = holeLog[i];
    return r ? { points: r.points, putts: r.putts } : null;
  });

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero title={format.title} chips={[`${HOLES} putts`, format.distanceRange, format.duration, `${MAX_POINTS} pts max`]} />

        <IntroSteps
          steps={[
            { icon: <ListChecks className="h-5 w-5" aria-hidden />, title: `Set up ${HOLES} putts`, hint: "We give you a mix of distances and breaks" },
            { icon: <CircleDot className="h-5 w-5" aria-hidden />, title: "Hit each putt once", hint: "Tap Holed or Missed" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Missed? Tap where it finished", hint: "Then finish the hole. We do the scoring" },
          ]}
        />

        <div className="rounded-2xl border border-gray-100">
          <button
            type="button"
            onClick={() => setShowPointsGuide((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800"
            aria-expanded={showPointsGuide}
          >
            How points work
            <span className="text-xs font-medium text-[#014421]">{showPointsGuide ? "Hide" : "Show"}</span>
          </button>
          {showPointsGuide && (
            <ul className="space-y-1.5 px-4 pb-4">
              {POINTS_GUIDE.filter((p) => format.allowLipOut || !p.label.startsWith("Lip out")).map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3 text-xs text-gray-700">
                  <span>{p.label}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-bold tabular-nums ${p.tone}`}>{p.points}</span>
                </li>
              ))}
              <li className="pt-1 text-[11px] text-gray-400">
                Past the hole scores the higher number when the next putt is inside 1.5 ft. Tour average is {TOUR_AVERAGE}
                {format.scratch ? `, scratch is ${format.scratch.points}` : ""}.
              </li>
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={startTest}
          className="w-full rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-md transition-transform hover:bg-[#013320] active:scale-[0.99]"
        >
          Start the test
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const { grade, showTrophy } = getPuttingTestSkillGrade(summary.points, format.gradeVariant);
    const pct = Math.max(0, Math.min(1, summary.points / MAX_POINTS));
    const tourGap = summary.points - TOUR_AVERAGE;
    const threePutts = holeLog.filter((h) => h.isThreePutt).length;
    const b = puttingBreakdown(holeLog, HOLES);
    const nineTotal = (from: number, to: number) => holeLog.slice(from, to).reduce((s, h) => s + h.points, 0);
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing pct={pct} value={summary.points} caption={`of ${MAX_POINTS} pts`} />
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#014421]">
            {showTrophy && <Trophy className="h-4 w-4 text-[#FFA500]" aria-hidden />}
            {grade}
          </span>
          <p className="mt-2 text-sm text-white/80">
            {tourGap >= 0
              ? `${signed(tourGap)} on the Tour average (${TOUR_AVERAGE})`
              : `${Math.abs(tourGap)} pts off the Tour average (${TOUR_AVERAGE})`}
          </p>
          {format.scratch && (
            <p className="mt-0.5 text-xs text-white/60">Scratch benchmark {format.scratch.points} pts</p>
          )}
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Putts", value: summary.putts, sub: format.scratch ? `Scratch ${format.scratch.putts}` : null },
            { label: "Holed first time", value: `${b.holed}/${HOLES}` },
            { label: "Three putts", value: threePutts },
          ]}
        />

        <FocusCard title={b.focus.title} lines={b.focus.lines} />

        {b.totalLost > 0 && (
          <BreakdownCard title="Where you dropped points" aside={`${b.totalLost} pts`}>
            <BreakdownBar
              segments={LEAKS.filter((l) => format.allowLipOut || l.key !== "lipOut").map((l) => ({
                label: l.label,
                value: b.lost[l.key],
                tone: l.tone,
              }))}
            />
            <p className="mt-2 text-[11px] text-gray-400">Points short of holing every putt first time.</p>
          </BreakdownCard>
        )}

        <BreakdownCard
          title="Hole by hole"
          aside={HOLES === 18 ? `Front ${signed(nineTotal(0, 9))} · Back ${signed(nineTotal(9, 18))}` : undefined}
        >
          <HoleTrack results={trackResults} current={-1} />
        </BreakdownCard>

        <BreakdownCard title="Holed first time" aside="Made / putts">
          <div className="space-y-3">
            {b.bands.map((band) => (
              <RateRow
                key={band.label}
                label={band.label}
                made={band.made}
                total={band.n}
                flag={band.label === b.weakBand?.label ? "Work on" : null}
              />
            ))}
          </div>
          {b.byShape.length > 1 && (
            <>
              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">By break</p>
              <div className="space-y-3">
                {b.byShape.map((s) => (
                  <RateRow key={s.shape} label={puttShapeLabel(s.shape)} made={s.made} total={s.n} />
                ))}
              </div>
            </>
          )}
        </BreakdownCard>

        {b.misses > 0 && (
          <BreakdownCard title="Your misses" aside={`${b.misses} ${b.misses === 1 ? "miss" : "misses"}`}>
            <div className="space-y-3">
              <BreakdownBar
                label="Pace"
                segments={[
                  { label: "Short", value: b.short, tone: "bg-red-400" },
                  { label: "Past", value: b.past, tone: "bg-[#014421]" },
                  ...(format.allowLipOut ? [{ label: "Lip out", value: b.lipOuts, tone: "bg-green-300" }] : []),
                ]}
              />
              {b.highSide + b.lowSide > 0 && (
                <BreakdownBar
                  label="Side, on breaking putts"
                  segments={[
                    { label: "High side", value: b.highSide, tone: "bg-[#014421]" },
                    { label: "Low side", value: b.lowSide, tone: "bg-amber-500" },
                  ]}
                />
              )}
              {b.causes.read + b.causes.speed + b.causes.startLine > 0 && (
                <BreakdownBar
                  label="What caused it"
                  segments={[
                    { label: "Read", value: b.causes.read, tone: "bg-sky-400" },
                    { label: "Speed", value: b.causes.speed, tone: "bg-[#FFA500]" },
                    { label: "Start line", value: b.causes.startLine, tone: "bg-violet-400" },
                  ]}
                />
              )}
              <RateRow label="Holed the next putt" made={b.nextHoled} total={b.misses} />
              {b.avgLeave != null && (
                <p className="text-xs text-gray-600">
                  After a miss you left yourself <span className="font-bold tabular-nums">{b.avgLeave.toFixed(1)} ft</span> on average.
                </p>
              )}
            </div>
          </BreakdownCard>
        )}

        <EveryShotList title="Every hole">
          {holeLog.map((h) => (
            <li key={h.holeIndex} className="flex items-center gap-3 py-2">
              <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{h.holeIndex + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-800">
                  {h.distance} ft · {puttShapeShort(h.shape)}
                </span>
                <span className="block text-xs text-gray-500">{holeDetail(h)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${scoreTone(h)}`}>{signed(h.points)}</span>
            </li>
          ))}
        </EveryShotList>

        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  if (!currentHole) {
    return null;
  }

  const holeDisplay = currentHoleIndex + 1;
  const onHoleOneFirstPutt = currentHoleIndex === 0 && phase === "first-putt";
  const showSetupRosterScreen = onHoleOneFirstPutt && showStationSetupList;
  const lastHole = holeLog[holeLog.length - 1];
  const tourPace = Math.round(totalPoints - (TOUR_AVERAGE / HOLES) * holeLog.length);

  if (showSetupRosterScreen) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Set up your {HOLES} putts</h2>
          <p className="text-sm text-gray-500">Place a ball at each one before you start. The order is shuffled every time.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {holes.map((h, i) => (
            <div key={`${i}-${h.distance}-${h.shape}`} className="relative overflow-hidden rounded-2xl bg-gray-50 p-2.5 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Hole {i + 1}</span>
              <p className="text-2xl font-extrabold tabular-nums leading-tight text-gray-900">
                {h.distance}
                <span className="text-xs font-semibold text-gray-500"> ft</span>
              </p>
              <p className="text-[11px] font-semibold text-[#014421]">{puttShapeShort(h.shape)}</p>
              <PuttLineDiagram shape={h.shape} className="absolute -bottom-1 -right-1 h-12 w-10 opacity-80" />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowStationSetupList(false)}
          className="w-full rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-md hover:bg-[#013320]"
        >
          All set, go to hole 1
        </button>
      </div>
    );
  }

  const missStep = phase === "miss-category" ? 1 : phase === "primary-reason" ? 2 : phase === "second-putt" ? 3 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{totalPoints} pts</span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold tabular-nums text-gray-700">{totalPutts} putts</span>
        </div>
        {holeLog.length > 0 && (
          <span className={`text-xs font-semibold tabular-nums ${tourPace >= 0 ? "text-[#014421]" : "text-gray-500"}`}>
            Tour pace {signed(tourPace)}
          </span>
        )}
      </div>

      <HoleTrack results={trackResults} current={currentHoleIndex} />

      {phase === "first-putt" && lastHole && (
        <p
          key={lastHole.holeIndex}
          className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${
            lastHole.outcome === "make"
              ? "bg-[#014421]/10 text-[#014421]"
              : lastHole.isThreePutt
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-900"
          }`}
        >
          Hole {lastHole.holeIndex + 1}: {holeResultText(lastHole)} {signed(lastHole.points)}
        </p>
      )}

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <PuttLineDiagram shape={currentHole.shape} className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Hole {holeDisplay} of {HOLES}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {currentHole.distance}
            <span className="ml-1 text-xl font-bold text-gray-400">ft</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{puttShapeLabel(currentHole.shape)}</p>
          {onHoleOneFirstPutt && (
            <button
              type="button"
              onClick={() => setShowStationSetupList(true)}
              className="mt-1 self-start text-xs font-medium text-gray-500 underline underline-offset-2"
            >
              See all {HOLES} putts
            </button>
          )}
        </div>
      </div>

      {phase !== "first-putt" && (
        <div className="flex items-center justify-between">
          <CombineFlowBackControl onBack={goBackPhase} />
          <StepDots step={missStep} total={3} />
        </div>
      )}

      {phase === "first-putt" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onMake}
            className="rounded-2xl bg-[#014421] py-6 text-lg font-extrabold text-white shadow-md transition-transform hover:bg-[#013320] active:scale-[0.98]"
          >
            Holed it
            <span className="block text-xs font-semibold text-white/70">+10 pts</span>
          </button>
          <button
            type="button"
            onClick={() => setPhase("miss-category")}
            className="rounded-2xl border-2 border-gray-200 bg-white py-6 text-lg font-extrabold text-gray-800 transition-transform hover:border-[#FFA500] active:scale-[0.98]"
          >
            Missed
            <span className="block text-xs font-semibold text-gray-400">Tell us where</span>
          </button>
        </div>
      )}

      {phase === "miss-category" && (
        <div className="space-y-3">
          <p className="text-base font-bold text-gray-900">Where did it finish?</p>
          <MissSpotPicker shape={currentHole.shape} onPick={onPickCategory} />
          {format.allowLipOut && (
            <button
              type="button"
              onClick={() => onPickCategory("lipOut")}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white py-3 text-sm font-bold text-gray-800 hover:border-[#014421]/40"
            >
              It lipped out
            </button>
          )}
        </div>
      )}

      {phase === "primary-reason" && missCategory != null && (
        <div className="space-y-3">
          <p className="text-base font-bold text-gray-900">What caused the miss?</p>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <ChoiceCard key={r.key} icon={r.icon} title={r.title} hint={r.hint} onClick={() => onPickPrimaryMissReason(r.key)} />
            ))}
          </div>
        </div>
      )}

      {phase === "second-putt" && missCategory != null && primaryMissReason != null && (
        <div className="space-y-4">
          <div>
            <p className="text-base font-bold text-gray-900">How long was the next putt?</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {SECOND_PUTT_CHIPS.map((ft) => {
                const active = secondDistanceValid && secondPuttDistanceNum === ft;
                return (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setSecondPuttDistanceInput(String(ft))}
                    className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                      active ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                  >
                    {ft}
                    <span className={`text-[10px] font-semibold ${active ? "text-white/70" : "text-gray-400"}`}> ft</span>
                  </button>
                );
              })}
              <input
                type="text"
                inputMode="decimal"
                placeholder="Other"
                aria-label="Next putt distance in feet"
                value={SECOND_PUTT_CHIPS.some((c) => String(c) === secondPuttDistanceInput) ? "" : secondPuttDistanceInput}
                onChange={(e) => setSecondPuttDistanceInput(e.target.value)}
                className="min-w-0 rounded-xl border-2 border-gray-200 px-1 text-center text-sm font-bold focus:border-[#014421] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!secondDistanceValid}
              onClick={() => onSecondPuttResult(true)}
              className="rounded-2xl bg-[#014421] py-5 text-base font-extrabold text-white shadow-md transition-transform hover:bg-[#013320] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Holed it
              <span className="block text-xs font-semibold text-white/70">2 putts</span>
            </button>
            <button
              type="button"
              disabled={!secondDistanceValid}
              onClick={() => onSecondPuttResult(false)}
              className="rounded-2xl border-2 border-gray-200 bg-white py-5 text-base font-extrabold text-gray-800 transition-transform hover:border-red-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Missed it
              <span className="block text-xs font-semibold text-gray-400">3 putts</span>
            </button>
          </div>
          {!secondDistanceValid && <p className="text-center text-xs text-gray-400">Pick the distance first</p>}
        </div>
      )}
    </div>
  );
}
