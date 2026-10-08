"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Ban, Flag, Footprints, Ruler } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
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
import { BunkerShotDiagram, CARD_ART_CLASS, HERO_ART_CLASS } from "@/components/combine/CombineArt";

const STATIONS = bunkerProximityProtocolConfig.stationDistancesM;
const PER_STATION = bunkerProximityProtocolConfig.shotsPerStation;
const MAX_SCORE = bunkerProximityProtocolConfig.maxScore;
const PENALTY = -10;
const MAX_SHOT = 10;
const FINISH_CHIPS_M = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6] as const;

const SEQUENCE = STATIONS.flatMap((station) =>
  Array.from({ length: PER_STATION }, (_, i) => ({ station: station as number, inStation: i + 1 })),
);

type ShotLog = {
  shot: number;
  station_m: number;
  shot_in_station: number;
  distance_m: number | null;
  penalty: boolean;
  points: number;
};

type SessionSavePayload = {
  version: 1;
  station_distances_m: number[];
  shots_per_station: number;
  shots: ShotLog[];
};

type ShotForm = { distance: string; penalty: boolean };

const EMPTY_FORM: ShotForm = { distance: "", penalty: false };

function parseDistanceMetres(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function pointsForDistance(distanceM: number): number {
  return Math.max(0, 10 - distanceM * 1.5);
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function rawPoints(s: Pick<ShotLog, "penalty" | "distance_m">): number {
  return s.penalty ? PENALTY : pointsForDistance(s.distance_m ?? 0);
}

/** Each station rounds to 0.1, then the session rounds the sum of stations, matching the saved score. */
function stationTotal(shots: ShotLog[], station: number): number {
  return roundOneDecimal(shots.filter((s) => s.station_m === station).reduce((sum, s) => sum + rawPoints(s), 0));
}

function sessionTotal(shots: ShotLog[]): number {
  return roundOneDecimal(STATIONS.reduce((sum, st) => sum + stationTotal(shots, st), 0));
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtM(m: number): string {
  return `${m.toFixed(1)} m`;
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

function shotTone(s: ShotLog): string {
  if (s.penalty) return "bg-red-500 text-white";
  const d = s.distance_m ?? 0;
  if (d <= 1) return "bg-[#014421] text-white";
  if (d <= 3) return "bg-green-200 text-[#014421]";
  if (s.points > 0) return "bg-amber-200 text-amber-900";
  return "bg-gray-300 text-gray-700";
}

function shotTrackItem(s: ShotLog): NonNullable<TrackItem> {
  return { label: fmt(s.points), tone: shotTone(s), ariaLabel: `Shot ${s.shot} from ${s.station_m} m: ${fmt(s.points)} points` };
}

function stationTip(station: number): string {
  if (station <= 5) return "Short splash: open the face wide and make a longer swing than feels right, so the ball pops up and stops.";
  if (station <= 10) return "Stock shot: keep the same swing length every time and land it a third of the way to the flag.";
  return "Long bunker shot: square the face a little, take less sand and land it further out so it can run.";
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: ShotLog[]) {
  const n = shots.length;
  const total = sessionTotal(shots);
  const played = shots.filter((s) => !s.penalty);
  const penalties = n - played.length;
  const dists = played.map((s) => s.distance_m ?? 0);
  const avgM = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;
  const inside1 = dists.filter((d) => d <= 1).length;
  const inside3 = dists.filter((d) => d <= 3).length;
  const scored = roundOneDecimal(played.reduce((sum, s) => sum + rawPoints(s), 0));
  const lostToDistance = roundOneDecimal(played.length * MAX_SHOT - scored);
  const lostToPenalties = penalties * (MAX_SHOT - PENALTY);

  const zones = {
    holed: dists.filter((d) => d === 0).length,
    inside1: dists.filter((d) => d > 0 && d <= 1).length,
    inside3: dists.filter((d) => d > 1 && d <= 3).length,
    inside6: dists.filter((d) => d > 3 && d <= 6).length,
    further: dists.filter((d) => d > 6).length,
  };

  const stations = STATIONS.map((station) => {
    const at = shots.filter((s) => s.station_m === station);
    const ok = at.filter((s) => !s.penalty).map((s) => s.distance_m ?? 0);
    const stTotal = stationTotal(shots, station);
    return {
      station: station as number,
      total: stTotal,
      lost: at.length * MAX_SHOT - stTotal,
      penalties: at.length - ok.length,
      avgM: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
    };
  });
  const ranked = [...stations].sort((a, b) => b.lost - a.lost);
  const worst = ranked.length > 1 && ranked[0]!.lost > ranked[ranked.length - 1]!.lost ? ranked[0]! : null;
  const best = worst ? ranked[ranked.length - 1]! : null;
  const penaltyStation = [...stations].sort((a, b) => b.penalties - a.penalties)[0]!;

  let focus: { title: string; lines: string[] };
  if (penalties === 0 && inside1 === n) {
    focus = { title: "Every ball inside 1 m", lines: ["Hard to beat. Move further back or use a tougher lie next time."] };
  } else if (penalties >= 2) {
    focus = {
      title: "Focus next: getting out first time",
      lines: [`${penalties} of ${n} shots missed the green or stayed in the sand. Each one cost you 20 pts against a perfect shot.`],
    };
    if (penaltyStation.penalties >= 2) focus.lines.push(`${penaltyStation.penalties} of them came from ${penaltyStation.station} m.`);
    focus.lines.push("Open the face, hit the sand 3 cm behind the ball and keep the club moving to a full finish.");
  } else {
    const target = worst ?? ranked[0]!;
    focus = {
      title: `Focus next: the ${target.station} m shot`,
      lines: [
        target.avgM !== null
          ? `From ${target.station} m you finished ${fmtM(target.avgM)} away on average and scored ${fmt(target.total)} of ${PER_STATION * MAX_SHOT}.`
          : `From ${target.station} m you scored ${fmt(target.total)} of ${PER_STATION * MAX_SHOT}.`,
        stationTip(target.station),
      ],
    };
    if (best && best.avgM !== null) focus.lines.splice(1, 0, `Your best was ${best.station} m at ${fmtM(best.avgM)} on average.`);
    if (penalties === 1) focus.lines.push("You also had one penalty, which cost 20 pts.");
  }

  return {
    total,
    avgM,
    inside1,
    inside3,
    penalties,
    played: played.length,
    lostToDistance,
    lostToPenalties,
    zones,
    stations,
    worstStation: worst?.station ?? null,
    focus,
  };
}

/** Big penalty tile: the ball missed the green or stayed in the bunker. */
function PenaltyCard({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.99] ${
        on ? "border-red-500 bg-red-50" : "border-gray-100 bg-white hover:border-gray-300"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}>
        <Ban className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">Missed the green or stayed in</span>
        <span className="block text-xs text-gray-500">Counts as a penalty</span>
      </span>
      <span
        className={`flex h-8 min-w-[3rem] shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${
          on ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400"
        }`}
      >
        {PENALTY}
      </span>
    </button>
  );
}

/** @returns null on success, or a user-visible error string */
async function persistSession(userId: string, shots: ShotLog[], totalScore: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload: SessionSavePayload = {
      version: 1,
      station_distances_m: [...STATIONS],
      shots_per_station: PER_STATION,
      shots,
    };

    const insertRes = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: bunkerProximityProtocolConfig.practiceLogType,
      score: totalScore,
      total_points: totalScore,
      metadata: payload,
      strike_data: shots,
    });
    if (!insertRes.ok) {
      console.warn("[BunkerProximity] practice_logs insert:", insertRes.message);
      return insertRes.message;
    }

    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[BunkerProximity] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

export function BunkerProximityProtocolRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = SEQUENCE.length;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<ShotLog[]>([]);
  const [form, setForm] = useState<ShotForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const index = shots.length;
  const slot = SEQUENCE[Math.min(index, total - 1)]!;
  const distance = parseDistanceMetres(form.distance);
  const canRecord = form.penalty || distance !== null;
  const liveScore = form.penalty ? PENALTY : distance !== null ? roundOneDecimal(pointsForDistance(distance)) : null;

  const startTest = useCallback(() => {
    setStatus("active");
    setShots([]);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: ShotLog[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, all, sessionTotal(all));
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const recordShot = useCallback(async () => {
    const d = form.penalty ? null : parseDistanceMetres(form.distance);
    if (status !== "active" || (!form.penalty && d === null)) return;
    const record: ShotLog = {
      shot: index + 1,
      station_m: slot.station,
      shot_in_station: slot.inStation,
      distance_m: d,
      penalty: form.penalty,
      points: roundOneDecimal(rawPoints({ penalty: form.penalty, distance_m: d })),
    };
    const next = [...shots, record];
    setShots(next);
    setForm(EMPTY_FORM);
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, form, index, slot, shots, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setForm({ distance: last.distance_m === null ? "" : String(last.distance_m), penalty: last.penalty });
    setShots((s) => s.slice(0, -1));
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" && shots.length >= total ? breakdown(shots) : null), [status, shots, total]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={bunkerProximityProtocolConfig.testName}
          kicker="Bunker combine"
          art={<BunkerShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${total} shots`, `${STATIONS.join(", ")} m`, "~15 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: `Set up ${STATIONS.length} spots in one bunker`, hint: `${STATIONS.join(", ")} m from the flag` },
            { icon: <Footprints className="h-5 w-5" aria-hidden />, title: `Hit ${PER_STATION} balls from each`, hint: "Start closest, then move back" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Measure each finish in metres", hint: "Or tap penalty if it misses the green or stays in" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Each shot scores 10, minus 1.5 for every metre from the hole.</li>
            <li>Holed: 10 · 1 m: 8.5 · 3 m: 5.5 · 6 m: 1 · about 7 m or more: 0</li>
            <li>Missed the green or stayed in the sand: {PENALTY}</li>
            <li className="font-semibold text-gray-900">Best possible is {MAX_SCORE} points. Higher is better.</li>
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
          <ScoreRing pct={summary.total / MAX_SCORE} value={fmt(summary.total)} caption={`of ${MAX_SCORE} points`} />
          <p className="mt-2 text-xs text-white/70">
            {summary.inside1} of {total} inside 1 m · higher is better
          </p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg finish", value: summary.avgM !== null ? fmtM(summary.avgM) : "—" },
            { label: "Inside 1 m", value: `${summary.inside1}/${total}` },
            { label: "Penalties", value: summary.penalties, sub: `${PENALTY} each` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your points went" aside={`${fmt(summary.total)} of ${MAX_SCORE}`}>
          <BreakdownBar
            segments={[
              { label: "Scored", value: Math.max(0, summary.total), tone: "bg-[#014421]" },
              { label: "Lost to distance", value: summary.lostToDistance, tone: "bg-[#FFA500]" },
              { label: "Lost to penalties", value: summary.lostToPenalties, tone: "bg-red-400" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="By distance" aside="Avg finish">
          <div className="space-y-3">
            {summary.stations.map((s) => (
              <ValueRow
                key={s.station}
                label={`From ${s.station} m`}
                value={s.avgM ?? 6}
                max={6}
                lowerIsBetter
                display={`${s.avgM !== null ? fmtM(s.avgM) : "—"} · ${fmt(s.total)} pts`}
                flag={
                  s.station === summary.worstStation
                    ? "Work on"
                    : s.penalties > 0
                      ? plural(s.penalties, "penalty", "penalties")
                      : null
                }
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Where they finished" aside={`${summary.inside3}/${total} inside 3 m`}>
          <BreakdownBar
            segments={[
              { label: "Holed", value: summary.zones.holed, tone: "bg-[#014421]" },
              { label: "Inside 1 m", value: summary.zones.inside1, tone: "bg-green-400" },
              { label: "1 to 3 m", value: summary.zones.inside3, tone: "bg-amber-300" },
              { label: "3 to 6 m", value: summary.zones.inside6, tone: "bg-orange-400" },
              { label: "Over 6 m", value: summary.zones.further, tone: "bg-gray-400" },
              { label: "Penalty", value: summary.penalties, tone: "bg-red-500" },
            ]}
          />
          <div className="mt-3 space-y-3">
            <RateRow label="Out and on the green" made={summary.played} total={total} />
            <RateRow label="Inside 1 m" made={summary.inside1} total={total} />
          </div>
        </BreakdownCard>

        <EveryShotList>
          {shots.map((s) => (
            <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-11 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.station_m} m</span>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                Ball {s.shot_in_station} ·{" "}
                {s.penalty ? "Missed the green or stayed in" : s.distance_m === 0 ? "Holed" : `${fmtM(s.distance_m ?? 0)} from the hole`}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${shotTone(s)}`}>{fmt(s.points)}</span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const nextSlot = SEQUENCE[index + 1];
  const hint =
    slot.inStation === 1 && index > 0
      ? `Move back to ${slot.station} m · ball 1 of ${PER_STATION}`
      : slot.inStation === PER_STATION && nextSlot
        ? `Last ball here, then ${nextSlot.station} m`
        : !nextSlot
          ? "Last ball of the test"
          : `Ball ${slot.inStation} of ${PER_STATION} from here`;
  const track: TrackItem[] = SEQUENCE.map((_, i) => (shots[i] ? shotTrackItem(shots[i]!) : null));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{fmt(sessionTotal(shots))} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={index} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <BunkerShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {index + 1} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {slot.station}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{hint}</p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How far from the hole?</p>
        <NumberChips
          values={FINISH_CHIPS_M}
          value={form.penalty ? "" : form.distance}
          onChange={(v) => setForm({ distance: v, penalty: false })}
          unit="m"
          formatChip={(v) => (v === 0 ? "Holed" : null)}
          ariaLabel="Distance from the hole in metres"
        />
      </div>

      <PenaltyCard on={form.penalty} onChange={(penalty) => setForm({ distance: "", penalty })} />

      <PrimaryButton onClick={() => void recordShot()} disabled={!canRecord}>
        {index + 1 >= total ? "Finish the test" : "Next shot"}
        {liveScore !== null && <span className="block text-xs font-semibold text-white/70">This shot scores {fmt(liveScore)}</span>}
      </PrimaryButton>
    </div>
  );
}
