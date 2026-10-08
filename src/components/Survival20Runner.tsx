"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Flag, Ruler, ShieldHalf } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { survival20Config } from "@/lib/survival20Config";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
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
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";
import { CARD_ART_CLASS } from "@/components/combine/CombineArt";

function randomTargetDistanceM(): number {
  const { targetMinM, targetMaxM } = survival20Config;
  const span = targetMaxM - targetMinM;
  const t = targetMinM + Math.random() * span;
  return Math.round(t * 10) / 10;
}

function normalizeMetresInput(raw: string): string {
  let t = raw.replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  if (dot !== -1) {
    t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
  }
  return t;
}

function parseMetres(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type Survival20Metadata = {
  version: 1;
  streak_shots: number;
};

async function persistSurvivalSession(userId: string, streakShots: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const score = streakShots;
    const payload: Survival20Metadata = {
      version: 1,
      streak_shots: streakShots,
    };

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: survival20Config.practiceLogType,
      score,
      total_points: score,
      notes: JSON.stringify(payload),
    });

    if (error) {
      console.warn("[Survival20] practice_logs insert:", formatSupabaseWriteError(error));
      return formatSupabaseWriteError(error);
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[Survival20] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

type SurvivalShot = {
  shot: number;
  targetM: number;
  actualM: number;
  diff: number;
  bufferBefore: number;
  /** Can go below zero on the shot that ends the run. */
  bufferAfter: number;
};

const START_BUFFER = survival20Config.initialBufferM;
const CARRY_OFFSETS = [-8, -5, -3, -2, -1, 0, 1, 2, 3, 5, 8] as const;

/** Whole-metre quick picks around the target; the "Other" box takes exact carries. */
function carryChips(targetM: number): number[] {
  const base = Math.round(targetM);
  return CARRY_OFFSETS.map((o) => base + o).filter((v) => v >= 0);
}

function fmtM(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function missSide(s: Pick<SurvivalShot, "targetM" | "actualM">): "short" | "long" | "on the number" {
  if (s.actualM < s.targetM) return "short";
  if (s.actualM > s.targetM) return "long";
  return "on the number";
}

function bufferBarTone(bufferM: number): "green" | "yellow" | "red" {
  if (bufferM > 10) return "green";
  if (bufferM > 2) return "yellow";
  return "red";
}

const BUFFER_TONE: Record<ReturnType<typeof bufferBarTone>, string> = {
  green: "bg-[#014421]",
  yellow: "bg-amber-400",
  red: "bg-red-600",
};

function missTone(diff: number): string {
  if (diff <= 2) return "bg-[#014421] text-white";
  if (diff <= 4) return "bg-green-200 text-[#014421]";
  if (diff <= 8) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

const BANDS = [
  { label: "Under 50 m", phrase: "shots under 50 m", test: (m: number) => m < 50 },
  { label: "50 to 75 m", phrase: "shots from 50 to 75 m", test: (m: number) => m >= 50 && m < 75 },
  { label: "75 m and up", phrase: "shots of 75 m and up", test: (m: number) => m >= 75 },
] as const;

const sumDiff = (xs: SurvivalShot[]) => xs.reduce((a, s) => a + s.diff, 0);

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: SurvivalShot[]) {
  const n = shots.length;
  const last = shots[n - 1]!;
  const streak = shots.filter((s) => s.bufferAfter > 0).length;
  const short = shots.filter((s) => s.actualM < s.targetM);
  const long = shots.filter((s) => s.actualM > s.targetM);
  const shortLost = sumDiff(short);
  const longLost = sumDiff(long);
  const avgMiss = sumDiff(shots) / n;

  const bands = BANDS.map((b) => {
    const inBand = shots.filter((s) => b.test(s.targetM));
    return { label: b.label, phrase: b.phrase, n: inBand.length, avg: inBand.length ? sumDiff(inBand) / inBand.length : 0 };
  }).filter((b) => b.n > 0);
  const ranked = [...bands].sort((a, b) => b.avg - a.avg);
  const worstBand = ranked.length > 1 && ranked[0]!.avg > ranked[ranked.length - 1]!.avg ? ranked[0]! : null;

  let focus: { title: string; lines: string[] };
  if (n === 1) {
    focus = {
      title: "Focus next: the first shot",
      lines: [
        `One ${last.diff.toFixed(1)} m miss on a ${fmtM(last.targetM)} m target used the whole buffer.`,
        "Make a practice swing that feels the right length, then commit to it.",
      ],
    };
  } else if (shortLost > longLost * 1.5 && short.length >= 2) {
    focus = {
      title: "Focus next: carry it all the way",
      lines: [
        `${short.length} of ${n} shots came up short, costing ${shortLost.toFixed(1)} m of buffer.`,
        "Pick the swing that flies past the flag, not just to it. Short is the most common wedge miss.",
      ],
    };
  } else if (longLost > shortLost * 1.5 && long.length >= 2) {
    focus = {
      title: "Focus next: taking speed off",
      lines: [
        `${long.length} of ${n} shots flew long, costing ${longLost.toFixed(1)} m of buffer.`,
        "Shorten the backswing rather than slowing down through the ball.",
      ],
    };
  } else if (worstBand) {
    focus = {
      title: `Focus next: ${worstBand.phrase}`,
      lines: [
        `Your ${worstBand.phrase} missed by ${worstBand.avg.toFixed(1)} m on average, the most of any range.`,
        "Hit 10 balls into that range and note how far each swing length carries.",
      ],
    };
  } else {
    focus = {
      title: "Focus next: tighter carries",
      lines: [`You missed by ${avgMiss.toFixed(1)} m on average.`, "Groove a half, three-quarter and full swing, and learn the carry of each."],
    };
  }
  if (n > 1) {
    focus.lines.push(`The run ended on a ${last.diff.toFixed(1)} m miss with ${last.bufferBefore.toFixed(1)} m of buffer left.`);
  }

  return {
    streak,
    last,
    avgMiss,
    closest: Math.min(...shots.map((s) => s.diff)),
    inside2: shots.filter((s) => s.diff <= 2).length,
    short: short.length,
    long: long.length,
    shortLost,
    longLost,
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

/** Short-to-long picture of every shot against the target, numbered by shot. Misses past 12 m sit on the edge. */
function ShortLongMap({ shots }: { shots: SurvivalShot[] }) {
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
  const bands = [
    { w: 8, tone: "bg-amber-50" },
    { w: 4, tone: "bg-amber-100" },
    { w: 2, tone: "bg-green-100" },
  ];
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-red-50" style={{ height: rows * DOT_ROW_PX + 16 }}>
        {bands.map((b) => (
          <div
            key={b.w}
            className={`absolute inset-y-0 ${b.tone}`}
            style={{ left: `${mapPct(-b.w)}%`, width: `${mapPct(b.w) - mapPct(-b.w)}%` }}
          />
        ))}
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#014421]/40" />
        {dots.map(({ s, x, row }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${missTone(s.diff)}`}
            style={{ left: `${mapPct(x)}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`Shot ${s.shot}: ${s.diff.toFixed(1)} m ${missSide(s)}`}
          >
            {s.shot}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0">Short</span>
        {[-8, -4, 4, 8].map((m) => (
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

/** One bar per shot showing the buffer left afterwards, starting from the full buffer. */
function BufferChart({ shots }: { shots: SurvivalShot[] }) {
  const levels = [START_BUFFER, ...shots.map((s) => Math.max(0, s.bufferAfter))];
  return (
    <div>
      <div className="flex h-20 items-end gap-0.5">
        {levels.map((b, i) => (
          <div
            key={i}
            className={`min-w-[3px] flex-1 rounded-t ${BUFFER_TONE[bufferBarTone(b)]}`}
            style={{ height: `${Math.max(4, (b / START_BUFFER) * 100)}%` }}
            title={i === 0 ? `Start: ${b} m` : `After shot ${i}: ${b.toFixed(1)} m`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-gray-400">
        <span>Start</span>
        <span>Shot {shots.length}</span>
      </div>
    </div>
  );
}

function RunTrail({ shots, current }: { shots: SurvivalShot[]; current: ReactNode }) {
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Shots">
      {shots.map((s) => (
        <li
          key={s.shot}
          className={`flex h-7 min-w-9 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${missTone(s.diff)}`}
          aria-label={`Shot ${s.shot}: ${s.diff.toFixed(1)} m ${missSide(s)}`}
        >
          {s.diff.toFixed(1)}
        </li>
      ))}
      <li
        aria-current="step"
        className="flex h-7 min-w-9 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-[#014421] ring-2 ring-[#FFA500]"
      >
        {current}
      </li>
    </ol>
  );
}

export function Survival20Runner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<SurvivalShot[]>([]);
  const [targetM, setTargetM] = useState<number | null>(null);
  const [actualInput, setActualInput] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const bufferM = shots.length ? Math.max(0, shots[shots.length - 1]!.bufferAfter) : START_BUFFER;
  const streak = shots.filter((s) => s.bufferAfter > 0).length;

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
    async (streakShots: number) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      if (persistAttemptedRef.current) return;
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSurvivalSession(userId, streakShots);
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
    const nextBuf = Math.round((bufferM - diff) * 10) / 10;
    const next = [...shots, { shot: shots.length + 1, targetM, actualM: actual, diff, bufferBefore: bufferM, bufferAfter: nextBuf }];
    setShots(next);
    setActualInput("");

    if (nextBuf <= 0) {
      setStatus("complete");
      await save(next.length - 1);
      return;
    }
    setTargetM(randomTargetDistanceM());
  }, [status, targetM, actualInput, bufferM, shots, save]);

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
          title={survival20Config.testName}
          kicker="Wedge combine"
          art={<IronHeroArt />}
          chips={[
            `${START_BUFFER} m buffer`,
            `${survival20Config.targetMinM} to ${survival20Config.targetMaxM} m`,
            "~10 min",
            "Longest streak wins",
          ]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Get a random target", hint: `Anywhere from ${survival20Config.targetMinM} to ${survival20Config.targetMaxM} m` },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Hit it and enter your carry", hint: "Use a launch monitor or rangefinder" },
            { icon: <ShieldHalf className="h-5 w-5" aria-hidden />, title: "Protect your buffer", hint: "Every metre off comes out of it" },
          ]}
        />
        <ScoringGuide title="How it works">
          <ul className="space-y-1.5">
            <li>You start with a {START_BUFFER} m buffer.</li>
            <li>After each shot, the gap between the target and your carry comes off it. 5 m short and 5 m long both cost 5 m.</li>
            <li>When the buffer hits zero the run is over.</li>
            <li className="font-semibold text-gray-900">Your score is the shots you survived before that. Higher is better.</li>
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
          <p className="mt-3 text-6xl font-extrabold tabular-nums leading-none">{summary.streak}</p>
          <p className="mt-1 text-sm font-semibold text-white/80">shot{summary.streak === 1 ? "" : "s"} survived</p>
          <p className="mt-2 text-xs text-white/70">Survival streak · higher is better</p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg miss", value: `${summary.avgMiss.toFixed(1)} m` },
            { label: "Closest", value: `${summary.closest.toFixed(1)} m` },
            { label: "Inside 2 m", value: `${summary.inside2}/${n}` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your buffer went" aside={`${START_BUFFER} m to start`}>
          <BreakdownBar
            segments={[
              { label: `Short (${summary.short})`, value: Math.round(summary.shortLost * 10) / 10, tone: "bg-sky-400" },
              { label: `Long (${summary.long})`, value: Math.round(summary.longLost * 10) / 10, tone: "bg-[#FFA500]" },
            ]}
          />
          <div className="mt-3">
            <ShortLongMap shots={shots} />
          </div>
        </BreakdownCard>

        <BreakdownCard title="Buffer over the run">
          <BufferChart shots={shots} />
        </BreakdownCard>

        <BreakdownCard title="By distance" aside="Avg miss">
          <div className="space-y-3">
            {summary.bands.map((b) => (
              <ValueRow
                key={b.label}
                label={`${b.label} (${b.n})`}
                value={b.avg}
                max={10}
                display={`${b.avg.toFixed(1)} m`}
                lowerIsBetter
                flag={b.label === summary.worstBand ? "Work on" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="What ended the run" aside={`Shot ${summary.last.shot}`}>
          <p className="text-sm text-gray-700">
            A {fmtM(summary.last.targetM)} m target, carried {fmtM(summary.last.actualM)} m:{" "}
            <span className="font-bold text-gray-900">
              {summary.last.diff.toFixed(1)} m {missSide(summary.last)}
            </span>{" "}
            with {summary.last.bufferBefore.toFixed(1)} m of buffer left.
          </p>
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
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white ${BUFFER_TONE[bufferBarTone(Math.max(0, s.bufferAfter))]}`}
              >
                {Math.max(0, s.bufferAfter).toFixed(1)} m
              </span>
            </li>
          ))}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(summary.streak) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const shotNumber = shots.length + 1;
  const last = shots[shots.length - 1];
  const actual = parseMetres(actualInput);
  const previewDiff = actual !== null && targetM !== null ? Math.abs(targetM - actual) : null;
  const endsRun = previewDiff !== null && Math.round((bufferM - previewDiff) * 10) / 10 <= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">Streak {streak}</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <div className="rounded-2xl bg-gray-50 p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Buffer left</p>
          <p className="text-sm font-extrabold tabular-nums text-gray-900">
            {bufferM.toFixed(1)} <span className="text-xs font-semibold text-gray-400">/ {START_BUFFER} m</span>
          </p>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${BUFFER_TONE[bufferBarTone(bufferM)]}`}
            style={{ width: `${Math.max(0, Math.min(100, (bufferM / START_BUFFER) * 100))}%` }}
          />
        </div>
      </div>

      {shots.length > 0 && <RunTrail shots={shots} current={shotNumber} />}

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Shot {shotNumber}</p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {targetM !== null ? targetM.toFixed(1) : "–"}
            <span className="ml-1 text-xl font-bold text-gray-400">m</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">
            {last ? `Last shot: ${last.diff.toFixed(1)} m ${missSide(last)}` : "Land it on the number"}
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
            {endsRun
              ? `${previewDiff.toFixed(1)} m off ends the run`
              : previewDiff === 0
                ? "Dead on, no buffer lost"
                : `This shot costs ${previewDiff.toFixed(1)} m of buffer`}
          </span>
        )}
      </PrimaryButton>
    </div>
  );
}
