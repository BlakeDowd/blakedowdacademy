"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CircleDot, Flag, Ruler } from "lucide-react";
import { CombinePerformanceGradeBadge } from "@/components/CombinePerformanceGradeBadge";
import { performanceGradeFromSessionTotal } from "@/lib/combinePerformanceGrade";
import { useCombineUser } from "@/hooks/useCombineUser";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import {
  type ChipResultLabel,
  type ChippingCombineHoleLog,
  MAX_CHIP_SESSION,
  MAX_SESSION_POINTS,
  averageProximityCm,
  buildAggregates,
  chipPointsFromProximityCm,
  chipResultLabelFromProximityCm,
  missDiagnosisText,
  sessionTotalPoints,
  totalChipPoints,
} from "@/lib/chippingCombine9Analytics";
import { PRIMARY_MISS_LABELS, type PrimaryMissReason } from "@/lib/puttingTestMissDiagnostics";
import { PUTTING_TEST_MISS_CATEGORY_LABELS, type PuttingTestMissCategory } from "@/lib/puttingTestMissScoring";
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
import { CARD_ART_CLASS, ChipShotDiagram, HERO_ART_CLASS } from "@/components/combine/CombineArt";

type MissQuadrant = Exclude<PuttingTestMissCategory, "lipOut">;
type PuttOutcome = "made" | "missed";

const PUTT_POINTS = 10;
const SIX_FT_CM = 183;
const PROXIMITY_CHIPS_CM = [0, 30, 60, 90, 120, 150, 180, 240, 300] as const;

const ZONES: { label: ChipResultLabel; short: string; from: string; tone: string }[] = [
  { label: "Holed", short: "Holed", from: "Holed", tone: "bg-[#014421]" },
  { label: "Inside Club Length", short: "Club length", from: "Inside a club length", tone: "bg-green-500" },
  { label: "Inside 6ft", short: "Inside 6 ft", from: "Inside 6 ft", tone: "bg-lime-400" },
  { label: "Safety Zone", short: "Inside 3 m", from: "Inside 3 m", tone: "bg-[#FFA500]" },
  { label: "Missed Zone", short: "Outside 3 m", from: "Outside 3 m", tone: "bg-red-400" },
];

const QUADRANTS: { key: MissQuadrant; title: string; hint: string }[] = [
  { key: "highLong", title: "Long · high side", hint: "Past and above the hole" },
  { key: "lowLong", title: "Long · low side", hint: "Past and below the hole" },
  { key: "highShort", title: "Short · high side", hint: "Short and above the hole" },
  { key: "lowShort", title: "Short · low side", hint: "Short and below the hole" },
];

const REASON_TIPS: Record<PrimaryMissReason, string> = {
  read: "Most misses were misreads. Read the putt from below the hole as well as behind the ball.",
  speed: "Most misses were speed. Try to roll every putt about 30 cm past the hole.",
  startLine: "Most misses were start line. Putt through a gate of two tees to square the face.",
};

const DISTANCE_BANDS = (() => {
  const lo = chippingCombine9Config.distanceMinM;
  const hi = chippingCombine9Config.distanceMaxM;
  const step = Math.ceil((hi - lo + 1) / 3);
  return [0, 1, 2].map((i) => {
    const from = lo + i * step;
    const to = Math.min(hi, from + step - 1);
    return { from, to, label: `${from} to ${to} m` };
  });
})();

function parseProximityCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeNumberInput(raw: string): string {
  const t = raw.replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  return dot === -1 ? t : t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
}

function randomDistancesM(count: number, min: number, max: number): number[] {
  const span = max - min + 1;
  return Array.from({ length: count }, () => min + Math.floor(Math.random() * span));
}

function formatCm(cm: number): string {
  return cm < 100 ? `${Math.round(cm)} cm` : `${(cm / 100).toFixed(1)} m`;
}

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function holePoints(h: ChippingCombineHoleLog): number {
  return Math.round((h.chip_points + h.putt_points) * 10) / 10;
}

function holeTone(h: ChippingCombineHoleLog): string {
  if (h.putt_made && h.chip_points >= 11) return "bg-[#014421] text-white";
  if (h.putt_made) return "bg-green-200 text-[#014421]";
  if (h.chip_points > 0) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function holeTrackItem(h: ChippingCombineHoleLog): NonNullable<TrackItem> {
  const p = holePoints(h);
  return { label: String(Math.round(p)), tone: holeTone(h), ariaLabel: `Hole ${h.hole}: ${formatPts(p)} points` };
}

/** Tap where the missed putt finished. Long row on top, short row below, as seen from the ball. */
function QuadrantPicker({ value, onChange }: { value: MissQuadrant | null; onChange: (q: MissQuadrant) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {QUADRANTS.map((q) => {
        const active = value === q.key;
        return (
          <button
            key={q.key}
            type="button"
            onClick={() => onChange(q.key)}
            aria-pressed={active}
            className={`rounded-2xl border-2 px-2 py-2.5 text-left transition-all active:scale-[0.97] ${
              active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-bold">{q.title}</span>
            <span className={`block text-[10px] ${active ? "text-white/70" : "text-gray-400"}`}>{q.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(holes: ChippingCombineHoleLog[]) {
  const n = holes.length;
  const total = sessionTotalPoints(holes);
  const chipPts = totalChipPoints(holes);
  const made = holes.filter((h) => h.putt_made).length;
  const puttPts = holes.reduce((s, h) => s + h.putt_points, 0);
  const chipLost = Math.round((MAX_CHIP_SESSION - chipPts) * 10) / 10;
  const puttLost = (n - made) * PUTT_POINTS;
  const avgCm = averageProximityCm(holes);

  const zones = ZONES.map((z) => {
    const at = holes.filter((h) => h.chip_result === z.label);
    return { ...z, n: at.length, made: at.filter((h) => h.putt_made).length };
  });

  const bands = DISTANCE_BANDS.map((b) => {
    const at = holes.filter((h) => h.distance_m >= b.from && h.distance_m <= b.to);
    return { ...b, n: at.length, avgCm: averageProximityCm(at) };
  });
  const rankedBands = bands.filter((b) => b.avgCm != null).sort((a, b) => b.avgCm! - a.avgCm!);
  const worstBand =
    rankedBands.length > 1 && rankedBands[0]!.avgCm! > rankedBands[rankedBands.length - 1]!.avgCm!
      ? rankedBands[0]!
      : null;

  const misses = holes.filter((h) => !h.putt_made);
  const reasons: Record<PrimaryMissReason, number> = { read: 0, speed: 0, startLine: 0 };
  const quadrants: Record<MissQuadrant, number> = { highLong: 0, lowLong: 0, highShort: 0, lowShort: 0 };
  for (const h of misses) {
    if (h.putt_miss_primary_reason) reasons[h.putt_miss_primary_reason]++;
    const q = h.first_putt_miss_quadrant;
    if (q && q !== "lipOut") quadrants[q]++;
  }
  const topReasonEntry = (Object.entries(reasons) as [PrimaryMissReason, number][]).sort((a, b) => b[1] - a[1])[0]!;
  const topReason = topReasonEntry[1] > 0 ? topReasonEntry[0] : null;
  const reasonTip = topReason ? REASON_TIPS[topReason] : "Pick a spot just in front of the ball and roll it over that.";

  const outsideSixFt = holes.filter((h) => (h.proximity_cm ?? 0) > SIX_FT_CM).length;
  const shortMisses = misses.filter((h) => (h.proximity_cm ?? 0) <= SIX_FT_CM).length;

  let focus: { title: string; lines: string[] };
  if (misses.length === 0 && outsideSixFt === 0) {
    focus = {
      title: "Perfect round",
      lines: ["Every chip inside 6 ft and every putt holed. Try it from further back next time."],
    };
  } else if (shortMisses >= 2 && shortMisses >= outsideSixFt) {
    focus = {
      title: "Focus next: short putts",
      lines: [`You missed ${shortMisses} putts from inside 6 ft, worth ${shortMisses * PUTT_POINTS} pts.`, reasonTip],
    };
  } else if (outsideSixFt > 0) {
    focus = {
      title: "Focus next: chipping closer",
      lines: [`${outsideSixFt} of ${n} chips finished outside 6 ft, which makes the putt a long shot.`],
    };
    if (worstBand) {
      focus.lines.push(`Your ${worstBand.label} chips were the furthest away, ${formatCm(worstBand.avgCm!)} on average.`);
    }
    focus.lines.push("Pick a landing spot about a metre onto the green and let it roll out like a putt.");
  } else {
    focus = {
      title: "Focus next: holing out",
      lines: [
        `Your chipping was sharp, but ${misses.length === 1 ? "one missed putt" : `${misses.length} missed putts`} cost ${puttLost} pts.`,
        reasonTip,
      ],
    };
  }

  return {
    total,
    chipPts,
    puttPts,
    chipLost,
    puttLost,
    made,
    avgCm,
    zones,
    bands,
    worstBand,
    misses: misses.length,
    reasons,
    quadrants,
    topReason,
    diagnosis: missDiagnosisText(holes),
    grade: performanceGradeFromSessionTotal(total, MAX_SESSION_POINTS),
    track: holes.map(holeTrackItem),
    focus,
  };
}

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  distancesM: number[],
  holes: ChippingCombineHoleLog[],
  aggregates: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const proximityScores = holes.map((h) => ({
      hole: h.hole,
      chip_result: h.chip_result,
      chip_points: h.chip_points,
      proximity_cm: h.proximity_cm ?? null,
    }));
    const missCategories = holes
      .filter((h) => h.miss_category || h.first_putt_miss_quadrant)
      .map((h) => ({
        hole: h.hole,
        category: h.miss_category,
        quadrant: h.first_putt_miss_quadrant ?? null,
        primary_reason: h.putt_miss_primary_reason ?? null,
      }));

    const grade = performanceGradeFromSessionTotal(aggregates.total_points as number, MAX_SESSION_POINTS);
    const payload = {
      version: 1,
      distances_m: distancesM,
      proximity_scores: proximityScores,
      miss_categories: missCategories,
      holes,
      aggregates,
      performance_grade: grade.label,
    };

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: chippingCombine9Config.testType,
      test_type: chippingCombine9Config.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: chippingCombine9Config.noteKind,
        scramble_rate: aggregates.scramble_rate,
        proximity_rating: aggregates.proximity_rating,
        diagnosis: aggregates.diagnosis,
        total_points: aggregates.total_points,
        payload,
      }),
    });
    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[ChippingCombine9] practice insert:", msg);
      return msg;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[ChippingCombine9] practice insert failed", msg);
    return msg;
  }
}

export function ChippingCombine9Runner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = chippingCombine9Config.holeCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [distancesM, setDistancesM] = useState<number[]>([]);
  const [holes, setHoles] = useState<ChippingCombineHoleLog[]>([]);
  const [proximityInput, setProximityInput] = useState("");
  const [putt, setPutt] = useState<PuttOutcome | "">("");
  const [quadrant, setQuadrant] = useState<MissQuadrant | null>(null);
  const [reason, setReason] = useState<PrimaryMissReason | "">("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const resetHole = () => {
    setProximityInput("");
    setPutt("");
    setQuadrant(null);
    setReason("");
  };

  const startTest = useCallback(() => {
    setDistancesM(
      randomDistancesM(total, chippingCombine9Config.distanceMinM, chippingCombine9Config.distanceMaxM),
    );
    setHoles([]);
    resetHole();
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
    setStatus("active");
  }, [total]);

  const save = useCallback(
    async (all: ChippingCombineHoleLog[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, distancesM, all, buildAggregates(all));
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId, distancesM],
  );

  const holeIndex = holes.length;
  const holeNumber = holeIndex + 1;
  const distanceThisHole = distancesM[holeIndex] ?? 0;
  const cm = parseProximityCm(proximityInput);
  const holedChip = cm === 0;
  const puttMade = holedChip || putt === "made";
  const canRecord = cm !== null && (puttMade || (putt === "missed" && quadrant !== null && reason !== ""));

  const recordHole = useCallback(async () => {
    if (status !== "active" || !canRecord || cm === null) return;
    const base = {
      hole: holeNumber,
      distance_m: distanceThisHole,
      proximity_cm: cm,
      chip_result: chipResultLabelFromProximityCm(cm),
      chip_points: chipPointsFromProximityCm(cm),
    };
    const entry: ChippingCombineHoleLog =
      puttMade || quadrant === null || reason === ""
        ? { ...base, putt_made: true, putt_points: PUTT_POINTS }
        : {
            ...base,
            putt_made: false,
            putt_points: 0,
            first_putt_miss_quadrant: quadrant,
            putt_miss_primary_reason: reason,
            miss_category: `${PUTTING_TEST_MISS_CATEGORY_LABELS[quadrant]} · ${PRIMARY_MISS_LABELS[reason]}`,
          };
    const next = [...holes, entry];
    setHoles(next);
    resetHole();
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, canRecord, cm, holeNumber, distanceThisHole, puttMade, quadrant, reason, holes, total, save]);

  const undoLastHole = useCallback(() => {
    if (status !== "active" || holes.length === 0) return;
    const last = holes[holes.length - 1]!;
    setHoles((h) => h.slice(0, -1));
    setProximityInput(last.proximity_cm != null ? String(last.proximity_cm) : "");
    setPutt(last.putt_made ? "made" : "missed");
    const q = last.first_putt_miss_quadrant;
    setQuadrant(q && q !== "lipOut" ? q : null);
    setReason(last.putt_miss_primary_reason ?? "");
  }, [status, holes]);

  const summary = useMemo(() => (status === "complete" ? breakdown(holes) : null), [status, holes]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={chippingCombine9Config.testName}
          kicker="Chipping combine"
          art={<ChipShotDiagram className={HERO_ART_CLASS} />}
          chips={[
            `${total} holes`,
            `${chippingCombine9Config.distanceMinM} to ${chippingCombine9Config.distanceMaxM} m`,
            "~20 min",
            "Highest score wins",
          ]}
        />
        <IntroSteps
          steps={[
            {
              icon: <Flag className="h-5 w-5" aria-hidden />,
              title: "Chip from a new spot each hole",
              hint: `We pick ${total} random distances from ${chippingCombine9Config.distanceMinM} to ${chippingCombine9Config.distanceMaxM} m`,
            },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Measure how close you finished", hint: "In cm, ball to hole. A phone measure app helps" },
            { icon: <CircleDot className="h-5 w-5" aria-hidden />, title: "Then try to hole the putt", hint: "One putt only. If it misses, log where and why" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Holed chip: 20 pts</li>
            <li>Inside a club length (up to 90 cm): 15 down to 11 pts</li>
            <li>Inside 6 ft (91 to 183 cm): 10 down to 6 pts</li>
            <li>Inside 3 m: 5 down to 1 pt · 3 m or more: 0</li>
            <li>Hole the putt: +{PUTT_POINTS}</li>
            <li className="font-semibold text-gray-900">
              Up to 30 per hole, {MAX_SESSION_POINTS} in total. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const missZones = summary.zones.filter((z) => z.label !== "Holed" && z.n > 0);
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing
            pct={summary.total / MAX_SESSION_POINTS}
            value={formatPts(summary.total)}
            caption={`of ${MAX_SESSION_POINTS} points`}
          />
          <p className="mt-2 text-xs text-white/70">Chip and putt score · higher is better</p>
          <span className="mt-3 inline-block rounded-xl bg-white">
            <CombinePerformanceGradeBadge gradeId={summary.grade.id} label={summary.grade.label} />
          </span>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Up and downs", value: `${summary.made}/${total}`, sub: `${Math.round((summary.made / total) * 100)}%` },
            { label: "Avg finish", value: summary.avgCm != null ? formatCm(summary.avgCm) : "—", sub: "from the hole" },
            { label: "Chip points", value: formatPts(summary.chipPts), sub: `of ${MAX_CHIP_SESSION}` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your points went" aside={`${formatPts(summary.total)} of ${MAX_SESSION_POINTS}`}>
          <BreakdownBar
            segments={[
              { label: "Chips", value: summary.chipPts, tone: "bg-[#014421]" },
              { label: "Putts", value: summary.puttPts, tone: "bg-green-400" },
              { label: "Lost on chips", value: summary.chipLost, tone: "bg-[#FFA500]" },
              { label: "Lost on putts", value: summary.puttLost, tone: "bg-red-400" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="Where your chips finished" aside="Shots">
          <BreakdownBar segments={summary.zones.map((z) => ({ label: z.short, value: z.n, tone: z.tone }))} />
          {missZones.length > 0 && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500">Putts holed from each spot</p>
              {missZones.map((z) => (
                <RateRow key={z.label} label={z.from} made={z.made} total={z.n} />
              ))}
            </div>
          )}
        </BreakdownCard>

        <BreakdownCard title="Proximity by distance" aside="Avg finish">
          <div className="space-y-3">
            {summary.bands.map((b) => (
              <ValueRow
                key={b.label}
                label={`${b.label}${b.n > 0 ? ` · ${b.n} chip${b.n === 1 ? "" : "s"}` : ""}`}
                value={b.avgCm ?? 0}
                max={300}
                display={b.avgCm != null ? formatCm(b.avgCm) : "—"}
                lowerIsBetter
                flag={summary.worstBand?.label === b.label ? "Work on" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        {summary.misses > 0 && (
          <BreakdownCard title="Missed putts" aside={`${summary.misses} missed`}>
            <BreakdownBar
              label="Why they missed"
              segments={[
                { label: "Read", value: summary.reasons.read, tone: "bg-sky-400" },
                { label: "Speed", value: summary.reasons.speed, tone: "bg-[#FFA500]" },
                { label: "Start line", value: summary.reasons.startLine, tone: "bg-violet-400" },
              ]}
            />
            <p className="mb-1 mt-3 text-xs font-semibold text-gray-800">Where they finished</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUADRANTS.map((q) => (
                <div key={q.key} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                  <span className="text-xs font-semibold text-gray-600">{q.title}</span>
                  <span className="text-sm font-extrabold tabular-nums text-gray-900">{summary.quadrants[q.key]}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">{summary.diagnosis}</p>
          </BreakdownCard>
        )}

        <EveryShotList title="Every hole">
          {holes.map((h) => (
            <li key={h.hole} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-12 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">
                {h.distance_m} m
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                {h.proximity_cm === 0
                  ? "Holed the chip"
                  : `${h.proximity_cm != null ? formatCm(h.proximity_cm) : h.chip_result} · ${
                      h.putt_made ? "Putt holed" : `Missed${h.putt_miss_primary_reason ? `, ${PRIMARY_MISS_LABELS[h.putt_miss_primary_reason].toLowerCase()}` : ""}`
                    }`}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${holeTone(h)}`}>
                {formatPts(holePoints(h))}
              </span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(holes) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const runningTotal = sessionTotalPoints(holes);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => (holes[i] ? holeTrackItem(holes[i]!) : null));
  const chipPts = cm !== null ? chipPointsFromProximityCm(cm) : null;
  const liveScore = chipPts !== null && canRecord ? chipPts + (puttMade ? PUTT_POINTS : 0) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {formatPts(runningTotal)} pts
        </span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={holeIndex} name="Hole" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <ChipShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Hole {holeNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {distanceThisHole}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">Chip it close, then hole the putt</p>
        </div>
      </div>

      {holes.length > 0 && <CombineFlowBackControl onBack={undoLastHole} label="Undo last hole" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How close did the chip finish?</p>
        <NumberChips
          values={PROXIMITY_CHIPS_CM}
          value={proximityInput}
          onChange={(v) => setProximityInput(normalizeNumberInput(v))}
          unit="cm"
          formatChip={(v) => (v === 0 ? "Holed" : null)}
          ariaLabel="Distance from the hole in cm"
        />
        {chipPts !== null && (
          <p className="text-xs text-gray-500">
            {holedChip
              ? "Chip-in! That's 20 pts and counts as a holed putt too."
              : `Chip scores ${formatPts(chipPts)} pts`}
          </p>
        )}
      </div>

      {cm !== null && !holedChip && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">Did you hole the putt?</p>
          <Segmented<PuttOutcome | "">
            options={[
              { key: "made", label: "Holed it", hint: `+${PUTT_POINTS} pts` },
              { key: "missed", label: "Missed", hint: "Log where and why" },
            ]}
            value={putt}
            onChange={setPutt}
          />
        </div>
      )}

      {cm !== null && !holedChip && putt === "missed" && (
        <>
          <div className="space-y-2">
            <p className="text-base font-bold text-gray-900">Where did the putt finish?</p>
            <QuadrantPicker value={quadrant} onChange={setQuadrant} />
          </div>
          <div className="space-y-2">
            <p className="text-base font-bold text-gray-900">Why did it miss?</p>
            <Segmented<PrimaryMissReason | "">
              options={[
                { key: "read", label: "Read", hint: "Wrong line" },
                { key: "speed", label: "Speed", hint: "Too firm or soft" },
                { key: "startLine", label: "Start line", hint: "Pushed or pulled" },
              ]}
              value={reason}
              onChange={setReason}
            />
          </div>
        </>
      )}

      <PrimaryButton onClick={() => void recordHole()} disabled={!canRecord}>
        {holeNumber >= total ? "Finish the test" : "Next hole"}
        {liveScore != null && (
          <span className="block text-xs font-semibold text-white/70">This hole scores {formatPts(liveScore)}</span>
        )}
      </PrimaryButton>
    </div>
  );
}
