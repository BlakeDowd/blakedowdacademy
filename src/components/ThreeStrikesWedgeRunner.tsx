"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Flag, Flame, Ruler, X } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
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
  ResultHero,
  SaveStatus,
  ScoringGuide,
  StatTiles,
} from "@/components/combine/PuttingCombineUi";
import { IronHeroArt, IronShotDiagram } from "@/components/combine/IronCombineUi";
import { BreakdownCard, EveryShotList, FocusCard, RateRow } from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS } from "@/components/combine/CombineArt";

const { hitWindowM: HIT_WINDOW_M, maxStrikes: MAX_STRIKES } = threeStrikesWedgeConfig;

function randomTargetDistanceM(): number {
  const min = threeStrikesWedgeConfig.targetMinM;
  const max = threeStrikesWedgeConfig.targetMaxM;
  const span = max - min;
  const value = min + Math.random() * span;
  return Math.round(value * 10) / 10;
}

function normalizeMetresInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function parseMetres(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** The epsilon keeps a miss of exactly the window (e.g. 64.2 vs 61.2) a hit despite float error. */
function isHit(diff: number): boolean {
  return diff <= HIT_WINDOW_M + 1e-9;
}

async function persistThreeStrikesSession(userId: string, hits: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const payload = {
      version: 1,
      total_hits: hits,
      max_strikes: threeStrikesWedgeConfig.maxStrikes,
      hit_window_m: threeStrikesWedgeConfig.hitWindowM,
    };

    const insertRes = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: threeStrikesWedgeConfig.practiceLogType,
      score: hits,
      total_points: hits,
      notes: JSON.stringify(payload),
    });
    if (!insertRes.ok) return insertRes.message;
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    return formatSupabaseWriteError(e);
  }
}

type StrikeShot = {
  shot: number;
  targetM: number;
  actualM: number;
  diff: number;
  hit: boolean;
};

const CARRY_OFFSETS = [-8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8] as const;

/** Whole-metre quick picks around the target; the "Other" box takes exact carries. */
function carryChips(targetM: number): number[] {
  const base = Math.round(targetM);
  return CARRY_OFFSETS.map((o) => base + o).filter((v) => v >= 0);
}

function fmtM(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function missSide(s: Pick<StrikeShot, "targetM" | "actualM">): "short" | "long" | "on the number" {
  if (s.actualM < s.targetM) return "short";
  if (s.actualM > s.targetM) return "long";
  return "on the number";
}

function shotTone(s: StrikeShot): string {
  return s.hit ? "bg-[#014421] text-white" : "bg-red-500 text-white";
}

function trailingHits(shots: StrikeShot[]): number {
  let n = 0;
  for (let i = shots.length - 1; i >= 0 && shots[i]!.hit; i--) n++;
  return n;
}

const BANDS = [
  { label: "Under 50 m", phrase: "shots under 50 m", test: (m: number) => m < 50 },
  { label: "50 to 75 m", phrase: "shots from 50 to 75 m", test: (m: number) => m >= 50 && m < 75 },
  { label: "75 m and up", phrase: "shots of 75 m and up", test: (m: number) => m >= 75 },
] as const;

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: StrikeShot[]) {
  const n = shots.length;
  const hits = shots.filter((s) => s.hit).length;
  const strikeShots = shots.filter((s) => !s.hit);
  const shortStrikes = strikeShots.filter((s) => s.actualM < s.targetM);
  const longStrikes = strikeShots.filter((s) => s.actualM > s.targetM);
  const avgOf = (xs: StrikeShot[]) => (xs.length ? xs.reduce((a, s) => a + s.diff, 0) / xs.length : 0);

  let bestStreak = 0;
  let run = 0;
  for (const s of shots) {
    run = s.hit ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const bands = BANDS.map((b) => {
    const inBand = shots.filter((s) => b.test(s.targetM));
    return { label: b.label, phrase: b.phrase, made: inBand.filter((s) => s.hit).length, asked: inBand.length };
  }).filter((b) => b.asked > 0);
  const rate = (b: { made: number; asked: number }) => b.made / b.asked;
  const ranked = bands.filter((b) => b.asked >= 2).sort((a, b) => rate(a) - rate(b) || b.asked - a.asked);
  const worstBand =
    ranked.length > 0 && rate(ranked[0]!) < 1 && bands.some((b) => rate(b) > rate(ranked[0]!)) ? ranked[0]! : null;

  const sideFocus = (xs: StrikeShot[], side: "short" | "long") => ({
    title: side === "short" ? "Focus next: carry it all the way" : "Focus next: taking speed off",
    lines: [
      `${xs.length} of your ${strikeShots.length} strikes came up ${side}, by ${avgOf(xs).toFixed(1)} m on average.`,
      side === "short"
        ? "Pick the swing that flies past the flag, not just to it."
        : "Shorten the backswing rather than slowing down through the ball.",
    ],
  });

  let focus: { title: string; lines: string[] };
  if (strikeShots.length > 0 && (shortStrikes.length === strikeShots.length || longStrikes.length === strikeShots.length)) {
    focus = sideFocus(shortStrikes.length ? shortStrikes : longStrikes, shortStrikes.length ? "short" : "long");
  } else if (worstBand) {
    focus = {
      title: `Focus next: ${worstBand.phrase}`,
      lines: [
        `You hit ${worstBand.made} of ${worstBand.asked} ${worstBand.phrase}, your toughest range.`,
        "Hit 10 balls into that range and note how far each swing length carries.",
      ],
    };
  } else if (shortStrikes.length > longStrikes.length) {
    focus = sideFocus(shortStrikes, "short");
  } else if (longStrikes.length > shortStrikes.length) {
    focus = sideFocus(longStrikes, "long");
  } else {
    focus = {
      title: "Focus next: tighter carries",
      lines: [`Your misses averaged ${avgOf(shots).toFixed(1)} m.`, "Groove a half, three-quarter and full swing, and learn the carry of each."],
    };
  }
  if (bestStreak >= 3) focus.lines.push(`Strength: ${bestStreak} hits in a row.`);

  return {
    hits,
    hitPct: n ? Math.round((hits / n) * 100) : 0,
    bestStreak,
    avgMiss: avgOf(shots),
    strikeShots,
    short: shots.filter((s) => s.actualM < s.targetM).length,
    long: shots.filter((s) => s.actualM > s.targetM).length,
    bands,
    worstBand: worstBand?.label ?? null,
    focus,
  };
}

const MAP_RANGE_M = 12;
const DOT_ROW_PX = 26;
/** In metres; dots closer than this go on the next row up. */
const MIN_DOT_GAP_M = 2;

const mapPct = (x: number) => 50 + (Math.max(-MAP_RANGE_M, Math.min(MAP_RANGE_M, x)) / MAP_RANGE_M) * 46;

/** Short-to-long picture of every shot with the hit zone shaded, numbered by shot. Misses past 12 m sit on the edge. */
function ShortLongMap({ shots }: { shots: StrikeShot[] }) {
  const placed: { x: number; row: number }[] = [];
  const dots = [...shots]
    .map((s) => ({ s, x: Math.max(-MAP_RANGE_M, Math.min(MAP_RANGE_M, s.actualM - s.targetM)) }))
    .sort((a, b) => a.x - b.x)
    .map(({ s, x }) => {
      let row = 0;
      while (placed.some((p) => p.row === row && Math.abs(p.x - x) < MIN_DOT_GAP_M)) row++;
      placed.push({ x, row });
      return { s, x, row };
    });
  const rows = Math.max(1, ...placed.map((p) => p.row + 1));
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-red-50" style={{ height: rows * DOT_ROW_PX + 16 }}>
        <div
          className="absolute inset-y-0 bg-green-100"
          style={{ left: `${mapPct(-HIT_WINDOW_M)}%`, width: `${mapPct(HIT_WINDOW_M) - mapPct(-HIT_WINDOW_M)}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#014421]/40" />
        {dots.map(({ s, x, row }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${shotTone(s)}`}
            style={{ left: `${mapPct(x)}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`Shot ${s.shot}: ${s.diff.toFixed(1)} m ${missSide(s)}`}
          >
            {s.shot}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0">Short</span>
        {[-8, -HIT_WINDOW_M, HIT_WINDOW_M, 8].map((m) => (
          <span key={m} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${mapPct(m)}%` }}>
            {Math.abs(m)}
          </span>
        ))}
        <span className="absolute left-1/2 -translate-x-1/2 text-[#014421]">Target</span>
        <span className="absolute right-0">Long</span>
      </div>
    </div>
  );
}

function StrikeDots({ used }: { used: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${used} of ${MAX_STRIKES} strikes`}>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            i < used ? "bg-red-500 text-white" : "bg-gray-100 text-gray-300 ring-1 ring-gray-200"
          }`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </span>
      ))}
    </span>
  );
}

export function ThreeStrikesWedgeRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<StrikeShot[]>([]);
  const [targetM, setTargetM] = useState<number | null>(null);
  const [actualInput, setActualInput] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const hits = shots.filter((s) => s.hit).length;
  const strikes = shots.length - hits;

  const startTest = useCallback(() => {
    persistAttemptedRef.current = false;
    setSaveError(null);
    setSaved(false);
    setShots([]);
    setActualInput("");
    setTargetM(randomTargetDistanceM());
    setStatus("active");
  }, []);

  const save = useCallback(
    async (totalHits: number) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      if (persistAttemptedRef.current) return;
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistThreeStrikesSession(userId, totalHits);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active" || targetM === null) return;
    const actual = parseMetres(actualInput);
    if (actual === null) return;
    const diff = Math.abs(targetM - actual);
    const next = [...shots, { shot: shots.length + 1, targetM, actualM: actual, diff, hit: isHit(diff) }];
    setShots(next);
    setActualInput("");

    if (next.filter((s) => !s.hit).length >= MAX_STRIKES) {
      setStatus("complete");
      await save(next.filter((s) => s.hit).length);
      return;
    }
    setTargetM(randomTargetDistanceM());
  }, [status, targetM, actualInput, shots, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setTargetM(last.targetM);
    setActualInput(String(last.actualM));
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" && shots.length > 0 ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={threeStrikesWedgeConfig.testName}
          kicker="Wedge combine"
          art={<IronHeroArt />}
          chips={[
            `±${HIT_WINDOW_M} m to score`,
            `${threeStrikesWedgeConfig.targetMinM} to ${threeStrikesWedgeConfig.targetMaxM} m`,
            "~10 min",
            "Most hits wins",
          ]}
        />
        <IntroSteps
          steps={[
            {
              icon: <Flag className="h-5 w-5" aria-hidden />,
              title: "Get a random target",
              hint: `Anywhere from ${threeStrikesWedgeConfig.targetMinM} to ${threeStrikesWedgeConfig.targetMaxM} m`,
            },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Hit it and enter your carry", hint: "Use a launch monitor or rangefinder" },
            { icon: <X className="h-5 w-5" aria-hidden />, title: `${MAX_STRIKES} strikes and you're out`, hint: "Keep scoring hits until then" },
          ]}
        />
        <ScoringGuide title="How it works">
          <ul className="space-y-1.5">
            <li>Carry it within {HIT_WINDOW_M} m of the target, short or long: that&apos;s a hit.</li>
            <li>Any further away is a strike.</li>
            <li>Collect {MAX_STRIKES} strikes and the game is over.</li>
            <li className="font-semibold text-gray-900">Your score is the number of hits. Higher is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const n = shots.length;
    return (
      <div className="space-y-4">
        <ResultHero>
          <p className="mt-3 text-6xl font-extrabold tabular-nums leading-none">{summary.hits}</p>
          <p className="mt-1 text-sm font-semibold text-white/80">
            hit{summary.hits === 1 ? "" : "s"} before {MAX_STRIKES} strikes
          </p>
          <p className="mt-2 text-xs text-white/70">{n} shots · higher is better</p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Hit rate", value: `${summary.hitPct}%` },
            { label: "Best streak", value: summary.bestStreak, sub: "hits in a row" },
            { label: "Avg miss", value: `${summary.avgMiss.toFixed(1)} m` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Short or long" aside={`Short ${summary.short} · Long ${summary.long}`}>
          <ShortLongMap shots={shots} />
          <p className="mt-2 text-xs text-gray-600">The green zone is a hit. Red dots were strikes.</p>
        </BreakdownCard>

        <BreakdownCard title="By distance" aside="Hits / shots">
          <div className="space-y-3">
            {summary.bands.map((b) => (
              <RateRow key={b.label} label={b.label} made={b.made} total={b.asked} flag={b.label === summary.worstBand ? "Toughest" : null} />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="What ended the run">
          <ul className="space-y-1.5">
            {summary.strikeShots.map((s, i) => (
              <li key={s.shot} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-gray-600">
                  Shot {s.shot}: {fmtM(s.targetM)} m target
                </span>
                <span className="shrink-0 font-bold tabular-nums text-gray-900">
                  {s.diff.toFixed(1)} m {missSide(s)}
                </span>
              </li>
            ))}
          </ul>
        </BreakdownCard>

        <EveryShotList>
          {shots.map((s) => (
            <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-14 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold tabular-nums text-gray-800">
                {fmtM(s.targetM)} m
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-600">
                Carried {fmtM(s.actualM)} m · {s.diff.toFixed(1)} m {missSide(s)}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${shotTone(s)}`}>{s.hit ? "Hit" : "Strike"}</span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(summary.hits) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const shotNumber = shots.length + 1;
  const last = shots[shots.length - 1];
  const streak = trailingHits(shots);
  const actual = parseMetres(actualInput);
  const previewDiff = actual !== null && targetM !== null ? Math.abs(targetM - actual) : null;
  const previewHit = previewDiff !== null && isHit(previewDiff);
  const endsRun = previewDiff !== null && !previewHit && strikes + 1 >= MAX_STRIKES;
  const strikesLeft = MAX_STRIKES - strikes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {hits} hit{hits === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          {strikesLeft} {strikesLeft === 1 ? "life" : "lives"} left
          <StrikeDots used={strikes} />
        </span>
      </div>

      {shots.length > 0 && (
        <ol className="flex flex-wrap gap-1" aria-label="Shots">
          {shots.map((s) => (
            <li
              key={s.shot}
              className={`flex h-7 min-w-9 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${shotTone(s)}`}
              aria-label={`Shot ${s.shot}: ${s.hit ? "hit" : "strike"}, ${s.diff.toFixed(1)} m ${missSide(s)}`}
            >
              {s.diff.toFixed(1)}
            </li>
          ))}
          <li
            aria-current="step"
            className="flex h-7 min-w-9 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-[#014421] ring-2 ring-[#FFA500]"
          >
            {shotNumber}
          </li>
        </ol>
      )}

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Shot {shotNumber}</p>
            {streak >= 2 && (
              <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                <Flame className="h-3 w-3" aria-hidden />
                {streak} in a row
              </span>
            )}
          </div>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {targetM !== null ? targetM.toFixed(1) : "–"}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          {targetM !== null && (
            <p className="mt-1 text-xs font-semibold text-gray-500">
              Hit zone {(targetM - HIT_WINDOW_M).toFixed(1)} to {(targetM + HIT_WINDOW_M).toFixed(1)} m
            </p>
          )}
          <p className={`mt-1 text-sm font-semibold ${last && !last.hit ? "text-red-600" : "text-[#014421]"}`}>
            {last
              ? last.hit
                ? `Hit! ${last.diff.toFixed(1)} m off`
                : `Strike ${strikes}: ${last.diff.toFixed(1)} m ${missSide(last)}`
              : `Land within ${HIT_WINDOW_M} m`}
          </p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      {targetM !== null && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How far did it carry?</p>
          <NumberChips
            values={carryChips(targetM)}
            value={actualInput}
            onChange={(v) => setActualInput(normalizeMetresInput(v))}
            unit="m"
            ariaLabel="Carry distance in metres"
            columns={6}
          />
        </div>
      )}

      <PrimaryButton onClick={() => void recordShot()} disabled={previewDiff === null}>
        {endsRun ? "Finish the test" : "Next shot"}
        {previewDiff !== null && (
          <span className="block text-xs font-semibold text-white/70">
            {previewHit
              ? `Hit, ${previewDiff.toFixed(1)} m off`
              : endsRun
                ? `Strike ${MAX_STRIKES}, ${previewDiff.toFixed(1)} m off ends the game`
                : `Strike, ${previewDiff.toFixed(1)} m off`}
          </span>
        )}
      </PrimaryButton>
    </div>
  );
}
