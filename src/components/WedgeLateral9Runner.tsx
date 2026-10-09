"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Crosshair, Flag, ListChecks } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  buildWedgeLateral9Aggregates,
  wedgeLateral9ShotPoints,
  type WedgeLateral9ShotLog,
} from "@/lib/wedgeLateral9Analytics";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { fingerBandPoints, qualityBonusPoints } from "@/lib/ironPrecisionScoring";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { asRecord, oneOf, parseNotes } from "@/lib/combineReportData";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";
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
  StatTiles,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { IronHeroArt, IronShotDiagram, MissSidePicker, Segmented } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS } from "@/components/combine/CombineArt";

const DISPERSION_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
const MAX_SHOT_POINTS = 12;

function randomTargetsM(count: number, min: number, max: number): number[] {
  const span = max - min + 1;
  return Array.from({ length: count }, () => min + Math.floor(Math.random() * span));
}

/** @returns null on success, or a user-visible error string */
async function persistSession(userId: string, targetsM: number[], shots: WedgeLateral9ShotLog[]): Promise<string | null> {
  try {
    const shotsNormalized = shots.map((s) => {
      const strike = normalizeLegacyVerticalStrike(s.strike);
      return {
        ...s,
        strike,
        points: wedgeLateral9ShotPoints(s.dispersion, strike, s.contact),
      };
    });
    const aggregates = buildWedgeLateral9Aggregates(shotsNormalized);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const payload = {
      version: 1,
      targets_m: targetsM,
      shots: shotsNormalized,
      aggregates,
    };
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: wedgeLateral9Config.testType,
      test_type: wedgeLateral9Config.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: wedgeLateral9Config.noteKind,
        total_points: aggregates.total_points,
        solid_middle_bonus_pct: aggregates.solid_middle_bonus_pct,
        solid_middle_bonus_count: aggregates.solid_middle_bonus_count,
        wedge_bias_summary: aggregates.wedge_bias_summary,
        payload,
      }),
    });
    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[WedgeLateral9] practice insert:", msg);
      return msg;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[WedgeLateral9] practice insert failed", msg);
    return msg;
  }
}

/** Saved shots from a practice row's notes, or null when they weren't stored. */
export function parseWedgeLateral9Shots(notes: unknown): WedgeLateral9ShotLog[] | null {
  const n = parseNotes(notes);
  const list = asRecord(n?.payload)?.shots;
  if (!Array.isArray(list) || list.length === 0) return null;
  const shots: WedgeLateral9ShotLog[] = [];
  for (const raw of list) {
    const o = asRecord(raw);
    const target = Number(o?.target_m);
    const dispersion = Number(o?.dispersion);
    const contact = oneOf(o?.contact, ["heel", "middle", "toe"] as const);
    if (!o || !Number.isFinite(target) || !Number.isFinite(dispersion) || !contact) return null;
    const direction = oneOf(o.direction, ["left", "straight", "right"] as const) ?? "straight";
    const strike = normalizeLegacyVerticalStrike(o.strike);
    const eff = direction === "straight" ? 0 : dispersion;
    shots.push({
      shot: shots.length + 1,
      target_m: target,
      direction,
      dispersion: eff,
      strike,
      contact,
      points: wedgeLateral9ShotPoints(eff, strike, contact),
    });
  }
  return shots;
}

function shotScore(s: WedgeLateral9ShotLog): number {
  return wedgeLateral9ShotPoints(s.dispersion, s.strike, s.contact);
}

function pointsTone(points: number): string {
  if (points >= 12) return "bg-[#014421] text-white";
  if (points >= 9) return "bg-green-200 text-[#014421]";
  if (points >= 4) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function missLabel(s: Pick<WedgeLateral9ShotLog, "direction" | "dispersion">): string {
  if (s.direction === "straight") return "On line";
  return `${s.direction === "left" ? "Left" : "Right"} ${s.dispersion}`;
}

const STRIKE_LABEL: Record<IronStrike, string> = { fat: "Fat", solid: "Solid", thin: "Thin" };
const CONTACT_LABEL: Record<IronContact, string> = { heel: "Heel", middle: "Middle", toe: "Toe" };

const BANDS = [
  { label: "Under 50 m", test: (m: number) => m < 50 },
  { label: "50 to 75 m", test: (m: number) => m >= 50 && m < 75 },
  { label: "75 m and up", test: (m: number) => m >= 75 },
] as const;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: WedgeLateral9ShotLog[]) {
  const n = shots.length;
  const agg = buildWedgeLateral9Aggregates(shots);
  const strikes = { solid: 0, fat: 0, thin: 0 };
  const contacts = { middle: 0, heel: 0, toe: 0 };
  let left = 0;
  let right = 0;
  let accuracyPts = 0;
  let bonusPts = 0;
  for (const s of shots) {
    strikes[normalizeLegacyVerticalStrike(s.strike)]++;
    contacts[s.contact]++;
    if (s.direction === "left") left++;
    if (s.direction === "right") right++;
    accuracyPts += fingerBandPoints(s.dispersion);
    bonusPts += qualityBonusPoints(s.strike, s.contact);
  }
  const accuracyLost = n * 10 - accuracyPts;
  const strikeLost = n * 2 - bonusPts;

  const bands = BANDS.map((b) => {
    const inBand = shots.filter((s) => b.test(s.target_m));
    const pts = inBand.reduce((sum, s) => sum + shotScore(s), 0);
    return { label: b.label, n: inBand.length, avg: inBand.length ? pts / inBand.length : 0 };
  }).filter((b) => b.n > 0);
  const rankedBands = [...bands].sort((a, b) => a.avg - b.avg);
  const worstBand =
    rankedBands.length > 1 && rankedBands[0]!.avg < rankedBands[rankedBands.length - 1]!.avg ? rankedBands[0]!.label : null;

  const side = left > right * 1.5 && left >= 2 ? "left" : right > left * 1.5 && right >= 2 ? "right" : null;
  const lineTip = side
    ? `${side === "left" ? left : right} of your ${left + right} misses went ${side}, so check your aim and the face at impact.`
    : "Misses went both ways, so work on a steady clubface rather than your aim.";
  const topStrike = [
    { n: strikes.fat, text: "fat (ground first)", tip: "Keep your weight on your lead side and the low point in front of the ball." },
    { n: strikes.thin, text: "thin", tip: "Stay down through the strike and let the loft lift the ball." },
    { n: contacts.heel, text: "off the heel", tip: "Stand a touch further from the ball and keep your hands in close." },
    { n: contacts.toe, text: "off the toe", tip: "Stand a touch closer and feel the ball on the middle of the face." },
  ].sort((a, b) => b.n - a.n)[0]!;

  let focus: { title: string; lines: string[] };
  if (accuracyLost === 0 && strikeLost === 0) {
    focus = { title: "Perfect round", lines: ["Every wedge on line and out of the middle. Pick smaller targets next time."] };
  } else if (accuracyLost >= strikeLost) {
    focus = { title: "Focus next: start line", lines: [`Misses off line cost you ${accuracyLost} pts.`, lineTip] };
  } else {
    focus = {
      title: "Focus next: strike",
      lines: [
        `Missing the solid-and-middle bonus cost you ${strikeLost} pts.`,
        topStrike.n > 0 ? `Your most common miss was ${plural(topStrike.n, "shot")} ${topStrike.text}. ${topStrike.tip}` : "Keep finding the middle of the face.",
      ],
    };
  }
  if (worstBand) {
    const b = bands.find((x) => x.label === worstBand)!;
    focus.lines.push(`${worstBand} was your weakest range at ${b.avg.toFixed(1)} pts a shot.`);
  }

  return {
    total: agg.total_points,
    avg: agg.avg_points_per_shot,
    solidMiddle: agg.solid_middle_bonus_count,
    biasSummary: agg.wedge_bias_summary,
    within1: shots.filter((s) => s.dispersion <= 1).length,
    strikes,
    contacts,
    left,
    right,
    straight: n - left - right,
    accuracyLost,
    strikeLost,
    bands,
    worstBand,
    focus,
  };
}

const MAP_RANGE = 5;
const DOT_ROW_PX = 26;
/** In fingers; dots closer than this go on the next row up. */
const MIN_DOT_GAP = 1.6;

function signedMiss(s: WedgeLateral9ShotLog): number {
  if (s.direction === "straight") return 0;
  return s.direction === "left" ? -s.dispersion : s.dispersion;
}

const pctOf = (x: number) => 50 + (x / MAP_RANGE) * 50;

/** Left-to-right picture of where each wedge finished, labelled by target distance, with the scoring bands behind it. */
function MissMap({ shots }: { shots: WedgeLateral9ShotLog[] }) {
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
  const bands: { w: number; tone: string }[] = [
    { w: MAP_RANGE, tone: "bg-red-50" },
    { w: 4, tone: "bg-amber-50" },
    { w: 2.5, tone: "bg-amber-100" },
    { w: 1.5, tone: "bg-green-100" },
    { w: 0.5, tone: "bg-green-200" },
  ];
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl" style={{ height: rows * DOT_ROW_PX + 16 }}>
        {bands.map((b) => (
          <div key={b.w} className={`absolute inset-y-0 ${b.tone}`} style={{ left: `${pctOf(-b.w)}%`, width: `${(b.w / MAP_RANGE) * 100}%` }} />
        ))}
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#014421]/40" />
        {dots.map(({ s, x, row }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${pointsTone(shotScore(s))}`}
            style={{ left: `${pctOf(x)}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`${s.target_m} m: ${missLabel(s)}, ${shotScore(s)} pts`}
          >
            {s.target_m}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0">Left</span>
        {[-4, -2, 2, 4].map((f) => (
          <span key={f} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pctOf(f)}%` }}>
            {Math.abs(f)}
          </span>
        ))}
        <span className="absolute left-1/2 -translate-x-1/2 text-[#014421]">Target</span>
        <span className="absolute right-0">Right</span>
      </div>
    </div>
  );
}

/** The results screen. Coaches see the same report for a saved session. */
export function WedgeLateral9Report({ shots }: { shots: WedgeLateral9ShotLog[] }) {
  const total = shots.length;
  const summary = breakdown(shots);
  const max = total * MAX_SHOT_POINTS;
  return (
    <>
      <ResultHero>
        <ScoreRing pct={summary.total / max} value={summary.total} caption={`of ${max} points`} />
        <p className="mt-2 text-xs text-white/70">Wedge lateral score · higher is better</p>
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Avg per shot", value: summary.avg.toFixed(1) },
          { label: "Within 1 finger", value: `${summary.within1}/${total}` },
          { label: "Solid + middle", value: `${summary.solidMiddle}/${total}` },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Where your points went" aside={`${summary.total} of ${max}`}>
        <BreakdownBar
          segments={[
            { label: "Scored", value: summary.total, tone: "bg-[#014421]" },
            { label: "Lost to misses", value: summary.accuracyLost, tone: "bg-[#FFA500]" },
            { label: "Lost to strike", value: summary.strikeLost, tone: "bg-red-400" },
          ]}
        />
      </BreakdownCard>

      <BreakdownCard title="Miss pattern" aside={`L ${summary.left} · On line ${summary.straight} · R ${summary.right}`}>
        <MissMap shots={shots} />
        <p className="mt-2 text-xs text-gray-600">{summary.biasSummary}</p>
      </BreakdownCard>

      <BreakdownCard title="By distance" aside="Avg points">
        <div className="space-y-3">
          {summary.bands.map((b) => (
            <ValueRow
              key={b.label}
              label={`${b.label} (${plural(b.n, "shot")})`}
              value={b.avg}
              max={MAX_SHOT_POINTS}
              display={b.avg.toFixed(1)}
              flag={b.label === summary.worstBand ? "Work on" : null}
            />
          ))}
        </div>
      </BreakdownCard>

      <BreakdownCard title="Contact">
        <div className="space-y-3">
          <BreakdownBar
            label="Strike"
            segments={[
              { label: "Solid", value: summary.strikes.solid, tone: "bg-[#014421]" },
              { label: "Fat", value: summary.strikes.fat, tone: "bg-amber-500" },
              { label: "Thin", value: summary.strikes.thin, tone: "bg-sky-400" },
            ]}
          />
          <BreakdownBar
            label="Where on the face"
            segments={[
              { label: "Middle", value: summary.contacts.middle, tone: "bg-[#014421]" },
              { label: "Heel", value: summary.contacts.heel, tone: "bg-violet-400" },
              { label: "Toe", value: summary.contacts.toe, tone: "bg-sky-400" },
            ]}
          />
        </div>
      </BreakdownCard>

      <EveryShotList>
        {shots.map((s) => (
          <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-12 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold tabular-nums text-gray-800">
              {s.target_m} m
            </span>
            <span className="min-w-0 flex-1 truncate text-gray-600">
              {missLabel(s)} · {STRIKE_LABEL[normalizeLegacyVerticalStrike(s.strike)]} · {CONTACT_LABEL[s.contact]}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(shotScore(s))}`}>
              {shotScore(s)}
            </span>
          </li>
        ))}
      </EveryShotList>
    </>
  );
}

export function WedgeLateral9Runner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [targetsM, setTargetsM] = useState<number[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [direction, setDirection] = useState<IronMissDirection>("straight");
  const [dispersion, setDispersion] = useState<number | null>(0);
  const [strike, setStrike] = useState<IronStrike>("solid");
  const [contact, setContact] = useState<IronContact>("middle");
  const [completedShots, setCompletedShots] = useState<WedgeLateral9ShotLog[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = wedgeLateral9Config.shotCount;
  const shotNumber = shotIndex + 1;
  const targetM = targetsM[shotIndex] ?? 0;

  const resetShot = () => {
    setDirection("straight");
    setDispersion(0);
    setStrike("solid");
    setContact("middle");
  };

  const startTest = useCallback(() => {
    setTargetsM(randomTargetsM(total, wedgeLateral9Config.distanceMinM, wedgeLateral9Config.distanceMaxM));
    setShotIndex(0);
    resetShot();
    setCompletedShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
    setStatus("active");
  }, [total]);

  const save = useCallback(
    async (shots: WedgeLateral9ShotLog[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      if (persistAttemptedRef.current) return;
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, targetsM, shots);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId, targetsM],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    if (direction !== "straight" && dispersion === null) return;
    const effDispersion = direction === "straight" ? 0 : (dispersion as number);
    const record: WedgeLateral9ShotLog = {
      shot: shotNumber,
      target_m: targetM,
      direction,
      dispersion: effDispersion,
      strike,
      contact,
      points: wedgeLateral9ShotPoints(effDispersion, strike, contact),
    };
    const nextLog = [...completedShots, record];
    setCompletedShots(nextLog);
    resetShot();

    if (shotNumber >= total) {
      setStatus("complete");
      await save(nextLog);
    } else {
      setShotIndex((i) => i + 1);
    }
  }, [status, direction, dispersion, strike, contact, shotNumber, targetM, completedShots, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || completedShots.length === 0) return;
    const last = completedShots[completedShots.length - 1]!;
    setCompletedShots((s) => s.slice(0, -1));
    setShotIndex((i) => Math.max(0, i - 1));
    setDirection(last.direction);
    setDispersion(last.direction === "straight" ? 0 : last.dispersion);
    setStrike(last.strike);
    setContact(last.contact);
  }, [status, completedShots]);

  const summary = useMemo(
    () => (status === "complete" && completedShots.length >= total ? breakdown(completedShots) : null),
    [status, completedShots, total],
  );

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={wedgeLateral9Config.testName}
          kicker="Wedge combine"
          art={<IronHeroArt />}
          chips={[
            `${total} shots`,
            `${wedgeLateral9Config.distanceMinM} to ${wedgeLateral9Config.distanceMaxM} m`,
            "~15 min",
            "Highest score wins",
          ]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Hit to the distance shown", hint: "A new random target for every shot" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the miss in fingers", hint: "Hold your hand at arm's length, then count from the target" },
            { icon: <ListChecks className="h-5 w-5" aria-hidden />, title: "Log the strike and contact", hint: "Fat, solid or thin, then heel, middle or toe" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>On line or 0 to 0.5 fingers: 10 pts</li>
            <li>1 to 1.5 fingers: 7 pts · 2 to 2.5 fingers: 4 pts · 3 to 4 fingers: 1 pt</li>
            <li>Solid strike from the middle of the face: +2 bonus</li>
            <li className="font-semibold text-gray-900">
              Best possible is {total * MAX_SHOT_POINTS} points. Higher is better.
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
        <WedgeLateral9Report shots={completedShots} />

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(completedShots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const canRecord = direction === "straight" || dispersion !== null;
  const liveScore = canRecord ? wedgeLateral9ShotPoints(direction === "straight" ? 0 : (dispersion as number), strike, contact) : null;
  const runningTotal = completedShots.reduce((sum, s) => sum + shotScore(s), 0);
  const nextTarget = targetsM[shotIndex + 1];
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = completedShots[i];
    if (!s) return null;
    const p = shotScore(s);
    return { label: String(p), tone: pointsTone(p), ariaLabel: `Shot ${i + 1} (${s.target_m} m): ${p} points` };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {targetM}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{nextTarget ? `Next: ${nextTarget} m` : "Last shot"}</p>
        </div>
      </div>

      {completedShots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <MissSidePicker
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setDispersion(d === "straight" ? 0 : null);
          }}
        />
      </div>

      {direction !== "straight" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How many fingers off the target?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {DISPERSION_STEPS.map((d) => {
              const active = dispersion === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDispersion(d)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How was the strike?</p>
        <Segmented
          options={[
            { key: "fat", label: "Fat", hint: "Ground first" },
            { key: "solid", label: "Solid", hint: "Ball first" },
            { key: "thin", label: "Thin", hint: "Low on the face" },
          ]}
          value={normalizeLegacyVerticalStrike(strike)}
          onChange={setStrike}
        />
      </div>

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where on the face?</p>
        <Segmented
          options={[
            { key: "heel", label: "Heel" },
            { key: "middle", label: "Middle" },
            { key: "toe", label: "Toe" },
          ]}
          value={contact}
          onChange={setContact}
        />
      </div>

      <PrimaryButton onClick={() => void recordShot()} disabled={!canRecord}>
        {shotNumber >= total ? "Finish the test" : "Next shot"}
        {liveScore != null && <span className="block text-xs font-semibold text-white/70">This shot scores {liveScore}</span>}
      </PrimaryButton>
    </div>
  );
}
