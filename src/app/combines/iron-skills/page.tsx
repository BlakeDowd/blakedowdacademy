"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Crosshair } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
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
import { theme } from "@/lib/theme";

type ShotRecord = {
  shotIndex: number;
  challenge: IronSkillsChallenge;
  points: number;
};

type IronSkillsSessionMetadata = {
  version: 3;
  session_length: number;
  /** Progression tier at start of session (how many categories per shot). */
  progression_level_played: number;
  /** Snapshot label for coaches reviewing logs. */
  progression_title: string;
  /** Score gate for unlocking the next progression step. */
  score_threshold_points: typeof IRON_SKILLS_LEVEL_THRESHOLD;
  /** True when session score meets threshold (≥70). */
  threshold_met: boolean;
  /** True when progression increased after this session (stored in profile). */
  progressed_to_next_level: boolean;
  /** Progression tier after unlock, same as played if no unlock. */
  progression_level_after_session: number;
  challenges: Array<{
    shotIndex: number;
    progressionLevelUsed: number;
    points: number;
    entries: Array<{ categoryKey: string; categoryLabel: string; value: string }>;
  }>;
};

const SHUFFLE_DURATION_MS = 900;
const SHUFFLE_TICK_MS = 70;

function IronSkillsConfetti({ show }: { show: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        leftPct: Math.random() * 100,
        drift: -40 + Math.random() * 80,
        delay: Math.random() * 0.35,
        duration: 1.8 + Math.random() * 1.2,
        size: 6 + Math.random() * 8,
        hue: [theme.primary, "#047857", "#059669", "#0f766e", "#065f46"][i % 5],
      })),
    [show],
  );

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
                rotate: [0, 360 + Math.random() * 360],
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
  const { user, refreshUser } = useAuth();
  const [progressionLevel, setProgressionLevel] = useState(defaultIronSkillsLevel);
  const [profileLoaded, setProfileLoaded] = useState(false);
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
  const liveScore = useMemo(
    () => sessionRows.reduce((acc, r) => acc + r.points, 0),
    [sessionRows],
  );

  const remainingShots = IRON_SKILLS_SESSION_SHOTS - sessionRows.length;
  const maxPossibleScore = liveScore + remainingShots * IRON_SKILLS_POINTS_PER_MAKE;

  const onTrackForLevelUp = useMemo(() => {
    if (sessionComplete || saved) return false;
    if (sessionRows.length === 0) return false;
    return (
      liveScore < IRON_SKILLS_LEVEL_THRESHOLD &&
      maxPossibleScore >= IRON_SKILLS_LEVEL_THRESHOLD
    );
  }, [sessionComplete, saved, sessionRows.length, liveScore, maxPossibleScore]);

  const levelThresholdSecured = useMemo(() => {
    if (sessionComplete || saved) return false;
    return liveScore >= IRON_SKILLS_LEVEL_THRESHOLD;
  }, [sessionComplete, saved, liveScore]);

  const qualifiesForPromotion = liveScore >= IRON_SKILLS_LEVEL_THRESHOLD;

  const currentShotNumber = useMemo(() => {
    if (sessionComplete) return IRON_SKILLS_SESSION_SHOTS;
    return Math.min(sessionRows.length + 1, IRON_SKILLS_SESSION_SHOTS);
  }, [sessionRows.length, sessionComplete]);

  const canGenerate =
    profileLoaded &&
    !shuffling &&
    !sessionComplete &&
    displayChallenge === null &&
    !!user?.id;

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

  const runShuffle = useCallback(() => {
    if (!canGenerate) return;
    setShuffling(true);
    setSlotPreview(generateIronSkillsChallenge(progressionLevel));
    shuffleTimerRef.current = setInterval(() => {
      setSlotPreview(generateIronSkillsChallenge(progressionLevel));
    }, SHUFFLE_TICK_MS);
    shuffleEndRef.current = setTimeout(() => {
      clearShuffleTimers();
      const finalChallenge = generateIronSkillsChallenge(progressionLevel);
      setSlotPreview(null);
      setDisplayChallenge(finalChallenge);
      setShuffling(false);
    }, SHUFFLE_DURATION_MS);
  }, [canGenerate, clearShuffleTimers, progressionLevel]);

  const recordShot = useCallback(
    (points: number) => {
      if (!displayChallenge || sessionComplete || shuffling) return;
      const challenge = displayChallenge;
      setSessionRows((prev) => {
        const nextIndex = prev.length + 1;
        return [...prev, { shotIndex: nextIndex, challenge, points }];
      });
      setDisplayChallenge(null);
    },
    [displayChallenge, sessionComplete, shuffling],
  );

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
          setSubmitError(
            "Session saved, but your level could not be loaded to sync. Refresh and check your profile.",
          );
        } else {
          const nextCombine = mergeIronSkillsIntoCombineProfile(
            profileRow?.combine_profile as Record<string, unknown> | null | undefined,
            { current_level: playedLevel + 1 },
          );
          const { error: upErr } = await supabase
            .from("profiles")
            .update({ combine_profile: nextCombine })
            .eq("id", user.id);
          if (upErr) {
            console.warn("[IronSkills] profile update:", upErr.message);
            setSubmitError(
              "Session saved, but your level could not be synced. Try again from Settings or contact support.",
            );
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
        setCelebrationPayload({
          score: liveScore,
          scoredAtLevel: playedLevel,
          unlockedNextTier,
        });
      }
    } catch (e) {
      setSubmitError(formatSupabaseWriteError(e));
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, sessionRows, liveScore, progressionLevel, refreshUser]);

  const activeCard = shuffling && slotPreview ? slotPreview : displayChallenge;

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
  }, [clearShuffleTimers]);

  const levelTitle = ironSkillsLevelTitle(progressionLevel);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-primary/85 transition-colors hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to Practice
        </Link>

        <header className="mb-6">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-surface px-4 py-4 shadow-sm ring-1 ring-primary/15">
            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-surface"
                aria-hidden
              >
                <Crosshair className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                  Level {progressionLevel}: {levelTitle}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  Iron Skills Challenge
                </h1>
                <p className="mt-2 text-sm leading-snug text-gray-600">
                  Ten shots. Your level sets how many variables shuffle each round ({progressionLevel}{" "}
                  {progressionLevel === 1 ? "category" : "categories"} through{" "}
                  {IRON_SKILLS_MAX_PROGRESSION_LEVEL}). Score {IRON_SKILLS_LEVEL_THRESHOLD}+ to unlock the
                  next level.
                </p>
              </div>
            </div>
          </div>
        </header>

        {!profileLoaded && user?.id && (
          <p className="mb-4 text-center text-sm text-gray-500">Loading your progression…</p>
        )}

        <div className="mb-6 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3 ring-1 ring-primary/15">
          <div className="flex items-center justify-between text-sm font-medium text-primary">
            <span>
              Shot {currentShotNumber} of {IRON_SKILLS_SESSION_SHOTS}
            </span>
            <span className="tabular-nums">
              Live score: <span className="text-primary">{liveScore}</span> / 100
            </span>
          </div>
          {onTrackForLevelUp && (
            <p className="mt-2 text-xs font-medium text-primary/90">
              On track for Level Up — {IRON_SKILLS_LEVEL_THRESHOLD}+ pts can unlock your next progression
              step.
            </p>
          )}
          {levelThresholdSecured && (
            <p className="mt-2 text-xs font-semibold text-primary">
              Threshold secured — promotion eligible on submit (if not already max level).
            </p>
          )}
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface ring-1 ring-primary/15"
            role="progressbar"
            aria-valuenow={sessionRows.length}
            aria-valuemin={0}
            aria-valuemax={IRON_SKILLS_SESSION_SHOTS}
            aria-label="Session progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{
                width: `${(sessionRows.length / IRON_SKILLS_SESSION_SHOTS) * 100}%`,
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={runShuffle}
          disabled={!canGenerate}
          className="mb-6 w-full rounded-2xl border-2 border-primary bg-primary px-5 py-4 text-base font-semibold text-white shadow-md shadow-primary/15 transition hover:bg-primary/90 hover:border-primary/90 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
        >
          {shuffling ? "Shuffling…" : "Generate Challenge"}
        </button>

        <section
          className="rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm ring-1 ring-gray-100"
          aria-live="polite"
        >
          {!activeCard && !sessionComplete && profileLoaded && (
            <p className="text-center text-sm text-gray-500">
              Tap <span className="font-semibold text-primary">Generate Challenge</span> to draw your
              next prescription.
            </p>
          )}

          {sessionComplete && !saved && (
            <p className="text-center text-sm font-medium text-primary">
              Session complete — submit your score below.
            </p>
          )}

          {saved && !celebratePromotion && (
            <p className="text-center text-sm font-medium text-primary">
              Saved to your practice log. Head back anytime for another round.
            </p>
          )}

          {activeCard && (
            <div className="space-y-6">
              {activeCard.entries.map((entry) => (
                <div key={entry.categoryKey}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/90">
                    {entry.categoryLabel}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold leading-snug text-gray-900 ${shuffling ? "animate-pulse" : ""}`}
                  >
                    {entry.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {!sessionComplete && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => recordShot(IRON_SKILLS_POINTS_PER_MAKE)}
              disabled={!displayChallenge || shuffling}
              className="rounded-2xl border-2 border-primary bg-primary/10 px-4 py-4 text-center text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
            >
              Execution Complete ✅
              <span className="mt-1 block text-xs font-normal opacity-90">
                +{IRON_SKILLS_POINTS_PER_MAKE} pts
              </span>
            </button>
            <button
              type="button"
              onClick={() => recordShot(0)}
              disabled={!displayChallenge || shuffling}
              className="rounded-2xl border-2 border-danger bg-danger/5 px-4 py-4 text-center text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400"
            >
              Failed ❌
              <span className="mt-1 block text-xs font-normal text-danger/80">0 pts</span>
            </button>
          </div>
        )}

        {sessionComplete && !saved && (
          <div
            className={`mt-8 space-y-3 rounded-2xl transition-colors duration-300 ${
              qualifiesForPromotion ? "ring-2 ring-primary shadow-lg shadow-primary/20 p-4" : ""
            }`}
          >
            <div>
              {submitError && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {submitError}
                </p>
              )}
              {qualifiesForPromotion && progressionLevel < IRON_SKILLS_MAX_PROGRESSION_LEVEL && (
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-primary">
                  Ready to promote — meet {IRON_SKILLS_LEVEL_THRESHOLD}+ to unlock Level{" "}
                  {progressionLevel + 1}
                </p>
              )}
              {qualifiesForPromotion && progressionLevel >= IRON_SKILLS_MAX_PROGRESSION_LEVEL && (
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-primary">
                  Master tier session — score still saves for your log
                </p>
              )}
              <button
                type="button"
                onClick={() => void submitSession()}
                disabled={submitting || !user?.id}
                className={`w-full rounded-2xl border-2 px-5 py-4 text-base font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 ${
                  qualifiesForPromotion
                    ? "border-primary bg-primary text-white shadow-primary/20 hover:bg-primary/90"
                    : "border-primary bg-surface text-primary hover:bg-primary/5"
                }`}
              >
                {submitting
                  ? "Submitting…"
                  : qualifiesForPromotion
                    ? progressionLevel < IRON_SKILLS_MAX_PROGRESSION_LEVEL
                      ? "Submit & claim Level Up ✨"
                      : "Submit master session ✨"
                    : "Submit session"}
              </button>
              {!user?.id && (
                <p className="mt-2 text-center text-xs text-gray-500">Sign in to save this session.</p>
              )}
            </div>
          </div>
        )}

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
                className="relative z-[72] max-w-md rounded-3xl border-2 border-primary/35 bg-surface px-8 py-10 text-center shadow-2xl shadow-primary/20"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 22, stiffness: 280 }}
              >
                <div className="mb-4 inline-flex rounded-full border-2 border-primary bg-primary px-5 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-white shadow-md">
                  {celebrationPayload?.unlockedNextTier ? "LEVEL UP" : "THRESHOLD MET"}
                </div>
                <h2
                  id="iron-skills-celebration-title"
                  className="text-3xl font-black tracking-tight text-gray-900"
                >
                  {celebrationPayload?.unlockedNextTier ? "Level Up!" : "Level Complete"}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  You scored {celebrationPayload?.score ?? liveScore} on Level{" "}
                  {celebrationPayload ? clampProgressionLevel(celebrationPayload.scoredAtLevel) : progressionLevel}:{" "}
                  {celebrationPayload
                    ? ironSkillsLevelTitle(celebrationPayload.scoredAtLevel)
                    : ironSkillsLevelTitle(progressionLevel)}
                  .
                </p>
                {celebrationPayload?.unlockedNextTier ? (
                  <p className="mt-3 text-base font-semibold text-primary">
                    Unlocked Level {clampProgressionLevel(celebrationPayload.scoredAtLevel + 1)}:{" "}
                    {ironSkillsLevelTitle(celebrationPayload.scoredAtLevel + 1)}
                  </p>
                ) : celebrationPayload &&
                  clampProgressionLevel(celebrationPayload.scoredAtLevel) >=
                    IRON_SKILLS_MAX_PROGRESSION_LEVEL ? (
                  <p className="mt-3 text-sm text-gray-600">
                    You&apos;re on Master Challenge — keep stacking clean sessions.
                  </p>
                ) : celebrationPayload ? (
                  <p className="mt-3 text-sm text-amber-900">
                    Session saved. If your tier didn&apos;t advance, refresh the page — your profile sync may
                    have failed.
                  </p>
                ) : null}
                <p className="mt-6 text-xs text-gray-500">
                  Session saved to practice_logs; progression is stored on your profile.
                </p>
                <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={resetSession}
                    className="rounded-xl border-2 border-primary bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                  >
                    Play another round
                  </button>
                  <Link
                    href="/practice"
                    className="rounded-xl border-2 border-gray-200 bg-white px-5 py-3 text-center text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
                  >
                    Back to Practice
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
