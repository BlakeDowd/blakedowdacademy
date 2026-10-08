"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Flag, Ruler, Target } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";
import {
  STANDARD_CHIPPING_MAX_TOTAL_POINTS,
  roundStandardChippingPointsOneDecimal,
  standardChippingPointsFromMetres,
} from "@/lib/standardChippingScoring";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { performanceGradeFromOutOf150 } from "@/lib/combinePerformanceGrade";
import { CombinePerformanceGradeBadge } from "@/components/CombinePerformanceGradeBadge";
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
import {
  BreakdownBar,
  BreakdownCard,
  EveryShotList,
  FocusCard,
  RateRow,
  ValueRow,
} from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS, ChipShotDiagram, HERO_ART_CLASS } from "@/components/combine/CombineArt";

type StationM = (typeof standardChippingCombineConfig.distancesMetres)[number];

type ChipShot = { shot: number; station: StationM; metres: number };

const STATIONS = standardChippingCombineConfig.distancesMetres;
const PER_STATION = standardChippingCombineConfig.shotsPerDistance;
const SEQUENCE: StationM[] = STATIONS.flatMap((s) => Array.from({ length: PER_STATION }, () => s));
const MAX_SHOT_POINTS = 10;
const ZERO_BEYOND_M = 4.5;
const MISS_CHIPS_M = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3.5, 4.5] as const;

const STATION_TIPS: Record<StationM, string> = {
  5: "From close range, use less loft and a putting-style stroke so the ball rolls like a putt.",
  10: "Pick one landing spot and commit to it. A steady carry makes the roll easy to judge.",
  20: "Long chips leak on carry. Hit a few to a towel on the green until the carry repeats.",
};

/** Allow decimal metres; strip invalid chars; single decimal point. */
function normalizeMetresInput(raw: string): string {
  let t = raw.replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  if (dot !== -1) {
    t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
  }
  return t;
}

function parseMetres(raw: string): number | null {
  const t = raw.trim();
  if (t === "" || t === ".") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function shotPoints(metres: number): number {
  return Math.max(0, standardChippingPointsFromMetres(metres));
}

function sessionTotal(shots: ChipShot[]): number {
  return roundStandardChippingPointsOneDecimal(shots.reduce((acc, s) => acc + shotPoints(s.metres), 0));
}

function formatPts(n: number): string {
  const r = roundStandardChippingPointsOneDecimal(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function formatMetres(m: number): string {
  return `${Number(m.toFixed(2))} m`;
}

function pointsTone(points: number): string {
  if (points >= 8) return "bg-[#014421] text-white";
  if (points >= 5) return "bg-green-200 text-[#014421]";
  if (points > 0) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function trackItem(s: ChipShot): NonNullable<TrackItem> {
  const p = shotPoints(s.metres);
  return { label: String(Math.round(p)), tone: pointsTone(p), ariaLabel: `Shot ${s.shot} (${s.station} m): ${formatPts(p)} points` };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: ChipShot[]) {
  const n = shots.length;
  const total = sessionTotal(shots);
  const stations = STATIONS.map((station) => {
    const at = shots.filter((s) => s.station === station);
    const pts = roundStandardChippingPointsOneDecimal(at.reduce((acc, s) => acc + shotPoints(s.metres), 0));
    return {
      station,
      n: at.length,
      pts,
      lost: roundStandardChippingPointsOneDecimal(at.length * MAX_SHOT_POINTS - pts),
      avgM: mean(at.map((s) => s.metres)),
      insideOne: at.filter((s) => s.metres <= 1).length,
      zeros: at.filter((s) => s.metres > ZERO_BEYOND_M).length,
    };
  });
  const leak = [...stations].sort((a, b) => b.lost - a.lost || b.avgM - a.avgM)[0]!;

  const zones = [
    { label: "Holed", value: shots.filter((s) => s.metres === 0).length, tone: "bg-[#014421]" },
    { label: "Inside 1 m", value: shots.filter((s) => s.metres > 0 && s.metres <= 1).length, tone: "bg-green-500" },
    { label: "1 to 2.5 m", value: shots.filter((s) => s.metres > 1 && s.metres <= 2.5).length, tone: "bg-lime-400" },
    { label: "2.5 to 4.5 m", value: shots.filter((s) => s.metres > 2.5 && s.metres <= ZERO_BEYOND_M).length, tone: "bg-[#FFA500]" },
    { label: "Past 4.5 m", value: shots.filter((s) => s.metres > ZERO_BEYOND_M).length, tone: "bg-red-400" },
  ];

  const focus =
    leak.lost <= 0
      ? { title: "Perfect round", lines: ["Every chip holed. Time to move the stations further back."] }
      : {
          title: `Focus next: ${leak.station} m chips`,
          lines: [
            `They finished ${leak.avgM.toFixed(1)} m from the hole on average and cost you ${formatPts(leak.lost)} pts.`,
            STATION_TIPS[leak.station],
            ...(leak.zeros > 0
              ? [`${leak.zeros} of them finished past ${ZERO_BEYOND_M} m and scored nothing.`]
              : []),
          ],
        };

  return {
    total,
    avgPerShot: n ? total / n : 0,
    avgMiss: mean(shots.map((s) => s.metres)),
    insideOne: shots.filter((s) => s.metres <= 1).length,
    stations,
    leak: leak.lost > 0 ? leak.station : null,
    zones,
    grade: performanceGradeFromOutOf150(total),
    focus,
  };
}

async function persistStandardChippingSession(userId: string, totalScore: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const sessionScore: number =
      typeof totalScore === "number" && Number.isFinite(totalScore) ? totalScore : 0;

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: standardChippingCombineConfig.practiceLogType,
      sub_type: standardChippingCombineConfig.practiceLogSubType,
      score: sessionScore,
      total_points: sessionScore,
    });

    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[StandardChippingCombine] practice_logs insert:", msg);
      return msg;
    }

    await awardCombineCompletionXp(userId);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[StandardChippingCombine] practice_logs insert failed", msg);
    return msg;
  }
}

export function StandardChippingCombineRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = SEQUENCE.length;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<ChipShot[]>([]);
  const [missInput, setMissInput] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const startTest = useCallback(() => {
    setStatus("active");
    setShots([]);
    setMissInput("");
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: ChipShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistStandardChippingSession(userId, sessionTotal(all));
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const shotIndex = shots.length;
  const shotNumber = shotIndex + 1;
  const station = SEQUENCE[shotIndex] ?? STATIONS[0];
  const metres = parseMetres(missInput);

  const recordShot = useCallback(async () => {
    if (status !== "active" || metres === null) return;
    const next = [...shots, { shot: shotNumber, station, metres }];
    setShots(next);
    setMissInput("");
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, metres, shots, shotNumber, station, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    setMissInput(String(shots[shots.length - 1]!.metres));
    setShots((s) => s.slice(0, -1));
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={standardChippingCombineConfig.testName}
          kicker="Chipping combine"
          art={<ChipShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${total} shots`, `${STATIONS.join(", ")} m`, "~15 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: `Mark spots ${STATIONS.join(", ")} m from one hole`, hint: "Pace them out or use tees" },
            { icon: <Target className="h-5 w-5" aria-hidden />, title: `Hit ${PER_STATION} chips from each spot`, hint: `Start at ${STATIONS[0]} m, then move back` },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Measure every miss in metres", hint: "Ball to hole, e.g. 1.2" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Holed: {MAX_SHOT_POINTS} pts</li>
            <li>Within 1 m: 10 down to 8 pts</li>
            <li>1 to 2.5 m: 8 down to about 5 pts</li>
            <li>2.5 to 4.5 m: 5 down to 1 pt</li>
            <li>Past 4.5 m: 0</li>
            <li className="font-semibold text-gray-900">
              Up to {MAX_SHOT_POINTS} per shot, {STANDARD_CHIPPING_MAX_TOTAL_POINTS} in total. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing
            pct={summary.total / STANDARD_CHIPPING_MAX_TOTAL_POINTS}
            value={formatPts(summary.total)}
            caption={`of ${STANDARD_CHIPPING_MAX_TOTAL_POINTS} points`}
          />
          <p className="mt-2 text-xs text-white/70">Chipping score · higher is better</p>
          <span className="mt-3 inline-block rounded-xl bg-white">
            <CombinePerformanceGradeBadge gradeId={summary.grade.id} label={summary.grade.label} />
          </span>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg per shot", value: summary.avgPerShot.toFixed(1) },
            { label: "Avg miss", value: `${summary.avgMiss.toFixed(1)} m` },
            { label: "Inside 1 m", value: `${summary.insideOne}/${total}` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard
          title="Where your points went"
          aside={`${formatPts(summary.total)} of ${STANDARD_CHIPPING_MAX_TOTAL_POINTS}`}
        >
          <BreakdownBar
            segments={[
              { label: "Scored", value: summary.total, tone: "bg-[#014421]" },
              ...summary.stations.map((s, i) => ({
                label: `Lost at ${s.station} m`,
                value: s.lost,
                tone: ["bg-lime-400", "bg-[#FFA500]", "bg-red-400"][i] ?? "bg-gray-400",
              })),
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="By distance" aside="Avg miss">
          <div className="space-y-3">
            {summary.stations.map((s) => (
              <ValueRow
                key={s.station}
                label={`${s.station} m · ${formatPts(s.pts)} pts`}
                value={s.avgM}
                max={ZERO_BEYOND_M}
                display={`${s.avgM.toFixed(1)} m`}
                lowerIsBetter
                flag={s.station === summary.leak ? "Biggest leak" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="How close you finished" aside="Shots">
          <BreakdownBar segments={summary.zones} />
          <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500">Inside 1 m from each spot</p>
            {summary.stations.map((s) => (
              <RateRow key={s.station} label={`From ${s.station} m`} made={s.insideOne} total={s.n} />
            ))}
          </div>
        </BreakdownCard>

        <EveryShotList>
          {shots.map((s) => {
            const p = shotPoints(s.metres);
            return (
              <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-12 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">
                  {s.station} m
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-600">
                  Shot {s.shot} · {s.metres === 0 ? "Holed" : `${formatMetres(s.metres)} away`}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(p)}`}>
                  {formatPts(p)}
                </span>
              </li>
            );
          })}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const runningTotal = sessionTotal(shots);
  const track: TrackItem[] = SEQUENCE.map((_, i) => (shots[i] ? trackItem(shots[i]!) : null));
  const liveScore = metres !== null ? shotPoints(metres) : null;
  const ballAtStation = (shotIndex % PER_STATION) + 1;
  const nextStation = SEQUENCE[shotIndex + 1];
  const hint =
    ballAtStation < PER_STATION
      ? `Ball ${ballAtStation} of ${PER_STATION} from here`
      : nextStation
        ? `Last ball here, then move to ${nextStation} m`
        : "Last shot of the test";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {formatPts(runningTotal)} pts
        </span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <ChipShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {station}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{hint}</p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How far from the hole?</p>
        <NumberChips
          values={MISS_CHIPS_M}
          value={missInput}
          onChange={(v) => setMissInput(normalizeMetresInput(v))}
          unit="m"
          formatChip={(v) => (v === 0 ? "Holed" : null)}
          ariaLabel="Distance from the hole in metres"
        />
      </div>

      <PrimaryButton onClick={() => void recordShot()} disabled={metres === null}>
        {shotNumber >= total ? "Finish the test" : "Next shot"}
        {liveScore != null && (
          <span className="block text-xs font-semibold text-white/70">This shot scores {formatPts(liveScore)}</span>
        )}
      </PrimaryButton>
    </div>
  );
}
