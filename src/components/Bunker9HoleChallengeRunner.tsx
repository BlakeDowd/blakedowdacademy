"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CircleDot, MapPin, Ruler } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import type { ChipResultLabel } from "@/lib/chippingCombine9Analytics";
import {
  type BunkerHoleLog,
  type BunkerVerticalStrike,
  averageBunkerProximityCm,
  buildBunkerAggregates,
  bunkerPointsFromProximityCm,
  bunkerSessionTotalPoints,
  bunkerZoneFromProximityCm,
  bunkerMissDiagnosisText,
  totalBunkerChipPoints,
  MAX_SESSION_POINTS,
  MAX_BUNKER_SESSION_CHIP,
} from "@/lib/bunker9HoleChallengeAnalytics";
import { PRIMARY_MISS_LABELS, type PrimaryMissReason } from "@/lib/puttingTestMissDiagnostics";
import { type PuttingTestMissCategory, PUTTING_TEST_MISS_CATEGORY_LABELS } from "@/lib/puttingTestMissScoring";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
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
import {
  BreakdownBar,
  BreakdownCard,
  EveryShotList,
  FocusCard,
  RateRow,
  ValueRow,
} from "@/components/combine/CombineBreakdown";
import { BunkerShotDiagram, CARD_ART_CLASS, HERO_ART_CLASS } from "@/components/combine/CombineArt";

const PUTT_BONUS = bunker9HoleChallengeConfig.scramblePuttBonus;
const START_CHIPS_M = [5, 8, 10, 12, 15, 18, 20, 25, 30] as const;
const FINISH_CHIPS_CM = [0, 20, 40, 60, 90, 120, 150, 200, 300] as const;

type MissQuadrant = Exclude<PuttingTestMissCategory, "lipOut">;
type PuttAnswer = "made" | "missed" | "";

type HoleForm = {
  distance: string;
  strike: BunkerVerticalStrike;
  proximity: string;
  putt: PuttAnswer;
  quadrant: MissQuadrant | null;
  reason: PrimaryMissReason | null;
};

const EMPTY_FORM: HoleForm = { distance: "", strike: "solid", proximity: "", putt: "", quadrant: null, reason: null };

const ZONE_LABEL: Record<ChipResultLabel, string> = {
  Holed: "Holed it",
  "Inside Club Length": "Inside a club length",
  "Inside 6ft": "Inside 6 ft",
  "Safety Zone": "Inside 3 m",
  "Missed Zone": "Outside 3 m",
  "Outside Zone": "Outside 3 m",
};

const STRIKE_LABEL: Record<BunkerVerticalStrike, string> = { thin: "Thin", solid: "Solid", fat: "Fat" };

const QUADRANTS: { key: MissQuadrant; title: string; hint: string }[] = [
  { key: "highLong", title: "Past · high side", hint: "Ran by above the hole" },
  { key: "lowLong", title: "Past · low side", hint: "Ran by below the hole" },
  { key: "highShort", title: "Short · high side", hint: "Stopped above the hole" },
  { key: "lowShort", title: "Short · low side", hint: "Stopped below the hole" },
];

const REASON_TIP: Record<PrimaryMissReason, string> = {
  read: "Most misses were the read. Check the putt from the low side before you hit it.",
  speed: "Most misses were speed. Try to roll every putt 30 cm past the hole.",
  startLine: "Most misses started off line. Practise short putts through a gate of two tees.",
};

const DISTANCE_BANDS = [
  { label: "Under 10 m", test: (m: number) => m < 10 },
  { label: "10 to 20 m", test: (m: number) => m >= 10 && m < 20 },
  { label: "20 m and over", test: (m: number) => m >= 20 },
] as const;

function parseProximityCm(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  // Whole cm only: the zone bands are integer ranges, so 90.5 would otherwise fall between them and score 0.
  return Math.round(n);
}

function parseDistanceM(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 400) return null;
  return n;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtCm(cm: number): string {
  return cm < 100 ? `${Math.round(cm)} cm` : `${(cm / 100).toFixed(1)} m`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function holePoints(h: BunkerHoleLog): number {
  return Math.round((h.bunker_chip_points + h.putt_points) * 10) / 10;
}

function holeTone(h: BunkerHoleLog): string {
  if (h.holed) return "bg-[#014421] text-white";
  if (h.putt_made) return "bg-green-200 text-[#014421]";
  if (h.bunker_chip_points > 0) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function holeTrackItem(h: BunkerHoleLog): NonNullable<TrackItem> {
  const p = holePoints(h);
  return { label: String(Math.round(p)), tone: holeTone(h), ariaLabel: `Hole ${h.hole}: ${fmt(p)} points` };
}

/** The finished hole, or null while something required is still missing. */
function buildHole(form: HoleForm, hole: number): BunkerHoleLog | null {
  const distance = parseDistanceM(form.distance);
  const cm = parseProximityCm(form.proximity);
  if (distance === null || cm === null) return null;
  const base = {
    hole,
    distance_m: distance,
    proximity_cm: cm,
    zone: bunkerZoneFromProximityCm(cm),
    bunker_chip_points: bunkerPointsFromProximityCm(cm),
    strike_vertical: form.strike,
  };
  if (cm === 0) return { ...base, holed: true, putt_points: 0 };
  if (form.putt === "made") return { ...base, holed: false, putt_made: true, putt_points: PUTT_BONUS };
  if (form.putt !== "missed" || !form.quadrant || !form.reason) return null;
  return {
    ...base,
    holed: false,
    putt_made: false,
    putt_points: 0,
    first_putt_miss_quadrant: form.quadrant,
    putt_miss_primary_reason: form.reason,
    miss_category: `${PUTTING_TEST_MISS_CATEGORY_LABELS[form.quadrant]} · ${PRIMARY_MISS_LABELS[form.reason]}`,
  };
}

function formFromHole(h: BunkerHoleLog): HoleForm {
  const quadrant = h.first_putt_miss_quadrant;
  return {
    distance: String(h.distance_m),
    strike: h.strike_vertical,
    proximity: String(h.proximity_cm),
    putt: h.holed ? "" : h.putt_made ? "made" : "missed",
    quadrant: quadrant && quadrant !== "lipOut" ? quadrant : null,
    reason: h.putt_miss_primary_reason ?? null,
  };
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(holes: BunkerHoleLog[]) {
  const n = holes.length;
  const total = bunkerSessionTotalPoints(holes);
  const chipPts = totalBunkerChipPoints(holes);
  const puttPts = holes.reduce((s, h) => s + h.putt_points, 0);
  const holed = holes.filter((h) => h.holed).length;
  const needPutt = holes.filter((h) => !h.holed);
  const puttsMade = needPutt.filter((h) => h.putt_made).length;
  const puttsMissed = needPutt.length - puttsMade;
  const saves = holed + puttsMade;
  const avgCm = averageBunkerProximityCm(holes) ?? 0;

  const zones: Record<ChipResultLabel, number> = {
    Holed: 0,
    "Inside Club Length": 0,
    "Inside 6ft": 0,
    "Safety Zone": 0,
    "Missed Zone": 0,
    "Outside Zone": 0,
  };
  const strikes: Record<BunkerVerticalStrike, number> = { solid: 0, fat: 0, thin: 0 };
  const reasons: Record<PrimaryMissReason, number> = { read: 0, speed: 0, startLine: 0 };
  for (const h of holes) {
    zones[h.zone]++;
    strikes[h.strike_vertical]++;
    if (!h.holed && !h.putt_made && h.putt_miss_primary_reason) reasons[h.putt_miss_primary_reason]++;
  }
  const insideClub = zones.Holed + zones["Inside Club Length"];
  const inside6ft = insideClub + zones["Inside 6ft"];
  const outside3m = zones["Missed Zone"] + zones["Outside Zone"];

  const avgOf = (hs: BunkerHoleLog[]) => (hs.length ? hs.reduce((s, h) => s + h.proximity_cm, 0) / hs.length : null);
  const byBand: { label: string; n: number; avgCm: number }[] = [];
  for (const b of DISTANCE_BANDS) {
    const at = holes.filter((h) => b.test(h.distance_m));
    const avgCm = avgOf(at);
    if (avgCm !== null) byBand.push({ label: b.label, n: at.length, avgCm });
  }
  const rankedBands = [...byBand].sort((a, b) => b.avgCm - a.avgCm);
  const worstBand = rankedBands.length > 1 && rankedBands[0]!.avgCm > rankedBands[rankedBands.length - 1]!.avgCm ? rankedBands[0]!.label : null;

  const solidAvgCm = avgOf(holes.filter((h) => h.strike_vertical === "solid"));
  const missHitAvgCm = avgOf(holes.filter((h) => h.strike_vertical !== "solid"));

  const topReason = (Object.keys(reasons) as PrimaryMissReason[]).sort((a, b) => reasons[b] - reasons[a])[0]!;
  const strikeMiss = strikes.fat >= strikes.thin ? "fat" : "thin";
  const strikeMissCount = strikes[strikeMiss];
  const strikeTip =
    strikeMissCount === 0
      ? null
      : strikeMiss === "fat"
        ? `${plural(strikeMissCount, "shot")} came out fat. Keep your weight on your lead side and hit the sand just behind the ball.`
        : `${plural(strikeMissCount, "shot")} came out thin. Open the face and let the bounce splash the sand before the ball.`;

  // Proximity is measured against finishing inside a club length (15 pts), which is a realistic target.
  const proximityLoss = needPutt.reduce((s, h) => s + Math.max(0, 15 - h.bunker_chip_points), 0);
  const puttLoss = puttsMissed * PUTT_BONUS;

  let focus: { title: string; lines: string[] };
  if (saves === n) {
    focus = {
      title: "Every hole up and down",
      lines: [`${plural(holed, "hole")} holed from the sand and ${plural(puttsMade, "putt")} made.`, "Try tougher lies or longer shots next time."],
    };
  } else if (outside3m >= 2) {
    focus = {
      title: "Focus next: getting it on the green",
      lines: [
        `${outside3m} of ${n} bunker shots finished more than 3 m away and scored nothing.`,
        strikeTip ?? "Hit the sand 3 cm behind the ball with an open face and keep the club moving to a full finish.",
      ],
    };
  } else if (puttLoss > proximityLoss) {
    focus = {
      title: "Focus next: holing the putt",
      lines: [
        `You made ${puttsMade} of ${needPutt.length} putts after the bunker shot. The misses cost you ${puttLoss} pts.`,
        reasons[topReason] > 0 ? REASON_TIP[topReason] : "Spend 10 minutes on 1 to 2 m putts before your next session.",
      ],
    };
  } else {
    focus = {
      title: "Focus next: getting it closer",
      lines: [`Your average finish was ${fmtCm(avgCm)}, and ${insideClub} of ${n} finished inside a club length.`],
    };
    if (worstBand) {
      const w = byBand.find((b) => b.label === worstBand)!;
      focus.lines.push(`${worstBand} was your weakest range at ${fmtCm(w.avgCm)} on average.`);
    }
    focus.lines.push("Pick a landing spot and keep the same swing speed. Change the length of the swing, not the speed.");
  }
  if (strikeTip && strikeMissCount >= 3 && outside3m < 2 && saves < n) {
    focus.lines.push(`Also: ${strikeTip.charAt(0).toLowerCase()}${strikeTip.slice(1)}`);
  }

  return {
    total,
    chipPts,
    puttPts,
    holed,
    needPutt: needPutt.length,
    puttsMade,
    puttsMissed,
    puttLoss,
    saves,
    avgCm,
    zones,
    insideClub,
    inside6ft,
    outside3m,
    byBand,
    worstBand,
    strikes,
    solidAvgCm,
    missHitAvgCm,
    reasons,
    diagnosis: bunkerMissDiagnosisText(holes),
    focus,
  };
}

/** Two-by-two picker for where the missed putt finished, past the hole on top. */
function QuadrantPicker({ value, onChange }: { value: MissQuadrant | null; onChange: (q: MissQuadrant) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUADRANTS.map((q) => {
        const active = value === q.key;
        return (
          <button
            key={q.key}
            type="button"
            onClick={() => onChange(q.key)}
            aria-pressed={active}
            className={`rounded-2xl border-2 px-3 py-3 text-left transition-all active:scale-[0.97] ${
              active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-bold">{q.title}</span>
            <span className={`block text-[11px] ${active ? "text-white/70" : "text-gray-400"}`}>{q.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** @returns null on success, or a user-visible error string */
async function persistSession(userId: string, holes: BunkerHoleLog[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const aggregates = buildBunkerAggregates(holes);
    const proximityScores = holes.map((h) => ({
      hole: h.hole,
      zone: h.zone,
      bunker_chip_points: h.bunker_chip_points,
      proximity_cm: h.proximity_cm,
      distance_m: h.distance_m,
      strike_vertical: h.strike_vertical,
      holed: h.holed,
      putt_made: h.putt_made ?? null,
      putt_points: h.putt_points,
    }));
    const missCategories = holes
      .filter((h) => !h.holed && !h.putt_made && (h.miss_category || h.first_putt_miss_quadrant))
      .map((h) => ({
        hole: h.hole,
        category: h.miss_category,
        quadrant: h.first_putt_miss_quadrant ?? null,
        primary_reason: h.putt_miss_primary_reason ?? null,
      }));
    const payload = {
      version: 1,
      proximity_scores: proximityScores,
      miss_categories: missCategories,
      holes,
      aggregates,
    };

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: bunker9HoleChallengeConfig.testType,
      test_type: bunker9HoleChallengeConfig.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: bunker9HoleChallengeConfig.noteKind,
        scramble_rate: aggregates.scramble_rate,
        proximity_rating: aggregates.proximity_rating,
        diagnosis: aggregates.diagnosis,
        total_points: aggregates.total_points,
        payload,
      }),
    });
    if (error) {
      console.warn("[Bunker9HoleChallenge] practice insert:", formatSupabaseWriteError(error));
      return formatSupabaseWriteError(error);
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[Bunker9HoleChallenge] practice insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

export function Bunker9HoleChallengeRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = bunker9HoleChallengeConfig.holeCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [holes, setHoles] = useState<BunkerHoleLog[]>([]);
  const [form, setForm] = useState<HoleForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const holeNumber = holes.length + 1;
  const entry = status === "active" ? buildHole(form, holeNumber) : null;

  const startTest = useCallback(() => {
    setStatus("active");
    setHoles([]);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: BunkerHoleLog[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
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

  const recordHole = useCallback(async () => {
    if (status !== "active" || !entry) return;
    const next = [...holes, entry];
    setHoles(next);
    setForm(EMPTY_FORM);
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, entry, holes, total, save]);

  const undoLastHole = useCallback(() => {
    if (status !== "active" || holes.length === 0) return;
    setForm(formFromHole(holes[holes.length - 1]!));
    setHoles((h) => h.slice(0, -1));
  }, [status, holes]);

  const summary = useMemo(() => (status === "complete" && holes.length >= total ? breakdown(holes) : null), [status, holes, total]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={bunker9HoleChallengeConfig.testName}
          kicker="Bunker combine"
          art={<BunkerShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${total} holes`, "5 to 30 m", "~20 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <MapPin className="h-5 w-5" aria-hidden />, title: "Pick a new lie each hole", hint: "Mix it up, from short splashes to 30 m" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Measure where it finishes", hint: "In cm, from the ball to the hole" },
            { icon: <CircleDot className="h-5 w-5" aria-hidden />, title: "Putt it out", hint: `Hole the putt for a sand save and +${PUTT_BONUS}` },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Holed from the sand: 20 pts</li>
            <li>Inside a club length (90 cm): 15 to 11 pts, closer scores more</li>
            <li>Inside 6 ft (183 cm): 10 to 6 pts · inside 3 m: 5 to 1 pts</li>
            <li>Further than 3 m: 0 pts</li>
            <li>Didn&apos;t hole it? Make the putt for +{PUTT_BONUS}.</li>
            <li className="font-semibold text-gray-900">Scored out of {MAX_SESSION_POINTS}. Higher is better.</li>
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
          <ScoreRing pct={summary.total / MAX_SESSION_POINTS} value={fmt(summary.total)} caption={`of ${MAX_SESSION_POINTS} points`} />
          <p className="mt-2 text-xs text-white/70">
            {summary.saves} of {total} up and down · higher is better
          </p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Sand saves", value: `${summary.saves}/${total}`, sub: summary.holed > 0 ? `${summary.holed} holed out` : null },
            { label: "Avg finish", value: fmtCm(summary.avgCm) },
            {
              label: "Putts made",
              value: summary.needPutt > 0 ? `${summary.puttsMade}/${summary.needPutt}` : "—",
              sub: summary.needPutt === 0 ? "No putts needed" : null,
            },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your points went" aside={`${fmt(summary.total)} pts`}>
          <BreakdownBar
            segments={[
              { label: "Bunker shots", value: summary.chipPts, tone: "bg-[#014421]" },
              { label: "Putts", value: summary.puttPts, tone: "bg-[#FFA500]" },
              { label: "Lost: missed putts", value: summary.puttLoss, tone: "bg-red-400" },
              { label: "Lost: proximity", value: Math.round((MAX_BUNKER_SESSION_CHIP - summary.chipPts) * 10) / 10, tone: "bg-amber-300" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="Bunker shots" aside={`Avg ${fmtCm(summary.avgCm)}`}>
          <BreakdownBar
            segments={[
              { label: "Holed", value: summary.zones.Holed, tone: "bg-[#014421]" },
              { label: "Club length", value: summary.zones["Inside Club Length"], tone: "bg-green-400" },
              { label: "6 ft", value: summary.zones["Inside 6ft"], tone: "bg-amber-300" },
              { label: "3 m", value: summary.zones["Safety Zone"], tone: "bg-orange-400" },
              { label: "Further", value: summary.outside3m, tone: "bg-red-400" },
            ]}
          />
          <div className="mt-3 space-y-3">
            <RateRow label="Inside 6 ft" made={summary.inside6ft} total={total} />
            {summary.byBand.map((b) => (
              <ValueRow
                key={b.label}
                label={b.label}
                value={b.avgCm}
                max={300}
                lowerIsBetter
                display={`${fmtCm(b.avgCm)} · ${plural(b.n, "shot")}`}
                flag={b.label === summary.worstBand ? "Work on" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Up and down" aside={`${summary.saves}/${total}`}>
          <div className="space-y-3">
            <RateRow label="Sand saves" made={summary.saves} total={total} />
            {summary.needPutt > 0 && <RateRow label="Putts made" made={summary.puttsMade} total={summary.needPutt} />}
            {summary.puttsMissed > 0 && (
              <>
                <BreakdownBar
                  label="Why putts missed"
                  segments={[
                    { label: "Read", value: summary.reasons.read, tone: "bg-sky-400" },
                    { label: "Speed", value: summary.reasons.speed, tone: "bg-[#FFA500]" },
                    { label: "Start line", value: summary.reasons.startLine, tone: "bg-violet-400" },
                  ]}
                />
                <p className="text-xs text-gray-600">{summary.diagnosis}</p>
              </>
            )}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Sand contact">
          <BreakdownBar
            segments={[
              { label: "Solid", value: summary.strikes.solid, tone: "bg-[#014421]" },
              { label: "Fat", value: summary.strikes.fat, tone: "bg-amber-500" },
              { label: "Thin", value: summary.strikes.thin, tone: "bg-sky-400" },
            ]}
          />
          {summary.solidAvgCm !== null && summary.missHitAvgCm !== null && (
            <p className="mt-2 text-xs text-gray-600">
              Solid shots finished {fmtCm(summary.solidAvgCm)} away on average, fat and thin ones {fmtCm(summary.missHitAvgCm)}.
            </p>
          )}
        </BreakdownCard>

        <EveryShotList title="Every hole">
          {holes.map((h) => (
            <li key={h.hole} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">H{h.hole}</span>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                {fmt(h.distance_m)} m · {h.holed ? "Holed" : fmtCm(h.proximity_cm)} · {STRIKE_LABEL[h.strike_vertical]}
                {h.holed ? "" : h.putt_made ? " · Putt made" : " · Putt missed"}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${holeTone(h)}`}>{fmt(holePoints(h))}</span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(holes) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const distance = parseDistanceM(form.distance);
  const cm = parseProximityCm(form.proximity);
  const holedOut = cm === 0;
  const chipPts = cm !== null ? bunkerPointsFromProximityCm(cm) : null;
  const runningTotal = bunkerSessionTotalPoints(holes);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => (holes[i] ? holeTrackItem(holes[i]!) : null));
  const hint =
    distance === null
      ? "Drop a ball somewhere new"
      : cm === null
        ? "Splash it close"
        : holedOut
          ? "Holed from the sand!"
          : "Now putt it out";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{fmt(runningTotal)} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={holes.length} name="Hole" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <BunkerShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Hole {holeNumber} of {total}
          </p>
          {distance !== null ? (
            <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
              {fmt(distance)}
              <span className="ml-1 text-xl font-bold text-gray-400">m</span>
            </p>
          ) : (
            <p className="text-2xl font-extrabold leading-tight text-gray-300">Pick a distance</p>
          )}
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">{hint}</p>
        </div>
      </div>

      {holes.length > 0 && <CombineFlowBackControl onBack={undoLastHole} label="Undo last hole" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How far to the flag?</p>
        <NumberChips
          values={START_CHIPS_M}
          value={form.distance}
          onChange={(v) => setForm((f) => ({ ...f, distance: v }))}
          unit="m"
          ariaLabel="Distance to the flag in metres"
        />
      </div>

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How was the strike?</p>
        <Segmented
          options={[
            { key: "fat", label: "Fat", hint: "Too much sand" },
            { key: "solid", label: "Solid", hint: "Clean splash" },
            { key: "thin", label: "Thin", hint: "Ball first" },
          ]}
          value={form.strike}
          onChange={(strike) => setForm((f) => ({ ...f, strike }))}
        />
      </div>

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How close did it finish?</p>
        <NumberChips
          values={FINISH_CHIPS_CM}
          value={form.proximity}
          onChange={(v) => setForm((f) => ({ ...f, proximity: v }))}
          unit="cm"
          formatChip={(v) => (v === 0 ? "Holed" : null)}
          ariaLabel="Distance from the hole in cm"
        />
        {cm !== null && chipPts !== null && (
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{ZONE_LABEL[bunkerZoneFromProximityCm(cm)]}</span> · {fmt(chipPts)} pts
          </p>
        )}
      </div>

      {cm !== null && !holedOut && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">Did you hole the putt?</p>
          <Segmented<PuttAnswer>
            options={[
              { key: "made", label: "Made it", hint: `+${PUTT_BONUS} pts` },
              { key: "missed", label: "Missed", hint: "Tell us how" },
            ]}
            value={form.putt}
            onChange={(putt) => setForm((f) => ({ ...f, putt }))}
          />
        </div>
      )}

      {cm !== null && !holedOut && form.putt === "missed" && (
        <>
          <div className="space-y-2">
            <p className="text-base font-bold text-gray-900">Where did the putt finish?</p>
            <QuadrantPicker value={form.quadrant} onChange={(quadrant) => setForm((f) => ({ ...f, quadrant }))} />
          </div>
          <div className="space-y-2">
            <p className="text-base font-bold text-gray-900">Why did it miss?</p>
            <Segmented<PrimaryMissReason | "">
              options={[
                { key: "read", label: "Read", hint: "Wrong break" },
                { key: "speed", label: "Speed", hint: "Too firm or soft" },
                { key: "startLine", label: "Start line", hint: "Pushed or pulled" },
              ]}
              value={form.reason ?? ""}
              onChange={(reason) => setForm((f) => ({ ...f, reason: reason || null }))}
            />
          </div>
        </>
      )}

      <PrimaryButton onClick={() => void recordHole()} disabled={!entry}>
        {holeNumber >= total ? "Finish the test" : "Next hole"}
        {entry && <span className="block text-xs font-semibold text-white/70">This hole scores {fmt(holePoints(entry))}</span>}
      </PrimaryButton>
    </div>
  );
}
