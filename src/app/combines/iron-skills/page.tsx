"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Shuffle, Target, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCombineUser } from "@/hooks/useCombineUser";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { saveCombineProfile } from "@/lib/saveCombineProfile";
import {
  clampProgressionLevel,
  generateIronSkillsChallenge,
  type IronSkillsChallenge,
  IRON_SKILLS_LEVEL_THRESHOLD,
  IRON_SKILLS_LOG_TYPE,
  IRON_SKILLS_POINTS_PER_MAKE,
  IRON_SKILLS_SESSION_SHOTS,
  ironSkillsLevelTitle,
  IRON_SKILLS_MAX_PROGRESSION_LEVEL,
} from "@/lib/ironSkillsChallenge";
import {
  defaultIronSkillsLevel,
  mergeIronSkillsIntoCombineProfile,
  parseIronSkillsFromCombineProfile,
} from "@/lib/ironSkillsProfile";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  BRAND_GREEN,
  BRAND_ORANGE,
  CombineHero,
  IntroSteps,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  ResultHero,
  SaveStatus,
  ScoreRing,
  ScoringGuide,
  StepDots,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { IronHeroArt } from "@/components/combine/IronCombineUi";
import { BreakdownCard, FocusCard, RateRow } from "@/components/combine/CombineBreakdown";

type ShotRecord = {
  shotIndex: number;
  challenge: IronSkillsChallenge;
  points: number;
};

const SHUFFLE_DURATION_MS = 900;
const SHUFFLE_TICK_MS = 70;
const MAX_SESSION_POINTS = IRON_SKILLS_SESSION_SHOTS * IRON_SKILLS_POINTS_PER_MAKE;

/** Make rate per skill and per prescription, plus the one to practise next. */
function reviewSession(rows: ShotRecord[]) {
  const byCategory = new Map<string, { made: number; asked: number }>();
  const byValue = new Map<string, { label: string; value: string; made: number; asked: number }>();
  for (const r of rows) {
    const made = r.points > 0 ? 1 : 0;
    for (const e of r.challenge.entries) {
      const c = byCategory.get(e.categoryLabel) ?? { made: 0, asked: 0 };
      byCategory.set(e.categoryLabel, { made: c.made + made, asked: c.asked + 1 });
      const key = `${e.categoryLabel}:${e.value}`;
      const v = byValue.get(key) ?? { label: e.categoryLabel, value: e.value, made: 0, asked: 0 };
      byValue.set(key, { ...v, made: v.made + made, asked: v.asked + 1 });
    }
  }
  const rate = (x: { made: number; asked: number }) => x.made / x.asked;
  const categories = [...byCategory.entries()]
    .map(([label, c]) => ({ label, ...c }))
    .sort((a, b) => rate(a) - rate(b) || b.asked - a.asked);
  const made = rows.filter((r) => r.points > 0).length;

  const weakest = categories[0];
  const toughValue = [...byValue.values()]
    .filter((v) => v.asked >= 2 && v.made < v.asked)
    .sort((a, b) => rate(a) - rate(b) || b.asked - a.asked)[0];
  const toughestCategory =
    toughValue?.label ??
    (weakest && rate(weakest) < 1 && categories.some((c) => rate(c) > rate(weakest)) ? weakest.label : null);
  const bestValue = [...byValue.values()]
    .filter((v) => v.asked >= 2 && v.made === v.asked)
    .sort((a, b) => b.asked - a.asked)[0];

  let focus: { title: string; lines: string[] };
  if (made === rows.length) {
    focus = { title: "Clean sweep", lines: ["Every prescription executed. Your next level will mix in more variables."] };
  } else if (toughValue) {
    focus = {
      title: `Focus next: ${toughValue.label.toLowerCase()}`,
      lines: [
        `You made ${toughValue.made} of ${toughValue.asked} shots that asked for "${toughValue.value}".`,
        "Hit a few with only that change before your next round.",
      ],
    };
  } else if (weakest) {
    focus = {
      title: `Focus next: ${weakest.label.toLowerCase()}`,
      lines: [`You made ${weakest.made} of ${weakest.asked} shots that included ${weakest.label.toLowerCase()}.`],
    };
  } else {
    focus = { title: "Keep going", lines: [] };
  }
  if (bestValue) focus.lines.push(`Strength: "${bestValue.value}", made all ${bestValue.asked}.`);

  const track: TrackItem[] = rows.map((r, i) => ({
    label: r.points > 0 ? `+${r.points}` : "0",
    tone: r.points > 0 ? "bg-[#014421] text-white" : "bg-red-500 text-white",
    ariaLabel: `Shot ${i + 1}: ${r.points > 0 ? "made" : "missed"}`,
  }));

  return { made, categories, toughestCategory, focus, track };
}

const CONFETTI_PIECES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  leftPct: Math.random() * 100,
  drift: -40 + Math.random() * 80,
  delay: Math.random() * 0.35,
  duration: 1.8 + Math.random() * 1.2,
  size: 6 + Math.random() * 8,
  spin: 360 + Math.random() * 360,
  hue: [BRAND_GREEN, BRAND_ORANGE, "#059669", "#0b6b3a", "#fbbf24"][i % 5],
}));

function IronSkillsConfetti({ show }: { show: boolean }) {
  const pieces = CONFETTI_PIECES;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[71] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden
        >
          {pieces.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-sm shadow-sm"
              style={{
                left: `${p.leftPct}%`,
                top: "-12%",
                width: p.size,
                height: p.size * 1.6,
                backgroundColor: p.hue,
              }}
              initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
              animate={{
                y: ["0vh", "110vh"],
                x: [0, p.drift],
                rotate: [0, p.spin],
                opacity: [1, 1, 0.9],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: "easeIn",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function IronSkillsChallengePage() {
  const { refreshUser } = useAuth();
  const user = useCombineUser();
  const [progressionLevel, setProgressionLevel] = useState(defaultIronSkillsLevel);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [displayChallenge, setDisplayChallenge] = useState<IronSkillsChallenge | null>(null);
  const [slotPreview, setSlotPreview] = useState<IronSkillsChallenge | null>(null);
  const [sessionRows, setSessionRows] = useState<ShotRecord[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [celebratePromotion, setCelebratePromotion] = useState(false);
  /** Snapshot when submit succeeds with score ≥ threshold (threshold_met). */
  const [celebrationPayload, setCelebrationPayload] = useState<{
    score: number;
    scoredAtLevel: number;
    unlockedNextTier: boolean;
  } | null>(null);
  const shuffleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shuffleEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProgressionLevel(defaultIronSkillsLevel());
      setProfileLoaded(true);
      return;
    }
    let cancelled = false;
    setProfileLoaded(false);
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("combine_profile")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("[IronSkills] profile load:", error.message);
          setProgressionLevel(defaultIronSkillsLevel());
        } else {
          const parsed = parseIronSkillsFromCombineProfile(data?.combine_profile);
          setProgressionLevel(parsed?.current_level ?? defaultIronSkillsLevel());
        }
      } catch (e) {
        console.warn("[IronSkills] profile load failed", e);
        if (!cancelled) setProgressionLevel(defaultIronSkillsLevel());
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const sessionComplete = sessionRows.length >= IRON_SKILLS_SESSION_SHOTS;
  const liveScore = useMemo(() => sessionRows.reduce((acc, r) => acc + r.points, 0), [sessionRows]);
  const remainingShots = IRON_SKILLS_SESSION_SHOTS - sessionRows.length;
  const maxPossibleScore = liveScore + remainingShots * IRON_SKILLS_POINTS_PER_MAKE;
  const qualifiesForPromotion = liveScore >= IRON_SKILLS_LEVEL_THRESHOLD;
  const atMaxLevel = progressionLevel >= IRON_SKILLS_MAX_PROGRESSION_LEVEL;

  const clearShuffleTimers = useCallback(() => {
    if (shuffleTimerRef.current) {
      clearInterval(shuffleTimerRef.current);
      shuffleTimerRef.current = null;
    }
    if (shuffleEndRef.current) {
      clearTimeout(shuffleEndRef.current);
      shuffleEndRef.current = null;
    }
  }, []);

  useEffect(() => () => clearShuffleTimers(), [clearShuffleTimers]);

  const shuffle = useCallback(() => {
    clearShuffleTimers();
    setDisplayChallenge(null);
    setShuffling(true);
    setSlotPreview(generateIronSkillsChallenge(progressionLevel));
    shuffleTimerRef.current = setInterval(() => {
      setSlotPreview(generateIronSkillsChallenge(progressionLevel));
    }, SHUFFLE_TICK_MS);
    shuffleEndRef.current = setTimeout(() => {
      clearShuffleTimers();
      setSlotPreview(null);
      setDisplayChallenge(generateIronSkillsChallenge(progressionLevel));
      setShuffling(false);
    }, SHUFFLE_DURATION_MS);
  }, [clearShuffleTimers, progressionLevel]);

  const startSession = useCallback(() => {
    if (!profileLoaded || !user?.id) return;
    setStarted(true);
    shuffle();
  }, [profileLoaded, user?.id, shuffle]);

  const recordShot = useCallback(
    (points: number) => {
      if (!displayChallenge || sessionComplete || shuffling) return;
      const next = [...sessionRows, { shotIndex: sessionRows.length + 1, challenge: displayChallenge, points }];
      setSessionRows(next);
      setDisplayChallenge(null);
      if (next.length < IRON_SKILLS_SESSION_SHOTS) shuffle();
    },
    [displayChallenge, sessionComplete, shuffling, sessionRows, shuffle],
  );

  const undoLastShot = useCallback(() => {
    if (sessionRows.length === 0 || saved || submitting) return;
    clearShuffleTimers();
    setShuffling(false);
    setSlotPreview(null);
    setDisplayChallenge(sessionRows[sessionRows.length - 1]!.challenge);
    setSessionRows((rows) => rows.slice(0, -1));
    setSubmitError(null);
  }, [sessionRows, saved, submitting, clearShuffleTimers]);

  const submitSession = useCallback(async () => {
    if (!user?.id || sessionRows.length !== IRON_SKILLS_SESSION_SHOTS) return;
    setSubmitError(null);
    setSubmitting(true);
    const playedLevel = clampProgressionLevel(progressionLevel);
    const thresholdMet = liveScore >= IRON_SKILLS_LEVEL_THRESHOLD;
    const canUnlockNext = thresholdMet && playedLevel < IRON_SKILLS_MAX_PROGRESSION_LEVEL;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { error } = await supabase.from("practice_logs").insert({
        user_id: user.id,
        log_type: IRON_SKILLS_LOG_TYPE,
        score: liveScore,
        total_points: liveScore,
      });

      if (error) {
        setSubmitError(formatSupabaseWriteError(error));
        return;
      }

      let unlockedNextTier = false;
      if (canUnlockNext) {
        const { data: profileRow, error: fetchErr } = await supabase
          .from("profiles")
          .select("combine_profile")
          .eq("id", user.id)
          .maybeSingle();
        if (fetchErr) {
          console.warn("[IronSkills] combine_profile fetch:", fetchErr.message);
          setSubmitError("Session saved, but your level could not be loaded to sync. Refresh and check your profile.");
        } else {
          const nextCombine = mergeIronSkillsIntoCombineProfile(
            profileRow?.combine_profile as Record<string, unknown> | null | undefined,
            { current_level: playedLevel + 1 },
          );
          const upErr = await saveCombineProfile(supabase, user.id, nextCombine);
          if (upErr) {
            console.warn("[IronSkills] profile update:", upErr.message);
            setSubmitError("Session saved, but your level could not be synced. Try again from Settings or contact support.");
          } else {
            unlockedNextTier = true;
            setProgressionLevel(playedLevel + 1);
          }
        }
      }

      await awardCombineCompletionXp(user.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("practiceSessionsUpdated"));
      }
      await refreshUser();
      setSaved(true);
      if (thresholdMet) {
        setCelebratePromotion(true);
        setCelebrationPayload({ score: liveScore, scoredAtLevel: playedLevel, unlockedNextTier });
      }
    } catch (e) {
      setSubmitError(formatSupabaseWriteError(e));
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, sessionRows, liveScore, progressionLevel, refreshUser]);

  const resetSession = useCallback(() => {
    clearShuffleTimers();
    setShuffling(false);
    setDisplayChallenge(null);
    setSlotPreview(null);
    setSessionRows([]);
    setSubmitError(null);
    setSaved(false);
    setCelebratePromotion(false);
    setCelebrationPayload(null);
    setSubmitting(false);
    setStarted(true);
    shuffle();
  }, [clearShuffleTimers, shuffle]);

  const levelTitle = ironSkillsLevelTitle(progressionLevel);
  const activeCard = shuffling && slotPreview ? slotPreview : displayChallenge;
  const review = useMemo(() => (sessionComplete ? reviewSession(sessionRows) : null), [sessionComplete, sessionRows]);

  let body: ReactNode;
  if (!started) {
    body = (
      <div className="space-y-4">
        <CombineHero
          title="Iron Skills Challenge"
          kicker="Iron combine"
          art={<IronHeroArt curve="fade" />}
          chips={[`${IRON_SKILLS_SESSION_SHOTS} shots`, "Any iron", "~15 min", `${IRON_SKILLS_LEVEL_THRESHOLD}+ to level up`]}
        />

        <div className="rounded-2xl border border-gray-100 p-4">
          {profileLoaded ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your level</p>
                <StepDots step={progressionLevel} total={IRON_SKILLS_MAX_PROGRESSION_LEVEL} />
              </div>
              <p className="mt-1 text-xl font-extrabold text-gray-900">
                Level {progressionLevel}: {levelTitle}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Each shot shuffles {progressionLevel} {progressionLevel === 1 ? "thing" : "things"} to change, like ball position,
                shape or trajectory.
              </p>
            </>
          ) : (
            <div className="h-16 animate-pulse rounded-xl bg-gray-100" aria-label="Loading your level" />
          )}
        </div>

        <IntroSteps
          steps={[
            { icon: <Shuffle className="h-5 w-5" aria-hidden />, title: "Get a shuffled challenge", hint: "A new prescription for every shot" },
            { icon: <Target className="h-5 w-5" aria-hidden />, title: "Hit the shot as prescribed", hint: "Every part has to happen to count" },
            { icon: <Check className="h-5 w-5" aria-hidden />, title: "Tap made or missed", hint: "Be honest, it's your level on the line" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Each shot you pull off: +{IRON_SKILLS_POINTS_PER_MAKE}</li>
            <li>
              Score {IRON_SKILLS_LEVEL_THRESHOLD} or more out of {MAX_SESSION_POINTS} to unlock the next level (there are{" "}
              {IRON_SKILLS_MAX_PROGRESSION_LEVEL}).
            </li>
            <li className="font-semibold text-gray-900">Higher is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startSession} disabled={!profileLoaded || !user?.id}>
          Start the test
        </PrimaryButton>
        {profileLoaded && !user?.id && (
          <p className="text-center text-xs text-gray-500">Sign in to play and save your level.</p>
        )}
      </div>
    );
  } else if (sessionComplete) {
    body = (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing pct={liveScore / MAX_SESSION_POINTS} value={liveScore} caption={`of ${MAX_SESSION_POINTS} points`} />
          <p className="mx-auto mt-3 max-w-xs rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold">
            {qualifiesForPromotion
              ? atMaxLevel
                ? "Master tier session. Great work."
                : `You've unlocked Level ${progressionLevel + 1} once you save`
              : `${IRON_SKILLS_LEVEL_THRESHOLD} unlocks the next level. Go again!`}
          </p>
        </ResultHero>

        <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
          Level {progressionLevel}: {levelTitle}
        </p>

        {review && (
          <>
            <FocusCard title={review.focus.title} lines={review.focus.lines} />

            <BreakdownCard title="Shot by shot" aside={`${review.made} of ${IRON_SKILLS_SESSION_SHOTS} made`}>
              <ProgressTrack items={review.track} current={-1} name="Shot" />
            </BreakdownCard>

            <BreakdownCard title="By skill" aside="Made / asked">
              <div className="space-y-3">
                {review.categories.map((c) => (
                  <RateRow
                    key={c.label}
                    label={c.label}
                    made={c.made}
                    total={c.asked}
                    flag={c.label === review.toughestCategory ? "Toughest" : null}
                  />
                ))}
              </div>
            </BreakdownCard>

            <details className="group rounded-2xl border border-gray-100">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Every shot
                <span className="text-xs font-medium normal-case tracking-normal text-[#014421] group-open:hidden">Show</span>
                <span className="hidden text-xs font-medium normal-case tracking-normal text-[#014421] group-open:inline">Hide</span>
              </summary>
              <ul className="divide-y divide-gray-100 px-3.5 pb-2">
                {sessionRows.map((r) => (
                  <li key={r.shotIndex} className="flex items-start gap-3 py-2 text-sm">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        r.points > 0 ? "bg-[#014421] text-white" : "bg-red-500 text-white"
                      }`}
                      aria-label={r.points > 0 ? "Made" : "Missed"}
                    >
                      {r.points > 0 ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 text-gray-600">
                      <span className="font-semibold text-gray-900">Shot {r.shotIndex}: </span>
                      {r.challenge.entries.map((e) => e.value).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}

        {!saved && (
          <>
            <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />
            {submitError && <SaveStatus saved={false} error={submitError} />}
            <PrimaryButton onClick={() => void submitSession()} disabled={submitting || !user?.id}>
              {submitting
                ? "Saving…"
                : qualifiesForPromotion && !atMaxLevel
                  ? "Save and level up"
                  : "Save session"}
            </PrimaryButton>
          </>
        )}
        {saved && (
          <>
            <SaveStatus saved error={submitError} />
            <PlayAgainButton onClick={resetSession} />
          </>
        )}
      </div>
    );
  } else {
    const track: TrackItem[] = Array.from({ length: IRON_SKILLS_SESSION_SHOTS }, (_, i) => {
      const r = sessionRows[i];
      if (!r) return null;
      const made = r.points > 0;
      return {
        label: made ? `+${r.points}` : "0",
        tone: made ? "bg-[#014421] text-white" : "bg-red-500 text-white",
        ariaLabel: `Shot ${i + 1}: ${made ? "made" : "missed"}`,
      };
    });
    const makesNeeded = Math.ceil((IRON_SKILLS_LEVEL_THRESHOLD - liveScore) / IRON_SKILLS_POINTS_PER_MAKE);
    const levelLine = qualifiesForPromotion
      ? atMaxLevel
        ? "Threshold met on the top level"
        : "Level up secured. Finish the round to claim it"
      : maxPossibleScore >= IRON_SKILLS_LEVEL_THRESHOLD
        ? `${makesNeeded} more ${makesNeeded === 1 ? "make" : "makes"} from ${remainingShots} to level up`
        : "Level up is out of reach this round, so finish strong";

    body = (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{liveScore} pts</span>
          <span className="truncate text-xs font-semibold text-gray-500">
            Level {progressionLevel}: {levelTitle}
          </span>
        </div>

        <ProgressTrack items={track} current={sessionRows.length} name="Shot" />

        <p className={`rounded-2xl px-3 py-2 text-center text-xs font-semibold ${qualifiesForPromotion ? "bg-[#014421]/10 text-[#014421]" : "bg-gray-50 text-gray-600"}`}>
          {levelLine}
        </p>

        <section
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#014421] to-[#0b6b3a] p-5 text-white shadow-md"
          aria-live="polite"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#FFA500]">
            Shot {sessionRows.length + 1} of {IRON_SKILLS_SESSION_SHOTS}
          </p>
          <div className="mt-3 space-y-3">
            {(activeCard?.entries ?? []).map((entry) => (
              <div key={entry.categoryKey} className="rounded-2xl bg-white/10 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{entry.categoryLabel}</p>
                <p className={`text-xl font-extrabold leading-snug ${shuffling ? "animate-pulse" : ""}`}>{entry.value}</p>
              </div>
            ))}
          </div>
          {shuffling && <p className="mt-3 text-center text-xs font-semibold text-white/70">Shuffling…</p>}
        </section>

        {sessionRows.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => recordShot(0)}
            disabled={!displayChallenge || shuffling}
            className="flex flex-col items-center rounded-2xl border-2 border-red-200 bg-white py-4 font-bold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-6 w-6" aria-hidden />
            Missed
            <span className="text-[11px] font-semibold text-red-400">0 pts</span>
          </button>
          <button
            type="button"
            onClick={() => recordShot(IRON_SKILLS_POINTS_PER_MAKE)}
            disabled={!displayChallenge || shuffling}
            className="flex flex-col items-center rounded-2xl bg-[#014421] py-4 font-bold text-white shadow-md transition-all hover:bg-[#013320] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-6 w-6 text-[#FFA500]" aria-hidden />
            Made it
            <span className="text-[11px] font-semibold text-white/70">+{IRON_SKILLS_POINTS_PER_MAKE} pts</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <CombinePageShell label="Iron Skills">
      {body}

      <AnimatePresence>
        {saved && celebratePromotion && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="iron-skills-celebration-title"
          >
            <IronSkillsConfetti show={celebratePromotion} />
            <motion.div
              className="relative z-[72] w-full max-w-sm overflow-hidden rounded-3xl bg-white text-center shadow-2xl"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
            >
              <div className="bg-gradient-to-br from-[#014421] to-[#0b6b3a] px-6 py-7 text-white">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#FFA500]">
                  {celebrationPayload?.unlockedNextTier ? "Level up" : "Threshold met"}
                </p>
                <h2 id="iron-skills-celebration-title" className="mt-2 text-3xl font-black tracking-tight">
                  {celebrationPayload?.unlockedNextTier ? "Level Up!" : "Level Complete"}
                </h2>
                <p className="mt-2 text-sm text-white/80">
                  You scored {celebrationPayload?.score ?? liveScore} on Level{" "}
                  {celebrationPayload ? clampProgressionLevel(celebrationPayload.scoredAtLevel) : progressionLevel}:{" "}
                  {ironSkillsLevelTitle(celebrationPayload?.scoredAtLevel ?? progressionLevel)}.
                </p>
              </div>
              <div className="space-y-3 px-6 py-6">
                {celebrationPayload?.unlockedNextTier ? (
                  <p className="text-base font-bold text-[#014421]">
                    Unlocked Level {clampProgressionLevel(celebrationPayload.scoredAtLevel + 1)}:{" "}
                    {ironSkillsLevelTitle(celebrationPayload.scoredAtLevel + 1)}
                  </p>
                ) : celebrationPayload &&
                  clampProgressionLevel(celebrationPayload.scoredAtLevel) >= IRON_SKILLS_MAX_PROGRESSION_LEVEL ? (
                  <p className="text-sm text-gray-600">You&apos;re on Master Challenge. Keep stacking clean sessions.</p>
                ) : celebrationPayload ? (
                  <p className="text-sm text-amber-900">
                    Session saved. If your level didn&apos;t move up, refresh the page, as your profile sync may have failed.
                  </p>
                ) : null}
                <PrimaryButton onClick={resetSession}>Play another round</PrimaryButton>
                <Link
                  href="/practice"
                  className="block rounded-2xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Back to Practice
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CombinePageShell>
  );
}
