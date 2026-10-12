"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Armchair, Dumbbell, PersonStanding, Timer, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { combineHrefForPlayer, useCoachTestingPlayerId, useCombineUser } from "@/hooks/useCombineUser";
import { TestingForSelect } from "@/components/combine/TestingForSelect";
import {
  MOBILITY_AREAS,
  MOBILITY_CHECK_COUNT,
  MOBILITY_RESULT_LABEL,
  MOBILITY_TESTS,
  mobilityScorePct,
  mobilityScreenConfig as CFG,
  mobilityTest,
  type MobilityCheck,
  type MobilityResult,
  type MobilitySide,
} from "@/lib/mobilityScreenConfig";
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
  StatTiles,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { BreakdownCard, EveryShotList, RateRow } from "@/components/combine/CombineBreakdown";
import { HERO_ART_CLASS } from "@/components/combine/CombineArt";
import { MobilityFigure } from "@/components/mobility/MobilityFigures";

type Previous = { pct: number; at: string };
type LoadedPrevious = Previous & { userId: string };

const RESULT_TONE: Record<MobilityResult, { on: string; off: string }> = {
  pass: { on: "bg-[#014421] text-white", off: "bg-green-50 text-[#014421] hover:bg-green-100" },
  limited: { on: "bg-[#FFA500] text-white", off: "bg-amber-50 text-amber-800 hover:bg-amber-100" },
  pain: { on: "bg-red-500 text-white", off: "bg-red-50 text-red-700 hover:bg-red-100" },
};

const SIDE_LABEL: Record<MobilitySide, string> = { left: "Left", right: "Right", both: "" };

const noopSubscribe = () => () => {};

function sidesFor(sided: boolean): MobilitySide[] {
  return sided ? ["left", "right"] : ["both"];
}

function checkLabel(c: MobilityCheck): string {
  const name = mobilityTest(c.test)?.name ?? c.test;
  return c.side === "both" ? name : `${name} (${SIDE_LABEL[c.side].toLowerCase()})`;
}

async function persistScreen(userId: string, checks: MobilityCheck[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: CFG.practiceLogType,
      score: mobilityScorePct(checks),
      total_points: checks.filter((c) => c.result === "pass").length,
      strike_data: checks.map(({ test, side, result }) => ({ test, side, result })),
    });
    if (!res.ok) {
      console.warn("[MobilityScreen] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("practiceSessionsUpdated"));
    return null;
  } catch (e) {
    console.warn("[MobilityScreen] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** The results screen. Coaches see the same report for a saved screen. */
export function MobilityScreenReport({ checks, previous }: { checks: MobilityCheck[]; previous?: Previous | null }) {
  const pct = mobilityScorePct(checks);
  const count = (r: MobilityResult) => checks.filter((c) => c.result === r).length;
  const problems = MOBILITY_TESTS.map((t) => ({ test: t, checks: checks.filter((c) => c.test === t.id && c.result !== "pass") })).filter(
    (p) => p.checks.length > 0,
  );
  const diff = previous ? pct - previous.pct : null;

  return (
    <>
      <ResultHero>
        <ScoreRing pct={pct / 100} value={`${pct}%`} caption={`${count("pass")} of ${checks.length} passed`} />
        {previous && diff != null && (
          <p className="mt-2 text-xs text-white/70">
            {diff === 0 ? "Same as" : diff > 0 ? `Up ${diff}% on` : `Down ${Math.abs(diff)}% on`} your last screen ({formatDate(previous.at)})
          </p>
        )}
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Pass", value: count("pass") },
          { label: "Limited", value: count("limited") },
          { label: "Pain", value: count("pain") },
        ]}
      />

      {count("pain") > 0 && (
        <div className="flex gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            Something hurt during the screen. Don&apos;t train through pain. Get it checked by a physio before working on that
            movement.
          </p>
        </div>
      )}

      <BreakdownCard title="By body area" aside="Passed">
        <div className="space-y-3">
          {MOBILITY_AREAS.map((area) => {
            const inArea = checks.filter((c) => mobilityTest(c.test)?.area === area);
            if (inArea.length === 0) return null;
            return <RateRow key={area} label={area} made={inArea.filter((c) => c.result === "pass").length} total={inArea.length} />;
          })}
        </div>
      </BreakdownCard>

      {problems.length > 0 ? (
        <section className="space-y-2">
          <p className="px-1 text-xs font-bold uppercase tracking-wide text-gray-500">What to work on</p>
          {problems.map(({ test, checks: bad }) => {
            const pain = bad.some((c) => c.result === "pain");
            const sides = bad.map((c) => SIDE_LABEL[c.side]).filter(Boolean).join(" and ");
            return (
              <div key={test.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex items-start gap-3">
                  <MobilityFigure testId={test.id} className="h-14 w-14 shrink-0 rounded-xl bg-gray-50" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{test.name}</p>
                    <p className="text-xs font-semibold text-gray-500">
                      {pain ? "Pain" : "Limited"}
                      {sides ? ` · ${sides}` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">In your swing: </span>
                  {test.swing}
                </p>
                {pain ? (
                  <p className="mt-2 text-sm font-semibold text-red-700">See a physio before doing exercises for this one.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                    {test.exercises.map((ex) => (
                      <li key={ex} className="flex gap-2">
                        <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <div className="rounded-2xl bg-green-50 p-4 text-sm text-[#014421]">
          <p className="font-bold">Every test passed</p>
          <p className="mt-1 text-gray-700">Your body can make the moves the swing needs. Keep it that way and rescreen every month.</p>
        </div>
      )}

      <EveryShotList title="Every test">
        {checks.map((c) => (
          <li key={`${c.test}-${c.side}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-gray-700">{checkLabel(c)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${RESULT_TONE[c.result].on}`}>
              {MOBILITY_RESULT_LABEL[c.result]}
            </span>
          </li>
        ))}
      </EveryShotList>

      <p className="px-1 text-[11px] text-gray-400">This is a movement screen, not a medical diagnosis.</p>
    </>
  );
}

function CountdownTimer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const done = left === 0;
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ${done ? "bg-green-50" : "bg-gray-50"}`}>
      <Timer className={`h-5 w-5 shrink-0 ${done ? "text-[#014421]" : "text-gray-500"}`} aria-hidden />
      <span className="flex-1 text-2xl font-extrabold tabular-nums text-gray-900" aria-live="polite">
        {done ? "Time!" : `${left}s`}
      </span>
      <button
        type="button"
        onClick={() => {
          if (running) {
            setRunning(false);
          } else {
            if (done) setLeft(seconds);
            setRunning(true);
          }
        }}
        className="rounded-xl bg-[#014421] px-4 py-2 text-sm font-bold text-white"
      >
        {running ? "Stop" : done ? "Again" : left < seconds ? "Resume" : "Start"}
      </button>
      {!running && left < seconds && !done && (
        <button type="button" onClick={() => setLeft(seconds)} className="text-xs font-semibold text-gray-500">
          Reset
        </button>
      )}
    </div>
  );
}

export function MobilityScreenRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const { user: signedIn } = useAuth();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isCoach = hydrated && (isCoachEmail(signedIn?.email) || signedIn?.role === "coach");
  const playerId = useCoachTestingPlayerId();
  const router = useRouter();
  const pathname = usePathname();
  const total = MOBILITY_TESTS.length;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [checks, setChecks] = useState<MobilityCheck[]>([]);
  const [current, setCurrent] = useState<Partial<Record<MobilitySide, MobilityResult>>>({});
  const [loadedPrevious, setPrevious] = useState<LoadedPrevious | null>(null);
  const previous = loadedPrevious?.userId === userId ? loadedPrevious : null;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const { data } = await createClient()
          .from("practice_logs")
          .select("score, created_at")
          .eq("user_id", userId)
          .eq("log_type", CFG.practiceLogType)
          .order("created_at", { ascending: false })
          .limit(1);
        const row = data?.[0] as { score?: unknown; created_at?: string } | undefined;
        const pct = Number(row?.score);
        if (!cancelled && row?.created_at && Number.isFinite(pct)) setPrevious({ userId, pct, at: row.created_at });
      } catch {
        /* no previous screen to compare against */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const start = useCallback(() => {
    if (saved && userId && checks.length > 0) {
      setPrevious({ userId, pct: mobilityScorePct(checks), at: new Date().toISOString() });
    }
    setChecks([]);
    setCurrent({});
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, [saved, userId, checks]);

  const screenPlayer = useCallback(
    (id: string | null) => {
      router.replace(id ? combineHrefForPlayer(pathname, id) : pathname);
      setChecks([]);
      setCurrent({});
      setSaveError(null);
      setSaved(false);
      setStatus("intro");
      persistAttemptedRef.current = false;
    },
    [router, pathname],
  );

  const save = useCallback(
    async (all: MobilityCheck[]) => {
      if (!userId) {
        setSaveError("Sign in to save this screen.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistScreen(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const testIndex = MOBILITY_TESTS.findIndex((t) => !checks.some((c) => c.test === t.id));
  const test = testIndex >= 0 ? MOBILITY_TESTS[testIndex] : undefined;
  const sides = test ? sidesFor(test.sided) : [];
  const ready = sides.length > 0 && sides.every((s) => current[s]);

  const next = useCallback(async () => {
    if (!test || !ready) return;
    const added = sidesFor(test.sided).map((side) => ({ test: test.id, side, result: current[side]! }));
    const all = [...checks, ...added];
    setChecks(all);
    setCurrent({});
    if (all.length >= MOBILITY_CHECK_COUNT) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(all);
    }
  }, [test, ready, current, checks, save]);

  const back = useCallback(() => {
    const last = checks[checks.length - 1];
    if (!last) return;
    const lastTest = last.test;
    const restore = checks.filter((c) => c.test === lastTest);
    setChecks((cs) => cs.filter((c) => c.test !== lastTest));
    setCurrent(Object.fromEntries(restore.map((c) => [c.side, c.result])));
  }, [checks]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={CFG.testName}
          kicker="Body screen"
          art={<MobilityFigure testId="deep-squat" light className={HERO_ART_CLASS} />}
          chips={[`${total} tests`, "~12 min", playerId ? "Coach check" : "Self check", "+XP"]}
        />
        {isCoach &&
          (playerId ? (
            <button
              type="button"
              onClick={() => screenPlayer(null)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-50 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              <Users className="h-4 w-4" aria-hidden />
              Change player
            </button>
          ) : (
            <TestingForSelect value={null} onChange={(p) => p && screenPlayer(p.id)} />
          ))}
        {previous && (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Last screen: <span className="font-bold text-[#014421]">{previous.pct}%</span> on {formatDate(previous.at)}
          </p>
        )}
        <IntroSteps
          steps={[
            { icon: <Armchair className="h-5 w-5" aria-hidden />, title: "Grab a chair, a club and a wall", hint: "Plus some floor space. A mate watching helps you judge" },
            { icon: <PersonStanding className="h-5 w-5" aria-hidden />, title: "Do each test and mark it", hint: "Pass, Limited or Pain. Left and right sides are marked separately" },
            { icon: <Dumbbell className="h-5 w-5" aria-hidden />, title: "Get your fix list", hint: "What each limit does to your swing and the exercises to fix it" },
          ]}
        />
        <p className="px-1 text-xs text-gray-500">Move slowly and stop if anything hurts. Mark it as Pain and move on.</p>
        <PrimaryButton onClick={start}>Start the screen</PrimaryButton>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className="space-y-4">
        <MobilityScreenReport checks={checks} previous={previous} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(checks) : undefined} />
        {playerId ? (
          <PrimaryButton onClick={() => screenPlayer(null)}>
            <span className="inline-flex items-center gap-2">
              <Users className="h-5 w-5" aria-hidden />
              Screen another player
            </span>
          </PrimaryButton>
        ) : (
          <PlayAgainButton onClick={start} />
        )}
      </div>
    );
  }

  if (!test) return null;

  const track: TrackItem[] = MOBILITY_TESTS.map((t, i) => {
    const done = checks.filter((c) => c.test === t.id);
    if (done.length === 0) return null;
    const worst: MobilityResult = done.some((c) => c.result === "pain") ? "pain" : done.some((c) => c.result === "limited") ? "limited" : "pass";
    return { label: worst === "pass" ? "✓" : worst === "pain" ? "!" : "–", tone: RESULT_TONE[worst].on, ariaLabel: `Test ${i + 1}: ${worst}` };
  });

  return (
    <div className="space-y-4">
      <ProgressTrack items={track} current={testIndex} name="Test" />

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-start gap-3">
          <MobilityFigure testId={test.id} className="h-28 w-28 shrink-0 rounded-2xl bg-gray-50" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Test {testIndex + 1} of {total}
            </p>
            <p className="text-xl font-extrabold leading-tight text-gray-900">{test.name}</p>
            <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{test.area}</span>
          </div>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
          {test.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-[#014421]">
          <span className="font-bold">Pass: </span>
          {test.pass}
        </div>
      </div>

      {test.timerSeconds && <CountdownTimer key={test.id} seconds={test.timerSeconds} />}

      {checks.length > 0 && <CombineFlowBackControl onBack={back} label="Back a test" />}

      <div className="space-y-3">
        {sides.map((side) => (
          <div key={side} className="space-y-1.5">
            {side !== "both" && <p className="text-sm font-bold text-gray-900">{SIDE_LABEL[side]} side</p>}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={side === "both" ? test.name : `${SIDE_LABEL[side]} side`}>
              {(["pass", "limited", "pain"] as const).map((r) => {
                const active = current[side] === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCurrent((c) => ({ ...c, [side]: r }))}
                    className={`rounded-2xl py-3 text-sm font-bold transition-colors ${active ? RESULT_TONE[r].on : RESULT_TONE[r].off}`}
                  >
                    {MOBILITY_RESULT_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <PrimaryButton onClick={() => void next()} disabled={!ready}>
        {testIndex + 1 >= total ? "Finish the screen" : "Next test"}
        <span className="block text-xs font-semibold text-white/70">{ready ? "Saved when you finish" : sides.length > 1 ? "Mark both sides" : "Mark your result"}</span>
      </PrimaryButton>
    </div>
  );
}
