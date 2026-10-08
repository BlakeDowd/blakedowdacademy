"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Flag, ListChecks } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  averagePointsPerShot,
  fingerBandPoints,
  horizontalStrikeSummaryLines,
  qualityBonusPoints,
  shotPoints,
  totalSessionPoints,
  wallPercentage,
  zeroPointRangePercentage,
  type IronFingerMiss,
} from "@/lib/ironPrecisionScoring";
import {
  ironPrecisionProtocolConfig,
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";
import {
  buildClubSequence,
  clubsFromBag,
  IRON_TEST_DEFAULT_CLUBS,
  IRON_TEST_MIN_CLUBS,
  IRON_TEST_SHOTS,
  parseSavedClubs,
  sortClubsByLoft,
} from "@/lib/ironCombineClubs";
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
import { ClubPicker, IronHeroArt, IronShotDiagram, MissSidePicker, Segmented } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, FocusCard } from "@/components/combine/CombineBreakdown";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { refreshAuthSessionIfPossible } from "@/lib/supabasePersistSession";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { saveCombineProfile } from "@/lib/saveCombineProfile";

const FINGER_OPTIONS: IronFingerMiss[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];
const MAX_SHOT_POINTS = 12;
const CLUBS_STORAGE_PREFIX = "iron-precision-clubs:";

type ShotPayload = {
  shot: number;
  club: string;
  direction: IronMissDirection;
  fingers: IronFingerMiss;
  strike: IronStrike;
  contact: IronContact;
  points: number;
};

type CombineProfile = Record<string, unknown>;

function readStoredClubs(userId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(CLUBS_STORAGE_PREFIX + userId);
    return raw ? parseSavedClubs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function storeClubs(userId: string, clubs: string[]) {
  try {
    window.localStorage.setItem(CLUBS_STORAGE_PREFIX + userId, JSON.stringify(clubs));
  } catch {
    /* storage full or blocked */
  }
}

/** Last saved picks, else clubs matched from the Virtual Caddie bag, else null. */
async function loadSavedClubs(userId: string): Promise<string[] | null> {
  const local = readStoredClubs(userId);
  if (local) return local;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const [{ data: profile }, { data: bag }] = await Promise.all([
      supabase.from("profiles").select("combine_profile").eq("id", userId).maybeSingle(),
      supabase.from("user_clubs").select("club_name, short_label").eq("user_id", userId),
    ]);
    const saved = parseSavedClubs((profile?.combine_profile as CombineProfile | null)?.iron_precision_protocol_clubs);
    if (saved) return saved;
    const labels = (bag ?? []).flatMap((c: { club_name: string | null; short_label: string | null }) =>
      [c.short_label, c.club_name].filter((v): v is string => !!v),
    );
    const fromBag = clubsFromBag(labels);
    return fromBag.length >= IRON_TEST_MIN_CLUBS ? fromBag : null;
  } catch {
    return null;
  }
}

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  shots: ShotPayload[],
  clubs: string[],
  totalPoints: number,
  avgPointsPerShot: number,
  wallPct: number,
  zeroPointPct: number,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    await refreshAuthSessionIfPossible(supabase);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      return "Your sign-in session expired. Please sign in again, then try saving again.";
    }
    const strike_payload = shots.map(({ shot, club, direction, fingers, strike, contact, points }) => ({
      shot,
      club,
      fingers,
      strike: normalizeLegacyVerticalStrike(strike),
      contact,
      points: Number.isFinite(points) ? points : 0,
      metadata: { direction },
    }));

    const safeWall = Number.isFinite(wallPct) ? wallPct : 0;
    const safeZero = Number.isFinite(zeroPointPct) ? zeroPointPct : 0;
    const distance_payload = [{ wall_pct: safeWall, zero_point_pct: safeZero }];

    const avg = Number.isFinite(avgPointsPerShot) ? avgPointsPerShot : 0;
    const totalPts = Number.isFinite(totalPoints) ? totalPoints : 0;

    const { error: logError } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: ironPrecisionProtocolConfig.practiceLogType,
      strike_data: strike_payload,
      start_line_data: [],
      distance_data: distance_payload,
      matrix_score_average: avg,
      total_points: totalPts,
      score: totalPts,
      duration_minutes: 0,
    });

    if (logError) {
      const msg = formatSupabaseWriteError(logError);
      console.warn("[IronPrecision] practice_logs insert:", msg, logError);
      // Compatibility fallback for environments with restrictive practice_logs CHECK constraints.
      const { error: practiceError } = await supabase.from("practice").insert({
        user_id: userId,
        type: ironPrecisionProtocolConfig.practiceLogType,
        test_type: ironPrecisionProtocolConfig.practiceLogType,
        duration_minutes: 0,
        notes: JSON.stringify({
          kind: "iron_precision_protocol_fallback",
          total_points: totalPts,
          matrix_score_average: avg,
          wall_pct: safeWall,
          zero_point_pct: safeZero,
        }),
      });
      if (practiceError) {
        const practiceMsg = formatSupabaseWriteError(practiceError);
        console.warn("[IronPrecision] practice fallback insert:", practiceMsg, practiceError);
        return msg;
      }
    }

    await awardCombineCompletionXp(userId);

    const { data: profileRow, error: profileFetchError } = await supabase
      .from("profiles")
      .select("combine_profile")
      .eq("id", userId)
      .maybeSingle();

    if (profileFetchError) {
      console.warn("[IronPrecision] profiles fetch:", profileFetchError.message);
    } else {
      const prev = (profileRow?.combine_profile as CombineProfile | null) ?? {};
      const nextCombine: CombineProfile = {
        ...prev,
        iron_precision_protocol_index: avg,
        iron_precision_protocol_last_total_points: totalPts,
        iron_precision_protocol_last_wall_pct: safeWall,
        iron_precision_protocol_last_zero_point_pct: safeZero,
        iron_precision_protocol_clubs: clubs,
      };
      const profileUpdateError = await saveCombineProfile(supabase, userId, nextCombine);
      if (profileUpdateError) {
        console.warn("[IronPrecision] profiles update:", profileUpdateError.message);
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.error("[IronPrecision] persistSession threw:", e);
    return msg;
  }
}

function pointsTone(points: number): string {
  if (points >= 12) return "bg-[#014421] text-white";
  if (points >= 9) return "bg-green-200 text-[#014421]";
  if (points >= 4) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function missLabel(s: Pick<ShotPayload, "direction" | "fingers">): string {
  if (s.direction === "straight") return "On line";
  const side = s.direction === "left" ? "Left" : "Right";
  return s.fingers === "outside" ? `${side} 4+` : `${side} ${s.fingers}`;
}

const STRIKE_LABEL: Record<IronStrike, string> = { fat: "Fat", solid: "Solid", thin: "Thin" };
const CONTACT_LABEL: Record<IronContact, string> = { heel: "Heel", middle: "Middle", toe: "Toe" };

function summarize(shots: ShotPayload[]) {
  const inputs = shots.map((s) => ({ fingers: s.fingers, strike: s.strike, contact: s.contact }));
  return {
    totalPoints: totalSessionPoints(inputs),
    avgPoints: averagePointsPerShot(inputs),
    wallPct: wallPercentage(inputs),
    zeroPointPct: zeroPointRangePercentage(inputs),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Everything the results screen shows, including the "focus next" tip. */
function breakdown(shots: ShotPayload[]) {
  const n = shots.length;
  const base = summarize(shots);
  const strikes = { solid: 0, fat: 0, thin: 0 };
  const contacts = { middle: 0, heel: 0, toe: 0 };
  let left = 0;
  let right = 0;
  let accuracyPts = 0;
  let bonusPts = 0;
  const clubs = new Map<string, { points: number; n: number }>();
  for (const s of shots) {
    strikes[normalizeLegacyVerticalStrike(s.strike)]++;
    contacts[s.contact]++;
    if (s.direction === "left") left++;
    if (s.direction === "right") right++;
    accuracyPts += fingerBandPoints(s.fingers);
    bonusPts += qualityBonusPoints(s.strike, s.contact);
    const c = clubs.get(s.club) ?? { points: 0, n: 0 };
    clubs.set(s.club, { points: c.points + s.points, n: c.n + 1 });
  }
  const accuracyLost = n * 10 - accuracyPts;
  const strikeLost = n * 2 - bonusPts;

  const byClub = sortClubsByLoft([...clubs.keys()]).map((club) => {
    const c = clubs.get(club)!;
    return { club, avg: c.points / c.n, n: c.n };
  });
  const ranked = [...byClub].sort((a, b) => b.avg - a.avg);
  const spread = ranked.length > 1 && ranked[0]!.avg > ranked[ranked.length - 1]!.avg;
  const bestClub = spread ? ranked[0]!.club : null;
  const worstClub = spread ? ranked[ranked.length - 1]!.club : null;

  const side = left > right * 1.5 && left >= 2 ? "left" : right > left * 1.5 && right >= 2 ? "right" : null;
  const lineTip = side
    ? `${side === "left" ? left : right} of your ${left + right} misses went ${side}, so check your aim and the face at impact.`
    : "Misses went both ways, so work on a consistent clubface rather than your aim.";
  const topStrike = [
    { n: strikes.fat, text: "fat (ground first)" },
    { n: strikes.thin, text: "thin" },
    { n: contacts.heel, text: "off the heel" },
    { n: contacts.toe, text: "off the toe" },
  ].sort((a, b) => b.n - a.n)[0]!;
  const strikeTip = topStrike.n > 0 ? `Your most common strike miss was ${plural(topStrike.n, "shot")} ${topStrike.text}.` : null;

  let focus: { title: string; lines: string[] };
  if (accuracyLost === 0 && strikeLost === 0) {
    focus = { title: "Perfect round", lines: ["Every shot on line and out of the middle. Add a harder target next time."] };
  } else if (accuracyLost >= strikeLost) {
    focus = { title: "Focus next: start line", lines: [`Misses off line cost you ${accuracyLost} pts.`, lineTip] };
    if (strikeTip && topStrike.n >= 3) focus.lines.push(`Also: ${strikeTip.charAt(0).toLowerCase()}${strikeTip.slice(1)}`);
  } else {
    focus = {
      title: "Focus next: strike",
      lines: [`Missing the solid-and-middle bonus cost you ${strikeLost} pts.`, strikeTip ?? "Keep finding the middle of the face."],
    };
  }
  if (worstClub) focus.lines.push(`${worstClub} was your weakest club this round.`);

  return {
    ...base,
    solidMiddle: shots.filter((x) => qualityBonusPoints(x.strike, x.contact) > 0).length,
    strikeByDirLines: horizontalStrikeSummaryLines(shots),
    strikes,
    contacts,
    left,
    right,
    straight: n - left - right,
    accuracyLost,
    strikeLost,
    byClub,
    bestClub,
    worstClub,
    focus,
  };
}

const MAP_RANGE = 5;
const OUTSIDE_X = 4.6;
const DOT_ROW_PX = 26;
/** In fingers; dots closer than this go on the next row up. */
const MIN_DOT_GAP = 1.6;

function signedMiss(s: ShotPayload): number {
  if (s.direction === "straight") return 0;
  const f = s.fingers === "outside" ? OUTSIDE_X : s.fingers;
  return s.direction === "left" ? -f : f;
}

const pctOf = (x: number) => 50 + (x / MAP_RANGE) * 50;

/** Left-to-right picture of where each shot finished, with the scoring bands behind it. */
function MissMap({ shots }: { shots: ShotPayload[] }) {
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
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${pointsTone(s.points)}`}
            style={{ left: `${pctOf(x)}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`${s.club}: ${missLabel(s)}, ${s.points} pts`}
          >
            {s.club}
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

export function IronPrecisionProtocolRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [pickedClubs, setPickedClubs] = useState<string[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [sequence, setSequence] = useState<string[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [direction, setDirection] = useState<IronMissDirection>("straight");
  const [fingers, setFingers] = useState<IronFingerMiss | null>(0);
  const [strike, setStrike] = useState<IronStrike>("solid");
  const [contact, setContact] = useState<IronContact>("middle");
  const [completedShots, setCompletedShots] = useState<ShotPayload[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const clubs = userId ? await loadSavedClubs(userId) : null;
      if (cancelled) return;
      setPickedClubs(clubs ?? IRON_TEST_DEFAULT_CLUBS);
      setLoadedFor(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const clubs = pickedClubs ?? IRON_TEST_DEFAULT_CLUBS;
  const clubsReady = loadedFor === userId;
  const total = sequence.length || IRON_TEST_SHOTS;
  const currentClub = sequence[shotIndex] ?? "";
  const shotNumber = shotIndex + 1;

  const resetShot = () => {
    setDirection("straight");
    setFingers(0);
    setStrike("solid");
    setContact("middle");
  };

  const startTest = useCallback(() => {
    const picks = sortClubsByLoft(clubs);
    if (picks.length < IRON_TEST_MIN_CLUBS) return;
    if (userId) storeClubs(userId, picks);
    setSequence(buildClubSequence(picks));
    setStatus("active");
    setShotIndex(0);
    resetShot();
    setCompletedShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, [clubs, userId]);

  const save = useCallback(
    async (shots: ShotPayload[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const s = summarize(shots);
      let saveErr: string | null;
      try {
        saveErr = await persistSession(userId, shots, sortClubsByLoft(clubs), s.totalPoints, s.avgPoints, s.wallPct, s.zeroPointPct);
      } catch (e) {
        saveErr = formatSupabaseWriteError(e);
        console.error("[IronPrecision] save threw:", e);
      }
      setSaved(saveErr == null);
      if (saveErr) {
        setSaveError(saveErr);
        persistAttemptedRef.current = false;
      }
    },
    [userId, clubs],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    if (direction !== "straight" && fingers === null) return;
    const effFingers: IronFingerMiss = direction === "straight" ? 0 : (fingers as IronFingerMiss);
    const record: ShotPayload = {
      shot: shotNumber,
      club: currentClub,
      direction,
      fingers: effFingers,
      strike,
      contact,
      points: shotPoints(effFingers, strike, contact),
    };
    const nextLog = [...completedShots, record];
    setCompletedShots(nextLog);
    resetShot();

    if (shotNumber >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(nextLog);
    } else {
      setShotIndex((i) => i + 1);
    }
  }, [status, fingers, strike, contact, direction, shotNumber, currentClub, completedShots, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || completedShots.length === 0) return;
    const last = completedShots[completedShots.length - 1]!;
    setCompletedShots((s) => s.slice(0, -1));
    setShotIndex((i) => Math.max(0, i - 1));
    setDirection(last.direction);
    setFingers(last.direction === "straight" ? 0 : last.fingers);
    setStrike(last.strike);
    setContact(last.contact);
  }, [status, completedShots]);

  const retryPersist = useCallback(() => {
    if (completedShots.length < total) return;
    void save(completedShots);
  }, [completedShots, total, save]);

  const summary = useMemo(
    () => (status === "complete" && completedShots.length >= total ? breakdown(completedShots) : null),
    [status, completedShots, total],
  );

  if (status === "intro") {
    const enough = clubs.length >= IRON_TEST_MIN_CLUBS;
    return (
      <div className="space-y-4">
        <CombineHero
          title={ironPrecisionProtocolConfig.testName}
          kicker="Iron combine"
          art={<IronHeroArt />}
          chips={[`${IRON_TEST_SHOTS} shots`, "Your clubs", "~15 min", "Highest score wins"]}
        />
        {clubsReady ? (
          <ClubPicker selected={clubs} onChange={setPickedClubs} />
        ) : (
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading your clubs" />
        )}
        <IntroSteps
          steps={[
            { icon: <Flag className="h-5 w-5" aria-hidden />, title: "Pick a target for every shot", hint: "A flag or marker at a full-swing distance" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the miss in fingers", hint: "Hold your hand at arm's length, then count from the target" },
            { icon: <ListChecks className="h-5 w-5" aria-hidden />, title: "Log the strike and contact", hint: "Fat, solid or thin, then heel, middle or toe" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>On line or 0 to 0.5 fingers: 10 pts</li>
            <li>1 to 1.5 fingers: 7 pts · 2 to 2.5 fingers: 4 pts · 3 to 4 fingers: 1 pt</li>
            <li>Wider than 4 fingers: 0 pts</li>
            <li>Solid strike from the middle of the face: +2 bonus</li>
            <li className="font-semibold text-gray-900">
              Best possible is {IRON_TEST_SHOTS * MAX_SHOT_POINTS} points. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest} disabled={!clubsReady || !enough}>
          Start the test
        </PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const max = total * MAX_SHOT_POINTS;
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing pct={summary.totalPoints / max} value={summary.totalPoints} caption={`of ${max} points`} />
          <p className="mt-2 text-xs text-white/70">Iron precision score · higher is better</p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg per shot", value: summary.avgPoints.toFixed(1) },
            { label: "Within 1 finger", value: `${summary.wallPct.toFixed(0)}%` },
            { label: "Solid + middle", value: `${summary.solidMiddle}/${total}` },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Where your points went" aside={`${summary.totalPoints} of ${max}`}>
          <BreakdownBar
            segments={[
              { label: "Scored", value: summary.totalPoints, tone: "bg-[#014421]" },
              { label: "Lost to misses", value: summary.accuracyLost, tone: "bg-[#FFA500]" },
              { label: "Lost to strike", value: summary.strikeLost, tone: "bg-red-400" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="Miss pattern" aside={`L ${summary.left} · On line ${summary.straight} · R ${summary.right}`}>
          <MissMap shots={completedShots} />
          {summary.strikeByDirLines.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {summary.strikeByDirLines.map((line) => (
                <p key={line} className="text-xs text-gray-600">
                  {line}
                </p>
              ))}
            </div>
          )}
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

        <BreakdownCard title="By club" aside="Avg points">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {summary.byClub.map((c) => (
              <div key={c.club} className={`rounded-xl px-2 py-2 text-center ${pointsTone(c.avg)}`}>
                <p className="text-sm font-extrabold">{c.club}</p>
                <p className="text-lg font-extrabold tabular-nums leading-tight">{Number.isInteger(c.avg) ? c.avg : c.avg.toFixed(1)}</p>
                <p className="text-[10px] font-semibold opacity-80">
                  {c.club === summary.bestClub ? "Best" : c.club === summary.worstClub ? "Work on" : c.n > 1 ? `${c.n} shots` : "\u00a0"}
                </p>
              </div>
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
            {completedShots.map((s) => (
              <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{s.club}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600">
                  {missLabel(s)} · {STRIKE_LABEL[normalizeLegacyVerticalStrike(s.strike)]} · {CONTACT_LABEL[s.contact]}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>
                  {s.points}
                </span>
              </li>
            ))}
          </ul>
        </details>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? retryPersist : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const canRecord = direction === "straight" || fingers !== null;
  const liveScore = canRecord ? shotPoints(direction === "straight" ? 0 : (fingers as IronFingerMiss), strike, contact) : null;
  const runningTotal = completedShots.reduce((sum, s) => sum + s.points, 0);
  const nextClub = sequence[shotIndex + 1];
  const repeatOfPrevious = shotIndex > 0 && sequence[shotIndex - 1] === currentClub;
  const track: TrackItem[] = sequence.map((_, i) => {
    const s = completedShots[i];
    return s ? { label: String(s.points), tone: pointsTone(s.points), ariaLabel: `Shot ${i + 1} (${s.club}): ${s.points} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold leading-none text-gray-900">{currentClub}</p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">
            {repeatOfPrevious ? "Second shot with this club" : nextClub ? `Next: ${nextClub}` : "Last shot"}
          </p>
        </div>
      </div>

      {completedShots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <MissSidePicker
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setFingers(d === "straight" ? 0 : null);
          }}
        />
      </div>

      {direction !== "straight" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How many fingers off the target?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FINGER_OPTIONS.map((f) => {
              const active = fingers === f;
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFingers(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active
                      ? f === "outside"
                        ? "bg-red-500 text-white"
                        : "bg-[#014421] text-white"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {f === "outside" ? "4+" : f}
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
