"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Flag, Shuffle, Target } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  BALL_LABEL,
  BUNKER_LIES_PAR,
  bunkerLiesConfig as CFG,
  buildBunkerLies,
  FIRST_SHOT_LABEL,
  formatToPar,
  LIE_TIPS,
  lieTitle,
  minStrokes,
  PASS_LIE,
  SAND_LABEL,
  SLOPE_LABEL,
  strokesLabel,
  type BallLie,
  type BunkerLie,
  type BunkerLieHole,
  type FirstShot,
  type SandLie,
  type SlopeLie,
} from "@/lib/bunkerLiesConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
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
import { BreakdownCard, EveryShotList, FocusCard } from "@/components/combine/CombineBreakdown";
import { BunkerShotDiagram, CARD_ART_CLASS, HERO_ART_CLASS } from "@/components/combine/CombineArt";

const FIRST_SHOTS: FirstShot[] = ["holed", "green", "missed_green", "stayed_in"];

function toParTone(toPar: number): string {
  if (toPar < 0) return "bg-[#014421] text-white";
  if (toPar === 0) return "bg-green-200 text-[#014421]";
  if (toPar === 1) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

type Condition = { key: SlopeLie | SandLie | BallLie; label: string; group: "Slope" | "Sand" | "Ball" };

function conditionsOf(lie: BunkerLie): Condition[] {
  return [
    { key: lie.slope, label: SLOPE_LABEL[lie.slope], group: "Slope" },
    { key: lie.sand, label: SAND_LABEL[lie.sand], group: "Sand" },
    { key: lie.ball, label: BALL_LABEL[lie.ball], group: "Ball" },
  ];
}

function breakdown(holes: BunkerLieHole[]) {
  const strokes = holes.reduce((sum, h) => sum + h.strokes, 0);
  const par = holes.length * CFG.parPerHole;
  const upDowns = holes.filter((h) => h.strokes <= CFG.parPerHole).length;
  const outFirst = holes.filter((h) => h.first !== "stayed_in").length;
  const holed = holes.filter((h) => h.first === "holed").length;
  const passed = holes.filter((h) => h.passed).length;

  const byCondition = new Map<string, { label: string; group: string; key: Condition["key"]; n: number; overPar: number; upDowns: number }>();
  for (const h of holes) {
    if (h.passed) continue;
    for (const c of conditionsOf(h)) {
      if (c.key === "flat" || c.key === "normal") continue;
      const row = byCondition.get(c.key) ?? { label: c.label, group: c.group, key: c.key, n: 0, overPar: 0, upDowns: 0 };
      row.n += 1;
      row.overPar += h.strokes - CFG.parPerHole;
      if (h.strokes <= CFG.parPerHole) row.upDowns += 1;
      byCondition.set(c.key, row);
    }
  }
  const conditions = [...byCondition.values()].map((c) => ({ ...c, avg: c.overPar / c.n }));
  const worst = [...conditions].sort((a, b) => b.avg - a.avg || b.n - a.n)[0] ?? null;

  let focus: { title: string; lines: string[] };
  if (strokes - par <= -1 || (worst && worst.avg <= 0)) {
    focus = {
      title: "Every lie handled",
      lines: [`You got up and down ${upDowns} of ${holes.length} times. Move the flag closer to the lip next time to make it harder.`],
    };
  } else if (worst) {
    focus = {
      title: `Focus next: ${worst.label.toLowerCase()}`,
      lines: [
        `${worst.label} cost you ${formatToPar(worst.overPar)} over ${worst.n} hole${worst.n === 1 ? "" : "s"} (${worst.upDowns} up and down).`,
        LIE_TIPS[worst.key],
      ],
    };
  } else {
    focus = { title: "Focus next: get up and down", lines: [`You got up and down ${upDowns} of ${holes.length} times.`] };
  }

  return { strokes, par, toPar: strokes - par, upDowns, outFirst, holed, passed, conditions, focus };
}

async function persistSession(userId: string, holes: BunkerLieHole[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const strokes = holes.reduce((sum, h) => sum + h.strokes, 0);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: CFG.practiceLogType,
      score: strokes,
      total_points: strokes,
      strike_data: holes.map(({ hole, slope, sand, ball, passed, first, strokes: s }) => ({ hole, slope, sand, ball, passed, first, strokes: s })),
    });
    if (!res.ok) {
      console.warn("[BunkerLies] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[BunkerLies] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function BunkerLiesReport({ holes }: { holes: BunkerLieHole[] }) {
  const summary = breakdown(holes);
  const groups = (["Slope", "Sand", "Ball"] as const)
    .map((g) => ({ group: g, rows: summary.conditions.filter((c) => c.group === g) }))
    .filter((g) => g.rows.length > 0);
  return (
    <>
      <ResultHero>
        <ScoreRing pct={summary.upDowns / holes.length} value={formatToPar(summary.toPar)} caption={`${summary.strokes} strokes · par ${summary.par}`} />
        <p className="mt-2 text-xs text-white/70">
          {summary.upDowns} of {holes.length} up and down · lower is better
        </p>
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Up & down", value: `${summary.upDowns}/${holes.length}` },
          { label: "Out first go", value: `${summary.outFirst}/${holes.length}` },
          { label: "Holed", value: summary.holed, sub: summary.passed ? `${summary.passed} passed` : null },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      {groups.length > 0 && (
        <BreakdownCard title="By lie" aside="Over par · up & downs">
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.group}</p>
                <ul className="space-y-1">
                  {g.rows.map((c) => (
                    <li key={c.key} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">{c.label}</span>
                      <span className="text-xs text-gray-500">
                        {c.upDowns}/{c.n} up &amp; down
                      </span>
                      <span className={`w-10 shrink-0 rounded-full py-0.5 text-center text-xs font-bold tabular-nums ${toParTone(c.overPar)}`}>
                        {formatToPar(c.overPar)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </BreakdownCard>
      )}

      <EveryShotList title="Every hole">
        {holes.map((h) => (
          <li key={h.hole} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-7 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{h.hole}</span>
            <span className="min-w-0 flex-1 text-gray-600">
              <span className="block truncate font-semibold text-gray-800">
                {h.passed ? "Passed: flat, good lie" : lieTitle(h)}
              </span>
              <span className="block truncate text-xs">{FIRST_SHOT_LABEL[h.first]}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${toParTone(h.strokes - CFG.parPerHole)}`}>
              {strokesLabel(h.strokes)}
            </span>
          </li>
        ))}
      </EveryShotList>
    </>
  );
}

export function BunkerLiesRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = CFG.holeCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [lies, setLies] = useState<BunkerLie[]>([]);
  const [passedNow, setPassedNow] = useState(false);
  const [first, setFirst] = useState<FirstShot | null>(null);
  const [strokes, setStrokes] = useState<number | null>(null);
  const [holes, setHoles] = useState<BunkerLieHole[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const resetHole = () => {
    setPassedNow(false);
    setFirst(null);
    setStrokes(null);
  };

  const startTest = useCallback(() => {
    setLies(buildBunkerLies());
    setHoles([]);
    resetHole();
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: BunkerLieHole[]) => {
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

  const holeIndex = holes.length;
  const lie: BunkerLie = passedNow ? PASS_LIE : (lies[holeIndex] ?? PASS_LIE);
  const effStrokes = first === "holed" ? 1 : strokes;

  const recordHole = useCallback(async () => {
    if (status !== "active" || first == null || effStrokes == null) return;
    const next = [...holes, { hole: holeIndex + 1, ...lie, passed: passedNow, first, strokes: effStrokes }];
    setHoles(next);
    resetHole();
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, first, effStrokes, holes, holeIndex, lie, passedNow, total, save]);

  const undoLastHole = useCallback(() => {
    if (status !== "active" || holes.length === 0) return;
    const last = holes[holes.length - 1]!;
    setHoles((h) => h.slice(0, -1));
    setPassedNow(last.passed);
    setFirst(last.first);
    setStrokes(last.first === "holed" ? null : last.strokes);
  }, [status, holes]);

  const summary = useMemo(() => (status === "complete" ? breakdown(holes) : null), [status, holes]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={CFG.testName}
          kicker="Bunker combine"
          art={<BunkerShotDiagram className={HERO_ART_CLASS} />}
          chips={[`${total} lies`, "5–10 m", "~20 min", "Lowest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Pick one flag 5–10 m away", hint: "With room for a medium roll out. Every shot goes to it" },
            { icon: <Shuffle className="h-5 w-5" aria-hidden />, title: "Set up the lie the app gives you", hint: "Slopes, hard or soft sand, sitting down, plugged. Pass if you can't" },
            { icon: <Target className="h-5 w-5" aria-hidden />, title: "Play the ball out", hint: "Count every shot until it's in the hole" },
          ]}
        />
        <ScoringGuide title="How scoring works">
          <ul className="space-y-1.5">
            <li>Par is 2 on every hole: out and one putt</li>
            <li>Your score is total strokes for the 9 holes against par {BUNKER_LIES_PAR}</li>
            <li>Can&apos;t set up a lie (no slope in your bunker, say)? Tap Pass and play that hole from a flat, good lie instead</li>
            <li className="font-semibold text-gray-900">Lower is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <BunkerLiesReport holes={holes} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(holes) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const runningStrokes = holes.reduce((sum, h) => sum + h.strokes, 0);
  const runningToPar = runningStrokes - holes.length * CFG.parPerHole;
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const h = holes[i];
    return h
      ? { label: strokesLabel(h.strokes), tone: toParTone(h.strokes - CFG.parPerHole), ariaLabel: `Hole ${i + 1}: ${h.strokes} strokes` }
      : null;
  });
  const conditions = conditionsOf(lie);
  const tips = conditions.filter((c) => c.key !== "normal" && !(c.key === "flat" && conditions.length > 1)).map((c) => LIE_TIPS[c.key]);
  const strokeOptions = first && first !== "holed" ? Array.from({ length: CFG.maxStrokes - minStrokes(first) + 1 }, (_, i) => minStrokes(first) + i) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {holes.length ? `${formatToPar(runningToPar)} thru ${holes.length}` : "Even"}
        </span>
        <span className="text-xs font-semibold text-gray-500">Lower is better</span>
      </div>

      <ProgressTrack items={track} current={holeIndex} name="Hole" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <BunkerShotDiagram className={CARD_ART_CLASS} />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Hole {holeIndex + 1} of {total} · par 2
          </p>
          <p className="text-2xl font-extrabold leading-tight text-gray-900">{SLOPE_LABEL[lie.slope]}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[SAND_LABEL[lie.sand], BALL_LABEL[lie.ball]].map((t) => (
              <span key={t} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                {t}
              </span>
            ))}
            {passedNow && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">Passed</span>}
          </div>
        </div>
      </div>

      {tips.length > 0 && (
        <details className="rounded-2xl border border-gray-100 px-4 py-3 text-xs text-gray-700">
          <summary className="cursor-pointer text-sm font-semibold text-gray-800">How to play this lie</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}

      {!passedNow && (
        <button
          type="button"
          onClick={() => {
            setPassedNow(true);
            setFirst(null);
            setStrokes(null);
          }}
          className="w-full rounded-2xl border-2 border-dashed border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:border-gray-300"
        >
          Can&apos;t set this lie up? Pass and play a flat, good lie
        </button>
      )}

      {holes.length > 0 && <CombineFlowBackControl onBack={undoLastHole} label="Undo last hole" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did the bunker shot finish?</p>
        <div className="grid grid-cols-2 gap-2">
          {FIRST_SHOTS.map((f) => {
            const active = first === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFirst(f);
                  setStrokes(f === "holed" ? null : minStrokes(f) === CFG.maxStrokes ? CFG.maxStrokes : null);
                }}
                aria-pressed={active}
                className={`rounded-2xl px-2 py-3 text-sm font-bold transition-colors ${
                  active
                    ? f === "stayed_in"
                      ? "bg-red-500 text-white"
                      : "bg-[#014421] text-white"
                    : f === "stayed_in"
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {FIRST_SHOT_LABEL[f]}
              </button>
            );
          })}
        </div>
      </div>

      {strokeOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">Strokes to hole out, including the bunker shot</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${strokeOptions.length}, minmax(0, 1fr))` }}>
            {strokeOptions.map((n) => {
              const active = strokes === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStrokes(n)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active ? toParTone(n - CFG.parPerHole) : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {strokesLabel(n)}
                  {n === CFG.parPerHole && <span className="block text-[10px] font-semibold opacity-70">Up & down</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PrimaryButton onClick={() => void recordHole()} disabled={first == null || effStrokes == null}>
        {holeIndex + 1 >= total ? "Finish the test" : "Next hole"}
        <span className="block text-xs font-semibold text-white/70">
          {first == null
            ? "Where did it finish?"
            : effStrokes == null
              ? "How many strokes?"
              : `${strokesLabel(effStrokes)} stroke${effStrokes === 1 ? "" : "s"} · ${formatToPar(effStrokes - CFG.parPerHole)}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
