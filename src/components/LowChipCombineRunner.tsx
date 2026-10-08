"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CircleDot, Flag, Ruler } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";
import {
  LOW_CHIP_MAX_TOTAL_POINTS,
  lowChipPointsFromMetres,
  roundLowChipPointsOneDecimal,
} from "@/lib/lowChipCombineScoring";
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
import { Segmented } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS, ChipShotDiagram, HERO_ART_CLASS } from "@/components/combine/CombineArt";
import { FINISH_LABEL, FinishMap, FinishPicker, type Finish } from "@/components/combine/FinishCross";

type Station = (typeof lowChipCombineConfig.distancesMetres)[number];
type Strike = "clean" | "fat" | "thin";

type ChipShot = { station: Station; finish: Finish; metres: number; strike: Strike; points: number };

const STATIONS = lowChipCombineConfig.distancesMetres;
const PER_STATION = lowChipCombineConfig.shotsPerDistance;
const SEQUENCE: Station[] = STATIONS.flatMap((d) => Array.from({ length: PER_STATION }, () => d));
const TOTAL_SHOTS = SEQUENCE.length;
const STATION_MAX = PER_STATION * 10;
const MISS_CHIPS_M = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4] as const;

const STRIKES: { key: Strike; label: string; hint: string }[] = [
  { key: "fat", label: "Fat", hint: "Ground first" },
  { key: "clean", label: "Clean", hint: "Ball first" },
  { key: "thin", label: "Thin", hint: "Bladed it" },
];
const STRIKE_LABEL: Record<Strike, string> = { clean: "Clean", fat: "Fat", thin: "Thin" };
const STRIKE_TIP: Record<"fat" | "thin", string> = {
  fat: "Ball back in your stance, weight on your lead side and hands ahead so the club meets the ball first.",
  thin: "Keep your chest over the ball and let the club brush the grass just after the ball.",
};
const LENGTH_TIP: Record<"short" | "long", string> = {
  short: "Pick a landing spot a pace further on and trust the roll to take it to the hole.",
  long: "Land it a step shorter, or use a little more loft so it checks up sooner.",
};
const LINE_TIP = "Pick a spot on your line a club length in front of the ball and aim the face at it.";
const STATION_TIP: Record<Station, string> = {
  5: "Short chips want a quiet setup: narrow stance, weight forward, and rock the shoulders.",
  10: "Land it about a third of the way there and let it run the rest like a putt.",
  20: "Longer chips need a longer swing, not a harder hit. Keep the same tempo every time.",
};

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
  return Math.max(0, lowChipPointsFromMetres(metres));
}

function sessionTotal(shots: ChipShot[]): number {
  return roundLowChipPointsOneDecimal(shots.reduce((acc, s) => acc + s.points, 0));
}

function fmtPts(n: number): string {
  const r = roundLowChipPointsOneDecimal(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmtMetres(m: number): string {
  return `${parseFloat(m.toFixed(m < 1 ? 2 : 1))} m`;
}

function pointsTone(points: number): string {
  if (points >= 9) return "bg-[#014421] text-white";
  if (points >= 7) return "bg-green-200 text-[#014421]";
  if (points >= 4) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function shotLine(s: ChipShot): string {
  const where = s.finish === "holed" ? "Holed" : `${fmtMetres(s.metres)} ${FINISH_LABEL[s.finish].toLowerCase()}`;
  return `${where} · ${STRIKE_LABEL[s.strike]}`;
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: ChipShot[]) {
  const n = shots.length;
  const total = sessionTotal(shots);
  const byStation = STATIONS.map((station) => {
    const at = shots.filter((s) => s.station === station);
    const points = at.reduce((a, s) => a + s.points, 0);
    return {
      station,
      points,
      lost: STATION_MAX - points,
      avgPoints: avg(at.map((s) => s.points)),
      avgMiss: avg(at.map((s) => s.metres)),
    };
  });
  const worst = [...byStation].sort((a, b) => b.lost - a.lost)[0]!;
  const best = [...byStation].sort((a, b) => a.lost - b.lost)[0]!;
  const leakStation = worst.lost - best.lost >= 3 ? worst.station : null;

  const finishes: Record<Finish, number> = { holed: 0, short: 0, long: 0, left: 0, right: 0 };
  const strikes: Record<Strike, number> = { clean: 0, fat: 0, thin: 0 };
  for (const s of shots) {
    finishes[s.finish]++;
    strikes[s.strike]++;
  }
  const misses = n - finishes.holed;
  const strikeAvg = (["clean", "fat", "thin"] as const).map((k) => ({
    key: k,
    n: strikes[k],
    avg: avg(shots.filter((s) => s.strike === k).map((s) => s.points)),
  }));

  const mishits = strikes.fat + strikes.thin;
  const cleanAvg = avg(shots.filter((s) => s.strike === "clean").map((s) => s.points));
  const mishitAvg = avg(shots.filter((s) => s.strike !== "clean").map((s) => s.points));
  const topMishit = strikes.fat >= strikes.thin ? "fat" : "thin";
  const strikeLeak = mishits >= 4 && (strikes.clean === 0 || mishitAvg < cleanAvg - 1);

  const bias = <A extends Finish, B extends Finish>(a: A, b: B): A | B | null =>
    finishes[a] >= 3 && finishes[a] > finishes[b] * 1.5 ? a : finishes[b] >= 3 && finishes[b] > finishes[a] * 1.5 ? b : null;
  const lengthBias = bias("short", "long");
  const lineBias = bias("left", "right");

  const avgMiss = avg(shots.map((s) => s.metres));
  let focus: { title: string; lines: string[] };
  if (total >= LOW_CHIP_MAX_TOTAL_POINTS * 0.93) {
    focus = {
      title: "Superb chipping",
      lines: [`You finished ${fmtMetres(avgMiss)} from the hole on average.`, "Make it harder next time: tighter pin, tighter lie."],
    };
  } else {
    if (strikeLeak) {
      focus = {
        title: "Focus next: strike",
        lines: [
          `${mishits} of ${n} chips came out fat or thin, averaging ${fmtPts(mishitAvg)} pts${
            strikes.clean > 0 ? ` against ${fmtPts(cleanAvg)} for clean ones` : ""
          }.`,
          STRIKE_TIP[topMishit],
        ],
      };
    } else if (lengthBias) {
      focus = {
        title: lengthBias === "short" ? "Focus next: getting it to the hole" : "Focus next: taking pace off",
        lines: [`${finishes[lengthBias]} of your ${misses} misses finished ${lengthBias}.`, LENGTH_TIP[lengthBias]],
      };
    } else {
      focus = {
        title: `Focus next: the ${worst.station} m chips`,
        lines: [
          `You finished ${fmtMetres(worst.avgMiss)} away on average there and dropped ${fmtPts(worst.lost)} of ${STATION_MAX} pts.`,
          STATION_TIP[worst.station],
        ],
      };
    }
    if (leakStation && !focus.title.includes(`${leakStation} m`)) {
      focus.lines.push(`Your ${leakStation} m chips cost the most points (${fmtPts(worst.lost)} dropped).`);
    } else if (lineBias && focus.lines.length < 3) {
      focus.lines.push(`${finishes[lineBias]} misses went ${lineBias}. ${LINE_TIP}`);
    }
  }

  return {
    total,
    avgPerShot: n ? total / n : 0,
    avgMiss,
    inside1m: shots.filter((s) => s.metres <= 1).length,
    byStation,
    leakStation,
    finishes,
    misses,
    lengthBias,
    lineBias,
    strikes,
    strikeAvg,
    focus,
  };
}

async function persistLowChipSession(userId: string, totalScore: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const sessionScore: number =
      typeof totalScore === "number" && Number.isFinite(totalScore) ? totalScore : 0;

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: lowChipCombineConfig.practiceLogType,
      sub_type: lowChipCombineConfig.practiceLogSubType,
      score: sessionScore,
      total_points: sessionScore,
    });

    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[LowChipCombine] practice_logs insert:", msg);
      return msg;
    }

    await awardCombineCompletionXp(userId);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[LowChipCombine] practice_logs insert failed", msg);
    return msg;
  }
}

export function LowChipCombineRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<ChipShot[]>([]);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [distance, setDistance] = useState("");
  const [strike, setStrike] = useState<Strike>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const resetShot = () => {
    setFinish(null);
    setDistance("");
    setStrike("clean");
  };

  const startTest = useCallback(() => {
    setStatus("active");
    setShots([]);
    resetShot();
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: ChipShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistLowChipSession(userId, sessionTotal(all));
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active" || finish === null) return;
    const metres = finish === "holed" ? 0 : parseMetres(distance);
    const station = SEQUENCE[shots.length];
    if (metres === null || station === undefined) return;
    const next = [...shots, { station, finish, metres, strike, points: shotPoints(metres) }];
    setShots(next);
    resetShot();
    if (next.length >= TOTAL_SHOTS) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, finish, distance, strike, shots, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setFinish(last.finish);
    setDistance(last.finish === "holed" ? "" : String(last.metres));
    setStrike(last.strike);
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={lowChipCombineConfig.testName}
          kicker="Chipping combine"
          art={<ChipShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${TOTAL_SHOTS} shots`, "5 to 20 m", "~15 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Set up 5, 10 and 20 m from a hole", hint: `${PER_STATION} balls from each spot, closest first` },
            { icon: <CircleDot className="h-5 w-5" aria-hidden />, title: "Hit low, running chips", hint: "Land it early and let it roll out like a putt" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Log where each one finished", hint: "Tap the side it missed, how far in metres, and the strike" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Holed: 10 pts</li>
            <li>Within 0.8 m: 8.5 to 10 pts</li>
            <li>0.8 to 2 m: 6 to 8.5 pts</li>
            <li>2 to 4 m: 1 to 6 pts</li>
            <li>Further than 4 m: 0 pts</li>
            <li>The closer it finishes, the more it scores. Side and strike don&apos;t change your score, they power your breakdown.</li>
            <li className="font-semibold text-gray-900">
              Best possible is {LOW_CHIP_MAX_TOTAL_POINTS} points. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const grade = performanceGradeFromOutOf150(summary.total);
    const holed = summary.finishes.holed;
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing
            pct={summary.total / LOW_CHIP_MAX_TOTAL_POINTS}
            value={fmtPts(summary.total)}
            caption={`of ${LOW_CHIP_MAX_TOTAL_POINTS} points`}
          />
          <div className="mt-3 inline-flex max-w-full rounded-xl bg-white">
            <CombinePerformanceGradeBadge gradeId={grade.id} label={grade.label} />
          </div>
          <p className="mt-2 text-xs text-white/70">
            {holed} holed · higher is better
          </p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg per shot", value: fmtPts(summary.avgPerShot) },
            { label: "Avg miss", value: fmtMetres(summary.avgMiss) },
            { label: "Inside 1 m", value: `${summary.inside1m}/${TOTAL_SHOTS}` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your points went" aside={`${fmtPts(summary.total)} of ${LOW_CHIP_MAX_TOTAL_POINTS}`}>
          <BreakdownBar
            segments={[
              { label: "Scored", value: summary.total, tone: "bg-[#014421]" },
              ...summary.byStation.map((s, i) => ({
                label: `Lost at ${s.station} m`,
                value: roundLowChipPointsOneDecimal(s.lost),
                tone: ["bg-[#FFA500]", "bg-amber-300", "bg-red-400"][i] ?? "bg-gray-400",
              })),
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="By distance" aside="Avg points per chip">
          <div className="space-y-3">
            {summary.byStation.map((s) => (
              <ValueRow
                key={s.station}
                label={`${s.station} m`}
                value={s.avgPoints}
                max={10}
                display={`${fmtPts(s.avgPoints)} pts · ${fmtMetres(s.avgMiss)} away`}
                flag={s.station === summary.leakStation ? "Biggest leak" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Where they finished" aside={`${summary.misses} misses`}>
          <FinishMap counts={summary.finishes} flagged={[summary.lengthBias, summary.lineBias]} />
          <p className="mt-2 text-xs text-gray-600">
            {summary.lengthBias
              ? `Mostly ${summary.lengthBias}: ${summary.finishes[summary.lengthBias]} of ${summary.misses} misses.`
              : summary.lineBias
                ? `Mostly ${summary.lineBias}: ${summary.finishes[summary.lineBias]} of ${summary.misses} misses.`
                : summary.misses > 0
                  ? "Your misses were nicely spread around the hole."
                  : "Every chip holed. Unreal."}
          </p>
        </BreakdownCard>

        <BreakdownCard title="Strike">
          <BreakdownBar
            segments={[
              { label: "Clean", value: summary.strikes.clean, tone: "bg-[#014421]" },
              { label: "Fat", value: summary.strikes.fat, tone: "bg-amber-500" },
              { label: "Thin", value: summary.strikes.thin, tone: "bg-sky-400" },
            ]}
          />
          <p className="mt-2 text-xs text-gray-600">
            Avg points:{" "}
            {summary.strikeAvg
              .filter((s) => s.n > 0)
              .map((s) => `${STRIKE_LABEL[s.key]} ${fmtPts(s.avg)}`)
              .join(" · ")}
          </p>
        </BreakdownCard>

        <EveryShotList>
          {shots.map((s, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-11 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.station} m</span>
              <span className="min-w-0 flex-1 truncate text-gray-600">{shotLine(s)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>
                {fmtPts(s.points)}
              </span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const index = shots.length;
  const station = SEQUENCE[index] ?? SEQUENCE[TOTAL_SHOTS - 1]!;
  const shotNumber = index + 1;
  const ofStation = (index % PER_STATION) + 1;
  const nextStation = SEQUENCE[index + 1];
  const metres = finish === "holed" ? 0 : parseMetres(distance);
  const liveScore = finish !== null && metres !== null ? shotPoints(metres) : null;
  const track: TrackItem[] = SEQUENCE.map((d, i) => {
    const s = shots[i];
    return s ? { label: fmtPts(s.points), tone: pointsTone(s.points), ariaLabel: `Shot ${i + 1} (${d} m): ${fmtPts(s.points)} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{fmtPts(sessionTotal(shots))} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={index} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <ChipShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {TOTAL_SHOTS}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {station}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">
            {ofStation === PER_STATION && nextStation ? `Last ball from here, then ${nextStation} m` : `Ball ${ofStation} of ${PER_STATION} from here`}
          </p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <FinishPicker value={finish} onChange={setFinish} caption="You're chipping up the page" />
      </div>

      {finish !== null && finish !== "holed" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How far from the hole?</p>
          <NumberChips
            values={MISS_CHIPS_M}
            value={distance}
            onChange={(v) => setDistance(normalizeMetresInput(v))}
            unit="m"
            ariaLabel="Distance from the hole in metres"
          />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How was the strike?</p>
        <Segmented options={STRIKES} value={strike} onChange={setStrike} />
      </div>

      <PrimaryButton onClick={() => void recordShot()} disabled={liveScore === null}>
        {shotNumber >= TOTAL_SHOTS ? "Finish the test" : "Next shot"}
        <span className="block text-xs font-semibold text-white/70">
          {liveScore === null
            ? finish === null
              ? "Tap where it finished"
              : "Pick how far it finished"
            : `This shot scores ${fmtPts(liveScore)}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
