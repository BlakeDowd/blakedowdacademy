"use client";

import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Crosshair, Flag, Ruler } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import {
  type FaceCol,
  type FaceRow,
  type TeeShotDirection,
  type TeeShotDispersionShotLog,
  type TeeShotFingerDispersion,
  type TeeShotFingerSelection,
  TEE_SHOT_FINGER_STEPS,
  buildAggregates,
  isMiddleMiddle,
  lateralMissMeters,
  sessionTotalPoints,
  selectionToLoggedFingers,
  shotPointsForTeeDispersionShot,
  strikeClusterLine,
  strikeQuadrantLabel,
  MAX_SESSION_POINTS,
} from "@/lib/teeShotDispersionCombineAnalytics";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  CombineHero,
  IntroSteps,
  NumberChips,
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
import { MissSidePicker } from "@/components/combine/IronCombineUi";
import {
  BreakdownBar,
  BreakdownCard,
  EveryShotList,
  FocusCard,
  RateRow,
  ValueRow,
} from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS, HERO_ART_CLASS, TeeShotDiagram } from "@/components/combine/CombineArt";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";

const CFG = teeShotDispersionCombineConfig;
const BONUS = CFG.middleMiddleBonus;
const SHOT_MAX = 10 + BONUS;
/** Drives within this many fingers (the 7+ point bands) count as a fairway hit. */
const FAIRWAY_FINGERS = 1.5;
const FINGER_OPTIONS: TeeShotFingerDispersion[] = [...TEE_SHOT_FINGER_STEPS, "outside"];
const CARRY_CHIPS = [180, 200, 220, 240, 260, 280] as const;
const FACE_ROWS: FaceRow[] = ["high", "middle", "low"];
const FACE_COLS: FaceCol[] = ["heel", "middle", "toe"];
const ROW_LABEL: Record<FaceRow, string> = { high: "High", middle: "Mid", low: "Low" };
const COL_LABEL: Record<FaceCol, string> = { heel: "Heel", middle: "Middle", toe: "Toe" };

function parseCarryMeters(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < CFG.minCarryDistanceM || n > CFG.maxCarryDistanceM) return null;
  return n;
}

function toSelection(f: TeeShotFingerDispersion): TeeShotFingerSelection {
  return f === "outside" ? { mode: "outside" } : { mode: "numeric", value: f };
}

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  shots: TeeShotDispersionShotLog[],
  aggregates: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const payload = {
      version: 3,
      total_score: aggregates.total_score,
      shots,
      aggregates,
    };
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: CFG.testType,
      test_type: CFG.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: CFG.noteKind,
        total_points: aggregates.total_points,
        total_score: aggregates.total_score,
        strike_cluster: aggregates.strike_cluster,
        payload,
      }),
    });
    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[TeeShotDispersionCombine] practice insert:", msg);
      return msg;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[TeeShotDispersionCombine] practice insert failed", msg);
    return msg;
  }
}

function pointsTone(points: number): string {
  if (points >= SHOT_MAX) return "bg-[#014421] text-white";
  if (points >= 9) return "bg-green-200 text-[#014421]";
  if (points >= 4) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function fmtM(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type MissFields = Pick<TeeShotDispersionShotLog, "direction" | "finger_dispersion">;

function missLabel(s: MissFields): string {
  if (s.direction === "straight") return "On line";
  const side = s.direction === "left" ? "Left" : "Right";
  return s.finger_dispersion === "outside" ? `${side} 4+` : `${side} ${s.finger_dispersion}`;
}

function isBigMiss(s: MissFields): boolean {
  return s.finger_dispersion === "outside";
}

function isFairway(s: MissFields): boolean {
  if (s.direction === "straight") return true;
  return s.finger_dispersion !== "outside" && s.finger_dispersion <= FAIRWAY_FINGERS;
}

function faceKey(r: FaceRow, c: FaceCol): string {
  return `${r}-${c}`;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: TeeShotDispersionShotLog[]) {
  const n = shots.length;
  const total = sessionTotalPoints(shots);
  const big = shots.filter(isBigMiss);
  const inPlay = shots.filter((s) => !isBigMiss(s));
  const sweetInPlay = inPlay.filter((s) => isMiddleMiddle(s.strike_vertical, s.strike_horizontal)).length;

  // Every drive is worth SHOT_MAX; these three leaks plus `total` always add up to n * SHOT_MAX.
  const bigLost = big.length * SHOT_MAX;
  const strikeLost = (inPlay.length - sweetInPlay) * BONUS;
  const lineLost = inPlay.length * 10 - (total - sweetInPlay * BONUS);

  const fairways = shots.filter(isFairway).length;
  const leftMisses = shots.filter((s) => s.direction === "left" && !isFairway(s)).length;
  const rightMisses = shots.filter((s) => s.direction === "right" && !isFairway(s)).length;
  const bigLeft = big.filter((s) => s.direction === "left").length;
  const bigRight = big.length - bigLeft;

  const laterals = shots.map((s) => s.lateral_meters).filter((m): m is number => m != null);
  const avgMiss = laterals.length ? avg(laterals) : null;

  const carries = shots.map((s) => s.carry_distance_m);
  const byCarry = [...shots].sort((a, b) => b.carry_distance_m - a.carry_distance_m);
  const half = Math.floor(n / 2);
  const longHalf = byCarry.slice(0, half);
  const shortHalf = byCarry.slice(half);
  const carry = {
    avg: avg(carries),
    longest: Math.max(...carries),
    shortest: Math.min(...carries),
    longHalfPts: avg(longHalf.map((s) => s.points)),
    shortHalfPts: avg(shortHalf.map((s) => s.points)),
    halfSize: half,
  };

  const faceCounts: Record<string, number> = {};
  for (const s of shots) {
    const k = faceKey(s.strike_vertical, s.strike_horizontal);
    faceCounts[k] = (faceCounts[k] ?? 0) + 1;
  }
  const sweetAll = faceCounts[faceKey("middle", "middle")] ?? 0;
  const countWhere = (pred: (s: TeeShotDispersionShotLog) => boolean) => shots.filter(pred).length;
  const faceMiss = [
    {
      n: countWhere((s) => s.strike_vertical === "high"),
      tip: "came off high on the face, which adds spin and costs distance. Tee it a touch lower.",
    },
    {
      n: countWhere((s) => s.strike_vertical === "low"),
      tip: "came off low on the face, which costs ball speed. Tee it higher and feel like you hit up on it.",
    },
    {
      n: countWhere((s) => s.strike_horizontal === "heel"),
      tip: "came off the heel. Stand a touch further from the ball and keep your hands from drifting out.",
    },
    {
      n: countWhere((s) => s.strike_horizontal === "toe"),
      tip: "came off the toe. Stand a touch closer and stay in your posture through the strike.",
    },
  ].sort((a, b) => b.n - a.n)[0]!;

  const leaks = [
    { key: "big", lost: bigLost },
    { key: "line", lost: lineLost },
    { key: "strike", lost: strikeLost },
  ].sort((a, b) => b.lost - a.lost);
  const leak = leaks[0]!;

  let focus: { title: string; lines: string[] };
  if (leak.lost === 0) {
    focus = { title: "Perfect round", lines: ["Every drive on line and out of the sweet spot. Pick a narrower target next time."] };
  } else if (leak.key === "big") {
    const sideTip =
      bigLeft > 0 && bigRight > 0
        ? `They went both ways (${bigLeft} left, ${bigRight} right), so this is control, not aim. Swing at 80% until the big miss is gone.`
        : `All of them went ${bigLeft > 0 ? "left" : "right"}. Aim down the ${bigLeft > 0 ? "right" : "left"} edge of the fairway so that miss stays in play.`;
    focus = {
      title: "Focus next: the big miss",
      lines: [`${plural(big.length, "drive")} went wider than 4 fingers and scored 0, costing you ${bigLost} pts.`, sideTip],
    };
  } else if (leak.key === "line") {
    const misses = leftMisses + rightMisses;
    const side =
      leftMisses > rightMisses * 1.5 && leftMisses >= 2 ? "left" : rightMisses > leftMisses * 1.5 && rightMisses >= 2 ? "right" : null;
    const lineTip = side
      ? `${side === "left" ? leftMisses : rightMisses} of your ${misses} missed fairways went ${side}. A one-sided miss is easy to manage: aim down the ${side === "left" ? "right" : "left"} edge and let it work back.`
      : misses >= 2
        ? `You missed both ways (${leftMisses} left, ${rightMisses} right). A two-way miss comes from the face, so pick one shape and commit to it.`
        : "Your misses were small. Pick a tighter target line to sharpen it further.";
    focus = {
      title: "Focus next: start line",
      lines: [`Drives off your target line cost you ${lineLost} pts. You found ${fairways} of ${n} fairways.`, lineTip],
    };
  } else {
    focus = {
      title: "Focus next: strike",
      lines: [
        `Missing the sweet spot cost you ${strikeLost} pts (${sweetAll} of ${n} drives out of the middle).`,
        faceMiss.n > 0 ? `${plural(faceMiss.n, "drive")} ${faceMiss.tip}` : "Keep finding the middle of the face.",
      ],
    };
  }

  return {
    total,
    big: big.length,
    bigLost,
    lineLost,
    strikeLost,
    fairways,
    left: shots.filter((s) => s.direction === "left").length,
    right: shots.filter((s) => s.direction === "right").length,
    leftMisses,
    rightMisses,
    avgMiss,
    carry,
    faceCounts,
    sweetAll,
    cluster: strikeClusterLine(shots),
    focus,
  };
}

const MAP_RANGE = 5;
const OUTSIDE_X = 4.6;

function signedMiss(s: MissFields): number {
  if (s.direction === "straight") return 0;
  const f = s.finger_dispersion === "outside" ? OUTSIDE_X : s.finger_dispersion;
  return s.direction === "left" ? -f : f;
}

const pctX = (x: number) => 50 + (x / MAP_RANGE) * 50;

/** Bird's-eye fairway: each drive plotted by how far it missed sideways (fingers) and how far it carried. */
function FairwayMap({ shots }: { shots: TeeShotDispersionShotLog[] }) {
  const carries = shots.map((s) => s.carry_distance_m);
  const lo = Math.min(...carries);
  const hi = Math.max(...carries);
  const span = hi - lo;
  const pctY = (c: number) => (span > 0 ? 10 + ((c - lo) / span) * 78 : 50);
  const placed: { x: number; y: number }[] = [];
  const dots = shots.map((s) => {
    let x = pctX(signedMiss(s));
    const y = pctY(s.carry_distance_m);
    const step = x > 50 ? -4.5 : 4.5;
    while (placed.some((p) => Math.abs(p.x - x) < 4.5 && Math.abs(p.y - y) < 8)) x += step;
    placed.push({ x, y });
    return { s, x: Math.max(3, Math.min(97, x)), y };
  });
  const bands: { w: number; tone: string }[] = [
    { w: 4, tone: "bg-amber-50" },
    { w: 2.5, tone: "bg-amber-100" },
    { w: FAIRWAY_FINGERS, tone: "bg-green-100" },
    { w: 0.5, tone: "bg-green-200" },
  ];
  return (
    <div>
      <div className="relative h-60 overflow-hidden rounded-xl bg-red-50">
        {bands.map((b) => (
          <div key={b.w} className={`absolute inset-y-0 ${b.tone}`} style={{ left: `${pctX(-b.w)}%`, width: `${(b.w / MAP_RANGE) * 100}%` }} />
        ))}
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#014421]/40" />
        <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-white/80 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#014421]">
          Fairway
        </span>
        {span > 0 && (
          <>
            <span className="absolute left-1 top-1 text-[9px] font-semibold tabular-nums text-gray-500">{fmtM(hi)} m</span>
            <span className="absolute bottom-1 left-1 text-[9px] font-semibold tabular-nums text-gray-500">{fmtM(lo)} m</span>
          </>
        )}
        {dots.map(({ s, x, y }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 w-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-2 ring-white ${pointsTone(s.points)}`}
            style={{ left: `${x}%`, bottom: `${y}%` }}
            title={`Drive ${s.shot}: ${missLabel(s)}, ${fmtM(s.carry_distance_m)} m, ${s.points} pts`}
          >
            {s.shot}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0">Left</span>
        {[-4, -2, 2, 4].map((f) => (
          <span key={f} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pctX(f)}%` }}>
            {Math.abs(f)}
          </span>
        ))}
        <span className="absolute left-1/2 -translate-x-1/2 text-[#014421]">Target</span>
        <span className="absolute right-0">Right</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">
        Sideways in fingers, longer carries higher up. Numbers are the drive order.
      </p>
    </div>
  );
}

/** Driver face laid out as a 3×3 grid, heel on the left. `cell` renders each spot. */
function DriverFace({ cell }: { cell: (r: FaceRow, c: FaceCol) => ReactNode }) {
  return (
    <div className="mx-auto max-w-sm rounded-[2rem] bg-gradient-to-b from-stone-600 to-stone-800 p-3 shadow-inner">
      <div className="grid grid-cols-[2.25rem_repeat(3,minmax(0,1fr))] gap-1.5">
        <span />
        {FACE_COLS.map((c) => (
          <span key={c} className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/60">
            {COL_LABEL[c]}
          </span>
        ))}
        {FACE_ROWS.map((r) => (
          <Fragment key={r}>
            <span className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-white/60">{ROW_LABEL[r]}</span>
            {FACE_COLS.map((c) => (
              <Fragment key={c}>{cell(r, c)}</Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function FacePicker({ row, col, onChange }: { row: FaceRow; col: FaceCol; onChange: (r: FaceRow, c: FaceCol) => void }) {
  return (
    <DriverFace
      cell={(r, c) => {
        const active = r === row && c === col;
        const sweet = isMiddleMiddle(r, c);
        return (
          <button
            type="button"
            onClick={() => onChange(r, c)}
            aria-pressed={active}
            aria-label={sweet ? "Sweet spot" : strikeQuadrantLabel(r, c)}
            className={`flex h-14 items-center justify-center rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
              active
                ? "bg-[#FFA500] text-white"
                : sweet
                  ? "bg-white/20 text-white/80 ring-1 ring-white/40 hover:bg-white/30"
                  : "bg-white/10 text-white/50 hover:bg-white/20"
            }`}
          >
            {active ? <span className="h-4 w-4 rounded-full bg-white shadow" /> : sweet ? `+${BONUS}` : null}
          </button>
        );
      }}
    />
  );
}

function FaceHeatmap({ counts }: { counts: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <DriverFace
      cell={(r, c) => {
        const n = counts[faceKey(r, c)] ?? 0;
        return (
          <div
            className={`flex h-12 items-center justify-center rounded-xl text-sm font-extrabold tabular-nums ${
              n > 0 ? "text-white" : "text-white/30"
            } ${isMiddleMiddle(r, c) ? "ring-2 ring-white/60" : ""}`}
            style={{ backgroundColor: n > 0 ? `rgba(255, 165, 0, ${0.3 + 0.7 * (n / max)})` : "rgba(255, 255, 255, 0.08)" }}
            aria-label={`${strikeQuadrantLabel(r, c)}: ${n}`}
          >
            {n}
          </div>
        );
      }}
    />
  );
}

export function TeeShotDispersionCombineRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = CFG.shotCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [carryInput, setCarryInput] = useState("");
  const [direction, setDirection] = useState<TeeShotDirection>("straight");
  const [fingers, setFingers] = useState<TeeShotFingerDispersion | null>(0);
  const [row, setRow] = useState<FaceRow>("middle");
  const [col, setCol] = useState<FaceCol>("middle");
  const [shots, setShots] = useState<TeeShotDispersionShotLog[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const resetDrive = () => {
    setDirection("straight");
    setFingers(0);
    setRow("middle");
    setCol("middle");
  };

  const startTest = useCallback(() => {
    setStatus("active");
    setCarryInput("");
    resetDrive();
    setShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: TeeShotDispersionShotLog[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, all, buildAggregates(all));
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    const carry = parseCarryMeters(carryInput);
    if (carry === null || fingers === null) return;
    const selection = toSelection(direction === "straight" ? 0 : fingers);
    const entry: TeeShotDispersionShotLog = {
      shot: shots.length + 1,
      carry_distance_m: carry,
      direction,
      finger_dispersion: selectionToLoggedFingers(direction, selection),
      lateral_meters:
        selection.mode === "outside" ? null : lateralMissMeters(carry, direction === "straight" ? 0 : selection.value),
      strike_vertical: row,
      strike_horizontal: col,
      strike_quadrant: strikeQuadrantLabel(row, col),
      points: shotPointsForTeeDispersionShot(direction, selection, row, col),
    };
    const next = [...shots, entry];
    setShots(next);
    setCarryInput(String(carry));
    resetDrive();
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, carryInput, direction, fingers, row, col, shots, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setCarryInput(String(last.carry_distance_m));
    setDirection(last.direction);
    setFingers(last.direction === "straight" ? 0 : last.finger_dispersion);
    setRow(last.strike_vertical);
    setCol(last.strike_horizontal);
  }, [status, shots]);

  const summary = useMemo(
    () => (status === "complete" && shots.length >= total ? breakdown(shots) : null),
    [status, shots, total],
  );

  if (status === "intro") {
    const fingerMetres = lateralMissMeters(CFG.referenceCarryDistanceM, 1).toFixed(0);
    return (
      <div className="space-y-4">
        <CombineHero
          title={CFG.testName}
          kicker="Driving combine"
          art={<TeeShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${total} drives`, "Fairway target", "~15 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Pick a target line", hint: "A tree or post down the middle of your fairway" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the miss in fingers", hint: "Hand at arm's length, count across from your target" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Log the carry and strike mark", hint: "Carry in metres, then where it hit the face" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>On line or within half a finger: 10 pts</li>
            <li>1 to 1.5 fingers: 7 pts · 2 to 2.5 fingers: 4 pts · 3 to 4 fingers: 1 pt</li>
            <li>Wider than 4 fingers: 0 pts, no bonus</li>
            <li>Hit the sweet spot (middle of the face): +{BONUS} bonus</li>
            <li>
              One finger is about {fingerMetres} m sideways at {CFG.referenceCarryDistanceM} m carry.
            </li>
            <li className="font-semibold text-gray-900">Best possible is {MAX_SESSION_POINTS} points. Higher is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const fairwayPct = Math.round((summary.fairways / total) * 100);
    const { carry } = summary;
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing pct={summary.total / MAX_SESSION_POINTS} value={summary.total} caption={`of ${MAX_SESSION_POINTS} points`} />
          <p className="mt-2 text-xs text-white/70">
            {summary.fairways} of {total} fairways · higher is better
          </p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Fairways", value: `${fairwayPct}%`, sub: `within ${FAIRWAY_FINGERS} fingers` },
            { label: "Avg miss", value: summary.avgMiss != null ? `${summary.avgMiss.toFixed(1)} m` : "–", sub: "sideways" },
            { label: "Big misses", value: summary.big, sub: "4+ fingers" },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your drives finished" aside={`L ${summary.left} · On line ${total - summary.left - summary.right} · R ${summary.right}`}>
          <FairwayMap shots={shots} />
          <div className="mt-3">
            <BreakdownBar
              segments={[
                { label: "Missed left", value: summary.leftMisses, tone: "bg-[#FFA500]" },
                { label: "Fairway", value: summary.fairways, tone: "bg-[#014421]" },
                { label: "Missed right", value: summary.rightMisses, tone: "bg-sky-400" },
              ]}
            />
          </div>
        </BreakdownCard>

        <BreakdownCard title="Where your points went" aside={`${summary.total} of ${MAX_SESSION_POINTS}`}>
          <BreakdownBar
            segments={[
              { label: "Scored", value: summary.total, tone: "bg-[#014421]" },
              { label: "Lost to big misses", value: summary.bigLost, tone: "bg-red-500" },
              { label: "Lost off line", value: summary.lineLost, tone: "bg-[#FFA500]" },
              { label: "Lost on strike", value: summary.strikeLost, tone: "bg-sky-400" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="Strike on the face" aside="Drives per spot">
          <FaceHeatmap counts={summary.faceCounts} />
          <div className="mt-3 space-y-2">
            <RateRow label="Sweet spot" made={summary.sweetAll} total={total} />
            <p className="text-xs text-gray-600">{summary.cluster}</p>
          </div>
        </BreakdownCard>

        <BreakdownCard title="Carry" aside={`Avg ${fmtM(Math.round(carry.avg))} m`}>
          <StatTiles
            stats={[
              { label: "Shortest", value: `${fmtM(carry.shortest)} m` },
              { label: "Average", value: `${fmtM(Math.round(carry.avg))} m` },
              { label: "Longest", value: `${fmtM(carry.longest)} m` },
            ]}
          />
          {carry.longest > carry.shortest && (
            <div className="mt-3 space-y-3">
              <ValueRow
                label={`Your ${carry.halfSize} longest`}
                value={carry.longHalfPts}
                max={SHOT_MAX}
                display={`${carry.longHalfPts.toFixed(1)} pts avg`}
              />
              <ValueRow
                label={`Your ${total - carry.halfSize} shortest`}
                value={carry.shortHalfPts}
                max={SHOT_MAX}
                display={`${carry.shortHalfPts.toFixed(1)} pts avg`}
              />
              <p className="text-xs text-gray-600">
                {carry.longHalfPts + 1 < carry.shortHalfPts
                  ? "Your longest drives were your least accurate, so extra speed is costing you fairways."
                  : carry.longHalfPts > carry.shortHalfPts + 1
                    ? "Your longest drives were also your straightest. Commit to a full, free swing."
                    : "Accuracy held up whether you hit it long or short."}
              </p>
            </div>
          )}
        </BreakdownCard>

        <EveryShotList title="Every drive">
          {shots.map((s) => (
            <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.shot}</span>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                {fmtM(s.carry_distance_m)} m · {missLabel(s)}
                {s.direction !== "straight" && s.lateral_meters != null ? ` (${s.lateral_meters.toFixed(1)} m)` : ""} ·{" "}
                {isMiddleMiddle(s.strike_vertical, s.strike_horizontal) ? "Sweet spot" : s.strike_quadrant}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>
                {s.points}
              </span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const driveNumber = shots.length + 1;
  const runningTotal = sessionTotalPoints(shots);
  const carryM = parseCarryMeters(carryInput);
  const carryInvalid = carryInput.trim() !== "" && carryM === null;
  const effFingers: TeeShotFingerDispersion | null = direction === "straight" ? 0 : fingers;
  const liveScore = effFingers === null ? null : shotPointsForTeeDispersionShot(direction, toSelection(effFingers), row, col);
  const canRecord = carryM !== null && liveScore !== null;
  const liveMiss =
    effFingers === null ? (direction === "left" ? "Left" : "Right") : missLabel({ direction, finger_dispersion: effFingers });
  const liveHint =
    effFingers === null
      ? "How many fingers off line?"
      : effFingers === "outside"
        ? "Wider than 4 fingers scores 0"
        : carryM === null
          ? "Add the carry to see it in metres"
          : direction === "straight"
            ? `Down the middle at ${fmtM(carryM)} m`
            : `About ${lateralMissMeters(carryM, effFingers).toFixed(1)} m ${direction} at ${fmtM(carryM)} m carry`;
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = shots[i];
    return s ? { label: String(s.points), tone: pointsTone(s.points), ariaLabel: `Drive ${i + 1}: ${s.points} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shots.length} name="Drive" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <TeeShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Drive {driveNumber} of {total}
          </p>
          <p className="text-4xl font-extrabold leading-none text-gray-900">{liveMiss}</p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{liveHint}</p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <MissSidePicker
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setFingers(d === "straight" ? 0 : null);
          }}
        />
      </div>

      {direction !== "straight" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How many fingers off your target line?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FINGER_OPTIONS.map((f) => {
              const active = fingers === f;
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFingers(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active
                      ? f === "outside"
                        ? "bg-red-500 text-white"
                        : "bg-[#014421] text-white"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {f === "outside" ? "4+" : f}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How far did it carry?</p>
        <NumberChips values={CARRY_CHIPS} value={carryInput} onChange={setCarryInput} unit="m" ariaLabel="Carry in metres" columns={4} />
        {carryInvalid && (
          <p className="text-xs font-medium text-red-600">
            Carry needs to be between {CFG.minCarryDistanceM} and {CFG.maxCarryDistanceM} m.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-bold text-gray-900">Where on the face?</p>
          <span className="text-xs font-semibold text-gray-500">
            {isMiddleMiddle(row, col) ? "Sweet spot" : strikeQuadrantLabel(row, col)}
          </span>
        </div>
        <FacePicker
          row={row}
          col={col}
          onChange={(r, c) => {
            setRow(r);
            setCol(c);
          }}
        />
      </div>

      <PrimaryButton onClick={() => void recordShot()} disabled={!canRecord}>
        {driveNumber >= total ? "Finish the test" : "Next drive"}
        <span className="block text-xs font-semibold text-white/70">
          {liveScore === null ? "Pick how many fingers" : carryM === null ? "Add the carry first" : `This drive scores ${liveScore}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
