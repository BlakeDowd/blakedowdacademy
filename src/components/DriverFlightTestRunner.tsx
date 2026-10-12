"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Crosshair, Repeat } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  DRIVE_FINGER_OPTIONS,
  driverFlightTestConfig as CFG,
  fingerLabel,
  FLIGHT_ORDER,
  flightQuestion,
  flightShotPoints,
  flightTitle,
  otherShape,
  shapeFor,
  type DriveDirection,
  type DriveFingers,
  type DriverFlightShot,
  type FlightKind,
  type StockShape,
} from "@/lib/driverFlightTestConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
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
import { MissSidePicker, Segmented } from "@/components/combine/IronCombineUi";
import { BreakdownCard, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";
import { HERO_ART_CLASS } from "@/components/combine/CombineArt";

const STOCK_STORAGE_PREFIX = "driverFlightStock:";
const OUTSIDE_FINGERS = 4.5;

const FLIGHT_HINT: Record<FlightKind, string> = {
  normal: "Your stock drive",
  low: "Same shape, flight it down",
  opposite: "Shape it the other way",
};

function pointsTone(points: number): string {
  if (points >= 13) return "bg-[#014421] text-white";
  if (points >= 9) return "bg-green-200 text-[#014421]";
  if (points >= 4) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function missLabel(s: Pick<DriverFlightShot, "direction" | "fingers">): string {
  if (s.direction === "straight") return "On line";
  return `${s.direction === "left" ? "Left" : "Right"} ${fingerLabel(s.fingers)}`;
}

/** "Normal draw", "Low draw" or just "Fade" for the opposite shape. */
function shortTitle(s: Pick<DriverFlightShot, "flight" | "shape">): string {
  return s.flight === "opposite" ? s.shape[0]!.toUpperCase() + s.shape.slice(1) : flightTitle(s.flight, s.shape);
}

function readStock(userId: string): StockShape | null {
  try {
    const v = window.localStorage.getItem(STOCK_STORAGE_PREFIX + userId);
    return v === "draw" || v === "fade" ? v : null;
  } catch {
    return null;
  }
}

function storeStock(userId: string, stock: StockShape) {
  try {
    window.localStorage.setItem(STOCK_STORAGE_PREFIX + userId, stock);
  } catch {
    /* storage full or blocked */
  }
}

/** Bird's-eye fairway with the shot shape on top, side-on trajectory below so low flights look low. */
function DriveFlightDiagram({ shape, low = false, className = "" }: { shape: StockShape; low?: boolean; className?: string }) {
  const bend = shape === "draw" ? 22 : -22;
  const peak = low ? 104 : 90;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#14592c" />
      <path d="M36 80 L26 6 L74 6 L64 80 Z" fill="#2f8f4e" />
      <path
        d={`M50 74 C ${50 + bend} 54, ${50 + bend} 26, 50 12`}
        fill="none"
        stroke="white"
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeDasharray="1 6"
        strokeLinecap="round"
      />
      <circle cx="50" cy="12" r="4" fill={BRAND_ORANGE} />
      <circle cx="50" cy="74" r="4" fill="white" />
      <line x1="10" y1="111" x2="90" y2="111" stroke="white" strokeOpacity={0.35} strokeWidth={1.5} />
      <path d={`M12 111 Q 50 ${peak * 2 - 111} 88 111`} fill="none" stroke={low ? BRAND_ORANGE : "white"} strokeOpacity={0.9} strokeWidth={2.5} />
    </svg>
  );
}

function flightTip(flight: FlightKind, shape: StockShape): string {
  if (flight === "low") return "For a low drive: tee it lower, ball a touch further back, and hold a shorter, lower finish.";
  if (flight === "normal") return `Your stock ${shape} is the drive you lean on most. Groove one target and one start line before you work on the others.`;
  return shape === "draw"
    ? "For the draw: aim the face just right of target and swing more in to out than the face so it curves back."
    : "For the fade: aim the face just left of target and swing more out to in than the face so it curves back.";
}

function breakdown(shots: DriverFlightShot[]) {
  const total = shots.reduce((sum, s) => sum + s.points, 0);
  const hit = shots.filter((s) => s.achieved).length;
  const fingers = shots.map((s) => (s.direction === "straight" ? 0 : s.fingers === "outside" ? OUTSIDE_FINGERS : s.fingers));
  const avgFingers = fingers.reduce((a, b) => a + b, 0) / Math.max(1, fingers.length);
  const ranked = [...shots].sort((a, b) => a.points - b.points);
  const weakest = ranked[0]!;
  const best = ranked[ranked.length - 1]!;

  let focus: { title: string; lines: string[] };
  if (total === CFG.maxSessionPoints) {
    focus = { title: "Full control", lines: ["Every flight pulled off and on line. Narrow your target next time."] };
  } else {
    const name = shortTitle(weakest).toLowerCase();
    const where = weakest.direction === "straight" ? "on line" : `${missLabel(weakest).toLowerCase()} fingers off line`;
    focus = {
      title: `Focus next: the ${name}`,
      lines: [
        weakest.achieved
          ? `You pulled off ${hit} of 3 flights. Your ${name} was the weakest drive, finishing ${where}.`
          : `You pulled off ${hit} of 3 flights. The ${name} didn't come off and finished ${where}.`,
        flightTip(weakest.flight, weakest.shape),
      ],
    };
  }
  return { total, hit, avgFingers, weakest, best, focus };
}

async function persistSession(userId: string, shots: DriverFlightShot[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const total = shots.reduce((sum, s) => sum + s.points, 0);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: CFG.practiceLogType,
      score: total,
      total_points: total,
      strike_data: shots.map(({ shot, flight, shape, achieved, direction, fingers, points }) => ({
        shot,
        flight,
        shape,
        achieved,
        direction,
        fingers,
        points,
      })),
    });
    if (!res.ok) {
      console.warn("[DriverFlightTest] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[DriverFlightTest] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function DriverFlightReport({ shots }: { shots: DriverFlightShot[] }) {
  const summary = breakdown(shots);
  return (
    <>
      <ResultHero>
        <ScoreRing pct={summary.total / CFG.maxSessionPoints} value={summary.total} caption={`of ${CFG.maxSessionPoints} points`} />
        <p className="mt-2 text-xs text-white/70">{summary.hit} of 3 flights pulled off · higher is better</p>
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Flights", value: `${summary.hit}/3`, sub: "pulled off" },
          { label: "Avg miss", value: summary.avgFingers.toFixed(1), sub: "fingers" },
          { label: "Best drive", value: summary.best.points, sub: shortTitle(summary.best) },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Each flight" aside={`${summary.total} of ${CFG.maxSessionPoints}`}>
        <div className="space-y-3">
          {shots.map((s) => (
            <div key={s.shot} className="flex items-center gap-3">
              <DriveFlightDiagram shape={s.shape} low={s.flight === "low"} className="h-14 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <ValueRow
                  label={flightTitle(s.flight, s.shape)}
                  value={s.points}
                  max={CFG.maxShotPoints}
                  display={`${s.points} pts`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {s.achieved ? "Flight pulled off" : "Flight missed"} · {missLabel(s)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </BreakdownCard>
    </>
  );
}

export function DriverFlightTestRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = FLIGHT_ORDER.length;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [stock, setStock] = useState<StockShape>("draw");
  const [achieved, setAchieved] = useState<"yes" | "no" | "">("");
  const [direction, setDirection] = useState<DriveDirection>("straight");
  const [fingers, setFingers] = useState<DriveFingers | null>(0);
  const [shots, setShots] = useState<DriverFlightShot[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const saved = readStock(userId);
    if (saved) queueMicrotask(() => setStock(saved));
  }, [userId]);

  const resetShot = () => {
    setAchieved("");
    setDirection("straight");
    setFingers(0);
  };

  const startTest = useCallback(() => {
    if (userId) storeStock(userId, stock);
    setShots([]);
    resetShot();
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, [stock, userId]);

  const save = useCallback(
    async (all: DriverFlightShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const shotIndex = shots.length;
  const flight = FLIGHT_ORDER[shotIndex] ?? "normal";
  const shape = shapeFor(flight, stock);
  const effFingers: DriveFingers | null = direction === "straight" ? 0 : fingers;
  const livePoints = achieved !== "" && effFingers != null ? flightShotPoints(achieved === "yes", direction, effFingers) : null;

  const recordShot = useCallback(async () => {
    if (status !== "active" || achieved === "" || effFingers == null) return;
    const next: DriverFlightShot[] = [
      ...shots,
      {
        shot: shotIndex + 1,
        flight,
        shape,
        achieved: achieved === "yes",
        direction,
        fingers: effFingers,
        points: flightShotPoints(achieved === "yes", direction, effFingers),
      },
    ];
    setShots(next);
    resetShot();
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, achieved, effFingers, shots, shotIndex, flight, shape, direction, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setAchieved(last.achieved ? "yes" : "no");
    setDirection(last.direction);
    setFingers(last.direction === "straight" ? 0 : last.fingers);
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={CFG.testName}
          kicker="Driving combine"
          art={<DriveFlightDiagram shape={stock} className={HERO_ART_CLASS} />}
          chips={["3 drives", "Driver", "~5 min", "Highest score wins"]}
        />
        <div className="space-y-2 rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-900">Your normal driver shape</p>
          <Segmented
            options={[
              { key: "draw", label: "Draw" },
              { key: "fade", label: "Fade" },
            ]}
            value={stock}
            onChange={setStock}
          />
          <p className="text-xs text-gray-500">
            You&apos;ll hit a normal {stock}, a low {stock}, then a {otherShape(stock)}.
          </p>
        </div>
        <IntroSteps
          steps={[
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: `Drive 1: your normal ${stock}`, hint: "Pick a target line and hit your stock drive" },
            { icon: <ArrowDownToLine className="h-5 w-5" aria-hidden />, title: `Drive 2: a low ${stock}`, hint: "Same shape, flighted down under the wind" },
            { icon: <Repeat className="h-5 w-5" aria-hidden />, title: `Drive 3: the opposite, a ${otherShape(stock)}`, hint: "Shape it the way you don't normally" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Finger dispersion from your target line: on line or within half a finger 10, 1 to 1.5 fingers 7, 2 to 2.5 fingers 4, 3 to 4 fingers 1, wider 0</li>
            <li>Pulled off the flight asked for: +{CFG.flightBonus}</li>
            <li className="font-semibold text-gray-900">Best possible is {CFG.maxSessionPoints} points. Higher is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <DriverFlightReport shots={shots} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const runningTotal = shots.reduce((sum, s) => sum + s.points, 0);
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

      <ProgressTrack items={track} current={shotIndex} name="Drive" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <DriveFlightDiagram shape={shape} low={flight === "low"} className="h-32 w-[6.5rem] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Drive {shotIndex + 1} of {total}
          </p>
          <p className="text-3xl font-extrabold leading-tight text-gray-900">{shortTitle({ flight, shape })}</p>
          <p className="mt-1 text-sm font-semibold text-[#014421]">{FLIGHT_HINT[flight]}</p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last drive" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">{flightQuestion(flight, shape)}</p>
        <Segmented<"yes" | "no" | "">
          options={[
            { key: "yes", label: "Yes", hint: `+${CFG.flightBonus} pts` },
            { key: "no", label: "No", hint: "No bonus" },
          ]}
          value={achieved}
          onChange={setAchieved}
        />
      </div>

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
            {DRIVE_FINGER_OPTIONS.map((f) => {
              const active = fingers === f;
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFingers(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active ? (f === "outside" ? "bg-red-500 text-white" : "bg-[#014421] text-white") : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {fingerLabel(f)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PrimaryButton onClick={() => void recordShot()} disabled={livePoints === null}>
        {shotIndex + 1 >= total ? "Finish the test" : "Next drive"}
        <span className="block text-xs font-semibold text-white/70">
          {achieved === "" ? "Did the flight come off?" : livePoints === null ? "Pick how many fingers" : `This drive scores ${livePoints}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
