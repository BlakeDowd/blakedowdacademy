"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { addProfileXp, XP_AWARD_PER_LOGGED_ROUND } from "@/lib/addProfileXp";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleSlash,
  MoveDown,
  MoveDownLeft,
  MoveDownRight,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveUpLeft,
  MoveUpRight,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { logActivity } from "@/lib/activity";
import { InfoBubble } from "@/components/InfoBubble";
import { ShareRoundCommunityModal } from "@/components/ShareRoundCommunityModal";
import {
  RoundCalcLine,
  RoundStatCounter,
  RoundStatNumberField,
  RoundStatReadout,
} from "@/components/logRound/RoundStatCounter";
import { TrackedStatsSheet } from "@/components/logRound/TrackedStatsSheet";
import {
  ALL_ROUND_STATS,
  DEFAULT_TRACKED_ROUND_STATS,
  ROUND_STAT_GROUPS,
  SCORE_DISTRIBUTION_COLORS,
  DEFAULT_FAIRWAYS_POSSIBLE,
  loadTrackedRoundStats,
  saveTrackedRoundStats,
  type RoundStatKey,
} from "@/lib/roundStatTracking";

/** Direction / GIR taps on the 3×3 matrix. */
type AdvancedApproachMatrixResult =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "gir"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Matrix results plus “no realistic GIR” situations (tee trouble or distance / lay-up). */
type AdvancedApproachResult =
  | AdvancedApproachMatrixResult
  | "tee-no-gir"
  | "distance-no-gir";

type DirectionalApproachShot = {
  id: string;
  hole: number;
  club: string;
  result: AdvancedApproachResult;
};

function newApproachShotId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const APPROACH_CLUB_OPTIONS = [
  "Driver",
  "3W",
  "5W",
  "3H",
  "4H",
  "5H",
  "4i",
  "5i",
  "6i",
  "7i",
  "8i",
  "9i",
  "PW",
  "GW",
  "SW",
  "LW",
] as const;

const APPROACH_RESULT_ICONS: Record<AdvancedApproachMatrixResult, LucideIcon> = {
  "top-left": MoveUpLeft,
  top: MoveUp,
  "top-right": MoveUpRight,
  left: MoveLeft,
  gir: Check,
  right: MoveRight,
  "bottom-left": MoveDownLeft,
  bottom: MoveDown,
  "bottom-right": MoveDownRight,
};

const APPROACH_MATRIX_ROWS: AdvancedApproachMatrixResult[][] = [
  ["top-left", "top", "top-right"],
  ["left", "gir", "right"],
  ["bottom-left", "bottom", "bottom-right"],
];

function formatApproachResultLabel(result: AdvancedApproachResult): string {
  if (result === "tee-no-gir") return "Tee / recovery — no GIR line";
  if (result === "distance-no-gir") return "Too far / lay-up — no GIR line";
  if (result === "gir") return "GIR (green hit)";
  return result.replace(/-/g, " ");
}

const HOLES = 18;

interface RoundData {
  // Scoring
  date: string;
  course: string;
  handicap: number | null;
  score: number | null;
  nett: number | null;
  stableford: number | null;
  frontNine: number | null;
  backNine: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  /** Exactly double bogey here; saved to `double_bogeys` together with triples (2+ bogey). */
  doubleBogeys: number;
  tripleBogeys: number;

  // Driving
  firLeft: number;
  firHit: number;
  firRight: number;
  fairwaysPossible: number;
  /** Possible fairways stay at the default until the player sets them. */
  autoFairwaysPossible: boolean;

  // Approach
  totalGir: number;
  goingForGreen: number;
  gir8ft: number;
  gir20ft: number;

  // Penalties
  totalPenalties: number;
  teePenalties: number;
  approachPenalties: number;

  // Short game
  upAndDownConversions: number;
  /** Up & down attempts (stored in the legacy `missed` column). */
  missed: number;
  /** Attempts follow greens missed (holes − GIR) until the player sets them. */
  autoUpDownAttempts: boolean;
  bunkerAttempts: number;
  bunkerSaves: number;
  chipInside6ft: number;
  doubleChips: number;

  // Putting
  totalPutts: number;
  puttsPerGir: number | null;
  threePutts: number;
  made6ftAndIn: number;
  puttsUnder6ftAttempts: number;
}

type CounterField = {
  [K in keyof RoundData]-?: RoundData[K] extends number ? K : never;
}[keyof RoundData];

/** Applies a change and keeps linked fields consistent (nett, fairways possible, made ≤ attempts). */
function applyRoundChange(prev: RoundData, patch: Partial<RoundData>, girTracked: boolean): RoundData {
  const next: RoundData = { ...prev, ...patch };
  if ("fairwaysPossible" in patch && patch.autoFairwaysPossible === undefined) next.autoFairwaysPossible = false;
  if ("missed" in patch && patch.autoUpDownAttempts === undefined) next.autoUpDownAttempts = false;

  const fairwaysUsed = next.firHit + next.firLeft + next.firRight;
  const basePossible = next.autoFairwaysPossible ? DEFAULT_FAIRWAYS_POSSIBLE : next.fairwaysPossible;
  next.fairwaysPossible = Math.max(basePossible, fairwaysUsed);

  if (next.autoUpDownAttempts && girTracked) next.missed = Math.max(0, HOLES - next.totalGir);
  next.upAndDownConversions = Math.min(next.upAndDownConversions, next.missed);
  next.bunkerSaves = Math.min(next.bunkerSaves, next.bunkerAttempts);
  next.made6ftAndIn = Math.min(next.made6ftAndIn, next.puttsUnder6ftAttempts);

  next.nett =
    next.score !== null && next.handicap !== null
      ? Math.round((next.score - next.handicap) * 10) / 10
      : null;
  return next;
}

/** Parse a text field to a finite number, or null when empty / incomplete / invalid. */
function optionalNumberFromInput(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** One decimal place for handicap / nett (matches numeric(5,1) columns). */
function roundToOneDecimal(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 10) / 10;
}

/** Whole-number gross score for integer score columns. */
function roundScoreForDb(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value);
}

const pctText = (made: number, total: number) => (total > 0 ? `${Math.round((made / total) * 100)}%` : null);

const ROUND_SHARE_PREF_KEY = "roundShareOnCommunityPref";

/** Newer `rounds` columns; saves retry without any the database doesn't have yet. */
const OPTIONAL_ROUND_COLUMNS = [
  "share_on_community",
  "tracked_stats",
  "stableford",
  "front_nine",
  "back_nine",
  "fairways_possible",
  "putts_per_gir",
  "triple_bogeys",
] as const;

const STAT_LABELS = new Map(ROUND_STAT_GROUPS.flatMap((g) => g.stats.map((s) => [s.key, s.label] as const)));

function loadShareOnCommunityPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(ROUND_SHARE_PREF_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function saveShareOnCommunityPref(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROUND_SHARE_PREF_KEY, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}

function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return e.message || e.details || e.hint || e.code || JSON.stringify(error);
}

const FIELD_INPUT =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[15px] text-stone-900 focus:border-[#014421] focus:bg-white focus:outline-none";
function StatCard({
  title,
  onClear,
  aside,
  children,
}: {
  title: string;
  onClear?: () => void;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-4 pb-4 pt-3.5 shadow-sm">
      <div className="mb-1 flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">{title}</h2>
        <div className="flex items-center gap-1.5">
          {aside}
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              title="Clear all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SubLabel({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{children}</p>
      {info ? (
        <InfoBubble
          content={info}
          buttonClassName="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-[8px] font-bold text-stone-400"
          tooltipClassName="-left-16 bottom-full mb-2 w-56 max-w-[14rem]"
        />
      ) : null}
    </div>
  );
}

export default function LogRoundPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [isSaving, setIsSaving] = useState(false);

  const [trackedStats, setTrackedStats] = useState<RoundStatKey[]>(DEFAULT_TRACKED_ROUND_STATS);
  const [trackedSheetOpen, setTrackedSheetOpen] = useState(false);

  const formStats = new Set<RoundStatKey>(trackedStats);
  const tracks = (key: RoundStatKey) => formStats.has(key);
  const girTracked = tracks("gir");

  const [roundData, setRoundData] = useState<RoundData>({
    date: today,
    course: '',
    handicap: null,
    score: null,
    nett: null,
    stableford: null,
    frontNine: null,
    backNine: null,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    tripleBogeys: 0,
    firLeft: 0,
    firHit: 0,
    firRight: 0,
    fairwaysPossible: DEFAULT_FAIRWAYS_POSSIBLE,
    autoFairwaysPossible: true,
    totalGir: 0,
    goingForGreen: 0,
    gir8ft: 0,
    gir20ft: 0,
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    upAndDownConversions: 0,
    missed: 0,
    autoUpDownAttempts: true,
    bunkerAttempts: 0,
    bunkerSaves: 0,
    chipInside6ft: 0,
    doubleChips: 0,
    totalPutts: 0,
    puttsPerGir: null,
    threePutts: 0,
    made6ftAndIn: 0,
    puttsUnder6ftAttempts: 0,
  });

  const changeRound = (patch: Partial<RoundData>, girOn = girTracked) =>
    setRoundData((prev) => applyRoundChange(prev, patch, girOn));
  const setCounter = (field: CounterField, value: number) => changeRound({ [field]: value });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void loadTrackedRoundStats(user.id).then((stats) => {
      if (cancelled) return;
      setTrackedStats(stats);
      setRoundData((prev) => applyRoundChange(prev, {}, stats.includes("gir")));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const saveTrackedStats = (stats: RoundStatKey[]) => {
    setTrackedStats(stats);
    setTrackedSheetOpen(false);
    changeRound({}, stats.includes("gir"));
    if (user?.id) void saveTrackedRoundStats(user.id, stats);
  };

  const [shareOnCommunity, setShareOnCommunity] = useState(true);
  const [sharePromptOpen, setSharePromptOpen] = useState(false);

  useEffect(() => {
    setShareOnCommunity(loadShareOnCommunityPref());
  }, []);

  /** Controlled strings so values like `83.` stay editable while still syncing numeric `roundData`. */
  const [scoreText, setScoreText] = useState("");
  const [handicapText, setHandicapText] = useState("");
  const [totalPuttsText, setTotalPuttsText] = useState("");
  const [stablefordText, setStablefordText] = useState("");
  const [frontNineText, setFrontNineText] = useState("");
  const [backNineText, setBackNineText] = useState("");
  const [puttsPerGirText, setPuttsPerGirText] = useState("");

  const [showAdvancedApproachMatrix, setShowAdvancedApproachMatrix] = useState(false);
  const [selectedApproachHole, setSelectedApproachHole] = useState(1);
  const [selectedApproachClub, setSelectedApproachClub] = useState<string>("7i");
  const [directionalApproachShots, setDirectionalApproachShots] = useState<
    DirectionalApproachShot[]
  >([]);
  const [lastTappedApproachResult, setLastTappedApproachResult] =
    useState<AdvancedApproachResult | null>(null);

  const appendDirectionalApproachShot = (result: AdvancedApproachResult) => {
    const holeForShot = selectedApproachHole;
    const maxHole = HOLES;
    setDirectionalApproachShots((prev) => [
      ...prev,
      {
        id: newApproachShotId(),
        hole: holeForShot,
        club: selectedApproachClub,
        result,
      },
    ]);
    setLastTappedApproachResult(result);
    setSelectedApproachHole((h) => Math.min(maxHole, h + 1));
  };

  const removeDirectionalApproachShot = (id: string) => {
    setDirectionalApproachShots((prev) => prev.filter((s) => s.id !== id));
  };

  const shotsForSelectedApproachHole = directionalApproachShots.filter(
    (s) => s.hole === selectedApproachHole,
  );

  const onNineChange = (which: "frontNine" | "backNine", raw: string) => {
    (which === "frontNine" ? setFrontNineText : setBackNineText)(raw);
    const parsed = optionalNumberFromInput(raw);
    const value = parsed === null ? null : Math.round(parsed);
    const other = which === "frontNine" ? roundData.backNine : roundData.frontNine;
    const patch: Partial<RoundData> = { [which]: value };
    if (value !== null && other !== null) {
      patch.score = value + other;
      setScoreText(String(value + other));
    }
    changeRound(patch);
  };

  const clearScoringExtras = () => {
    setStablefordText("");
    setFrontNineText("");
    setBackNineText("");
    changeRound({ stableford: null, frontNine: null, backNine: null });
  };

  const clearDistribution = () =>
    changeRound({
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubleBogeys: 0,
      tripleBogeys: 0,
    });

  const clearDriving = () =>
    changeRound({ firLeft: 0, firHit: 0, firRight: 0, autoFairwaysPossible: true, fairwaysPossible: 0 });

  const clearApproach = () => {
    changeRound({ totalGir: 0, goingForGreen: 0, gir8ft: 0, gir20ft: 0 });
    setDirectionalApproachShots([]);
    setShowAdvancedApproachMatrix(false);
    setLastTappedApproachResult(null);
    setSelectedApproachHole(1);
  };

  const clearPenalties = () => changeRound({ totalPenalties: 0, teePenalties: 0, approachPenalties: 0 });

  const clearShortGame = () =>
    changeRound({
      upAndDownConversions: 0,
      missed: 0,
      autoUpDownAttempts: true,
      bunkerAttempts: 0,
      bunkerSaves: 0,
      chipInside6ft: 0,
      doubleChips: 0,
    });

  const clearPutting = () => {
    setTotalPuttsText("");
    setPuttsPerGirText("");
    changeRound({
      totalPutts: 0,
      puttsPerGir: null,
      threePutts: 0,
      made6ftAndIn: 0,
      puttsUnder6ftAttempts: 0,
    });
  };

  const puttsRequired = tracks("putts");
  const isRequiredFilled =
    Boolean(roundData.course) && roundData.score !== null && (!puttsRequired || roundData.totalPutts > 0);

  const saveRound = async (shareChoice?: boolean) => {
    const share = shareChoice ?? shareOnCommunity;
    if (!isRequiredFilled) {
      alert(`Please fill in all required fields (Course, Score${puttsRequired ? ", Total Putts" : ""})`);
      return;
    }

    if (!user?.id) {
      console.error('User not authenticated - user.id is missing:', user);
      alert('User not authenticated. Please log in and try again.');
      return;
    }

    const currentUserId = user.id;
    setIsSaving(true);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const handicapDb = roundToOneDecimal(roundData.handicap);
      const nettDb = roundToOneDecimal(roundData.nett);
      const scoreDb = roundScoreForDb(roundData.score);
      const roundStats = ALL_ROUND_STATS.filter((k) => formStats.has(k));
      // Older columns default to 0, so untracked stats save as 0 and `tracked_stats` says to ignore them.
      const count = (key: RoundStatKey, value: number) => (formStats.has(key) ? value : 0);
      const optional = <T,>(key: RoundStatKey, value: T | null) => (formStats.has(key) ? value : null);
      const insertData: Record<string, unknown> = {
        user_id: currentUserId,
        date: roundData.date || today,
        course_name: roundData.course,
        handicap: handicapDb,
        holes: HOLES,
        score: scoreDb,
        nett: nettDb,
        stableford: optional("stableford", roundData.stableford),
        front_nine: optional("front_back", roundData.frontNine),
        back_nine: optional("front_back", roundData.backNine),
        // Scoring distribution (double_bogeys keeps meaning "double or worse")
        eagles: count("distribution", roundData.eagles),
        birdies: count("distribution", roundData.birdies),
        pars: count("distribution", roundData.pars),
        bogeys: count("distribution", roundData.bogeys),
        double_bogeys: count("distribution", roundData.doubleBogeys + roundData.tripleBogeys),
        triple_bogeys: optional("distribution", roundData.tripleBogeys),
        // Driving
        fir_left: count("fairways", roundData.firLeft),
        fir_hit: count("fairways", roundData.firHit),
        fir_right: count("fairways", roundData.firRight),
        fairways_possible: optional("fairways", roundData.fairwaysPossible),
        // Approach
        total_gir: count("gir", roundData.totalGir),
        going_for_green: count("going_for_green", roundData.goingForGreen),
        gir_8ft: count("gir_proximity", roundData.gir8ft),
        gir_20ft: count("gir_proximity", roundData.gir20ft),
        // Penalties
        total_penalties: count("penalties", roundData.totalPenalties),
        tee_penalties: count("penalties", roundData.teePenalties),
        approach_penalties: count("penalties", roundData.approachPenalties),
        // Short game (`missed` / `up_and_down_missed` hold up & down attempts)
        up_and_down_conversions: count("scrambling", roundData.upAndDownConversions),
        conversions: count("scrambling", roundData.upAndDownConversions),
        up_and_down_missed: count("scrambling", roundData.missed),
        missed: count("scrambling", roundData.missed),
        bunker_attempts: count("sand_saves", roundData.bunkerAttempts),
        bunker_saves: count("sand_saves", roundData.bunkerSaves),
        chip_ins: count("chipping", roundData.doubleChips),
        chip_inside_6ft: count("chipping", roundData.chipInside6ft),
        double_chips: count("chipping", roundData.doubleChips),
        // Putting
        total_putts: count("putts", roundData.totalPutts),
        putts_per_gir: optional("putts_per_gir", roundData.puttsPerGir),
        three_putts: count("three_putts", roundData.threePutts),
        made_under_6ft: count("short_putts", roundData.made6ftAndIn),
        putts_under_6ft_attempts: count("short_putts", roundData.puttsUnder6ftAttempts),
        approach_directional_shots: formStats.has("advanced_approach") ? directionalApproachShots : [],
        share_on_community: share,
        tracked_stats: roundStats,
      };

      let insertPayload: Record<string, unknown> = { ...insertData };
      let { data, error } = await supabase.from("rounds").insert(insertPayload).select();

      for (let attempt = 0; error && attempt < OPTIONAL_ROUND_COLUMNS.length; attempt++) {
        const message = `${error.message ?? ""} ${error.details ?? ""}`;
        const missingColumn = OPTIONAL_ROUND_COLUMNS.find(
          (column) => column in insertPayload && message.includes(column),
        );
        if (!missingColumn) break;
        console.warn(
          `${missingColumn} column missing — retrying save without it. Run the latest Supabase migrations.`,
        );
        insertPayload = { ...insertPayload };
        delete insertPayload[missingColumn];
        ({ data, error } = await supabase.from("rounds").insert(insertPayload).select());
      }

      if (error) {
        console.error('Database error saving round:', error);
        alert(`Failed to save round: ${error.message || 'Unknown error'}. Please check the console for details.`);
        setIsSaving(false);
        return;
      }

      console.log('Round saved successfully!', data);

      saveShareOnCommunityPref(share);
      setShareOnCommunity(share);

      await addProfileXp(currentUserId, XP_AWARD_PER_LOGGED_ROUND);
      await refreshUser();

      // Log activity to database
      await logActivity(user.id, 'round', `Posted a round of ${roundData.score}`);

      // Update handicap history and profile if a handicap was provided
      if (handicapDb !== null && handicapDb !== undefined) {
        const roundDate = roundData.date || today;

        // 1. Insert into handicap_history
        const { error: historyError } = await supabase
          .from('handicap_history')
          .insert({
            user_id: currentUserId,
            score: scoreDb ?? 0,
            new_handicap: handicapDb,
            date: roundDate,
          });

        if (historyError) {
          console.error(
            'Error saving handicap history:',
            formatSupabaseError(historyError),
            historyError,
          );
        }

        // 2. Update profiles table with new handicap
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ handicap: handicapDb })
          .eq('id', currentUserId);

        if (profileError) {
          console.error(
            'Error updating profile handicap:',
            formatSupabaseError(profileError),
            profileError,
          );
        } else {
          await refreshUser();
        }
      }

      // Dispatch event to refresh rounds from database
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('roundsUpdated'));
        // Force Academy Leaderboard refresh by dispatching a custom event
        window.dispatchEvent(new Event('academyLeaderboardRefresh'));
      }

      setIsSaving(false);
      router.push('/profile?tab=stats');
    } catch (error) {
      console.error('Unexpected error saving round:', error);
      alert(`Failed to save round: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
      setIsSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!isRequiredFilled || isSaving) return;
    setSharePromptOpen(true);
  };

  const handleSharePromptConfirm = (share: boolean) => {
    setSharePromptOpen(false);
    setShareOnCommunity(share);
    void saveRound(share);
  };

  type CounterSpec = { field: CounterField; label: string; info?: ReactNode; max?: number; dot?: string };
  const renderCounters = (specs: (CounterSpec | false)[]) => {
    const list = specs.filter((s): s is CounterSpec => Boolean(s));
    if (list.length === 0) return null;
    return (
      <div className="divide-y divide-stone-100">
        {list.map((spec) => (
          <RoundStatCounter
            key={spec.field}
            label={spec.label}
            info={spec.info}
            dot={spec.dot}
            value={roundData[spec.field]}
            max={spec.max}
            onChange={(v) => setCounter(spec.field, v)}
          />
        ))}
      </div>
    );
  };

  const distribution = [
    { field: "eagles", label: "Eagle or better" },
    { field: "birdies", label: "Birdie" },
    { field: "pars", label: "Par" },
    { field: "bogeys", label: "Bogey" },
    { field: "doubleBogeys", label: "Double bogey" },
    { field: "tripleBogeys", label: "Triple bogey+" },
  ] as const;
  const holesCounted = distribution.reduce((sum, d) => sum + roundData[d.field], 0);
  const trackedLabels = ALL_ROUND_STATS.filter((k) => trackedStats.includes(k)).map((k) => STAT_LABELS.get(k) ?? k);

  const showApproach = tracks("gir") || tracks("gir_proximity") || tracks("going_for_green") || tracks("advanced_approach");
  const showShortGame = tracks("scrambling") || tracks("sand_saves") || tracks("chipping");
  const showPutting = tracks("putts") || tracks("putts_per_gir") || tracks("three_putts") || tracks("short_putts");
  const missingToSave = [
    !roundData.course && "course",
    roundData.score === null && "gross score",
    puttsRequired && roundData.totalPutts <= 0 && "total putts",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]+)$/, " and $1");

  return (
    <div className="flex w-full flex-1 flex-col bg-[#f4f6f4]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-stone-200/70 bg-[#f4f6f4]/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="shrink-0 rounded-full p-2 text-stone-700 transition-colors hover:bg-stone-200/60"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-stone-900">Log a round</h1>
            <p className="truncate text-xs text-stone-500">Same stats as your MiScore summary</p>
          </div>
        </div>
      </div>

      <ShareRoundCommunityModal
        open={sharePromptOpen}
        onClose={() => setSharePromptOpen(false)}
        onConfirm={handleSharePromptConfirm}
        context="save"
      />

      <TrackedStatsSheet
        open={trackedSheetOpen}
        initial={trackedStats}
        onClose={() => setTrackedSheetOpen(false)}
        onSave={saveTrackedStats}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setTrackedSheetOpen(true)}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-stone-300"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
              <SlidersHorizontal className="h-4 w-4 text-[#014421]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-900">Stats I track</span>
              <span className="block truncate text-xs text-stone-500">
                Score{trackedLabels.length > 0 ? `, ${trackedLabels.join(", ")}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-[#014421]">Edit</span>
          </button>

          <div className="space-y-3 pb-6">
          {/* Round */}
          <StatCard title="Round">
            <div className="space-y-3 pt-1">
              <div>
                <label htmlFor="round-course" className="mb-1 block text-xs font-medium text-stone-500">
                  Course *
                </label>
                <input
                  id="round-course"
                  type="text"
                  value={roundData.course}
                  onChange={(e) => changeRound({ course: e.target.value })}
                  placeholder="Course name"
                  className={FIELD_INPUT}
                />
              </div>
              <div>
                <label htmlFor="round-date" className="mb-1 block text-xs font-medium text-stone-500">
                  Date
                </label>
                <input
                  id="round-date"
                  type="date"
                  value={roundData.date}
                  onChange={(e) => changeRound({ date: e.target.value })}
                  className={FIELD_INPUT}
                />
              </div>
            </div>
          </StatCard>

          {/* Scoring */}
          <StatCard
            title="Scoring"
            onClear={tracks("stableford") || tracks("front_back") ? clearScoringExtras : undefined}
          >
            <div className="divide-y divide-stone-100">
              <RoundStatNumberField
                label="Gross score *"
                info="Total strokes for the round."
                text={scoreText}
                onTextChange={(raw) => {
                  setScoreText(raw);
                  changeRound({ score: optionalNumberFromInput(raw) });
                }}
              />
              <RoundStatNumberField
                label="Handicap"
                decimal
                info="Your handicap for this round. Nett is gross minus handicap."
                text={handicapText}
                onTextChange={(raw) => {
                  setHandicapText(raw);
                  changeRound({ handicap: optionalNumberFromInput(raw) });
                }}
              />
              <RoundStatReadout
                label="Nett"
                value={roundData.nett !== null ? roundData.nett.toFixed(1) : null}
              />
              {tracks("front_back") && (
                <>
                  <RoundStatNumberField
                    label="Front 9"
                    info="Gross on holes 1-9. Fills in your gross score when both nines are entered."
                    text={frontNineText}
                    onTextChange={(raw) => onNineChange("frontNine", raw)}
                  />
                  <RoundStatNumberField
                    label="Back 9"
                    info="Gross on holes 10-18."
                    text={backNineText}
                    onTextChange={(raw) => onNineChange("backNine", raw)}
                  />
                </>
              )}
              {tracks("stableford") && (
                <RoundStatNumberField
                  label="Stableford points"
                  text={stablefordText}
                  onTextChange={(raw) => {
                    setStablefordText(raw);
                    const v = optionalNumberFromInput(raw);
                    changeRound({ stableford: v === null ? null : Math.max(0, Math.round(v)) });
                  }}
                />
              )}
            </div>
          </StatCard>

          {/* Driving */}
          {tracks("fairways") && (
            <StatCard title="Driving" onClear={clearDriving}>
              {renderCounters([
                { field: "firHit", label: "Fairways hit", info: "Tee shots on par 4s and par 5s that finish in the fairway." },
                {
                  field: "fairwaysPossible",
                  label: "Possible fairways",
                  info: "Par 4s and par 5s played. Starts at 14 for 18 holes.",
                },
                { field: "firLeft", label: "Missed left" },
                { field: "firRight", label: "Missed right" },
              ])}
              <RoundCalcLine
                items={[
                  { label: "FIR", value: pctText(roundData.firHit, roundData.fairwaysPossible) },
                  { label: "Left", value: pctText(roundData.firLeft, roundData.fairwaysPossible) },
                  { label: "Right", value: pctText(roundData.firRight, roundData.fairwaysPossible) },
                ]}
              />
            </StatCard>
          )}

          {/* Approach */}
          {showApproach && (
            <StatCard title="Approach" onClear={clearApproach}>
              {renderCounters([
                tracks("gir") && {
                  field: "totalGir",
                  label: "Greens in regulation",
                  info: "On the green in par minus 2 strokes.",
                  max: HOLES,
                },
                tracks("gir_proximity") && { field: "gir8ft", label: "GIR inside 8ft", info: "Approx. 2.4 metres." },
                tracks("gir_proximity") && {
                  field: "gir20ft",
                  label: "GIR inside 20ft",
                  info: "Approx. 6.1 metres. Also counts shots inside 8ft.",
                },
                tracks("going_for_green") && {
                  field: "goingForGreen",
                  label: "Going for green",
                  info: "Attempts to reach a Par 4 in 1 stroke or a Par 5 in 2 strokes.",
                },
              ])}
              {tracks("gir") && (
                <RoundCalcLine items={[{ label: "GIR", value: pctText(roundData.totalGir, HOLES) }]} />
              )}
              {tracks("advanced_approach") && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-900">Advanced Approach Stats</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Optional: log approach shots per hole (club + direction or GIR) for your full round. Saving works with or without entries.
                </p>
                {!showAdvancedApproachMatrix ? (
                  <button
                    type="button"
                    onClick={() => setShowAdvancedApproachMatrix(true)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    Add Directional Misses
                  </button>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-gray-800">Approach Shot</span>
                      <InfoBubble
                        content="Select the hole and club, then tap a miss direction or center for GIR. If GIR was not realistic (bad tee shot / recovery, or still too far / lay-up), use the two buttons below instead of the matrix. Each tap logs that hole and advances to the next hole (last hole stays selected until you pick another)."
                        buttonClassName="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-500 cursor-help"
                        tooltipClassName="left-1/2 bottom-full mb-2 w-60 max-w-[min(100vw-2rem,15rem)] -translate-x-1/2 p-2 text-center"
                      />
                    </div>

                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">
                        Hole
                      </span>
                      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                        {Array.from({ length: HOLES }, (_, i) => i + 1).map((h) => {
                          const count = directionalApproachShots.filter((s) => s.hole === h).length;
                          const active = h === selectedApproachHole;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setSelectedApproachHole(h)}
                              className={`relative shrink-0 min-w-[2.75rem] rounded-lg border-2 px-2 py-2 text-sm font-semibold tabular-nums transition-colors ${
                                active
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              {h}
                              {count > 0 ? (
                                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[10px] font-bold text-white">
                                  {count > 9 ? "9+" : count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="approach-club"
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Club used
                      </label>
                      <select
                        id="approach-club"
                        value={selectedApproachClub}
                        onChange={(e) => setSelectedApproachClub(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {APPROACH_CLUB_OPTIONS.map((club) => (
                          <option key={club} value={club}>
                            {club}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-3"
                      role="group"
                      aria-label="Approach shot direction"
                    >
                      {APPROACH_MATRIX_ROWS.flatMap((row) =>
                        row.map((result) => {
                          const Icon = APPROACH_RESULT_ICONS[result];
                          const isSelected = lastTappedApproachResult === result;
                          return (
                            <button
                              key={result}
                              type="button"
                              onClick={() => appendDirectionalApproachShot(result)}
                              title={
                                result === "gir"
                                  ? "Green in regulation"
                                  : result.replace(/-/g, " ")
                              }
                              className={`flex aspect-square w-full max-w-[4.25rem] shrink-0 items-center justify-center justify-self-center rounded-full border-2 bg-white transition-all active:scale-95 sm:max-w-[4.5rem] ${
                                isSelected
                                  ? "border-emerald-500 text-emerald-600 ring-2 ring-emerald-500/30"
                                  : "border-slate-300 text-slate-600 hover:border-slate-400"
                              }`}
                            >
                              <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
                            </button>
                          );
                        }),
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-center text-[11px] font-medium text-slate-600">
                        No GIR opportunity?
                      </p>
                      <p className="text-center text-[10px] leading-snug text-slate-500">
                        Use when a bad tee or recovery means you never had a real look, or when you were
                        still too far / laid up so going for the green was not on the table.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => appendDirectionalApproachShot("tee-no-gir")}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-semibold transition-all active:scale-[0.99] ${
                            lastTappedApproachResult === "tee-no-gir"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/25"
                              : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                          }`}
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
                          <span>Tee / recovery — no GIR line</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => appendDirectionalApproachShot("distance-no-gir")}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-semibold transition-all active:scale-[0.99] ${
                            lastTappedApproachResult === "distance-no-gir"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/25"
                              : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                          }`}
                        >
                          <CircleSlash className="h-4 w-4 shrink-0" strokeWidth={2} />
                          <span>Too far / lay-up — no GIR line</span>
                        </button>
                      </div>
                    </div>

                    {directionalApproachShots.length > 0 ? (
                      <p className="text-center text-[11px] text-slate-500">
                        {directionalApproachShots.length} shot
                        {directionalApproachShots.length !== 1 ? "s" : ""} across{" "}
                        {new Set(directionalApproachShots.map((s) => s.hole)).size} hole
                        {new Set(directionalApproachShots.map((s) => s.hole)).size !== 1
                          ? "s"
                          : ""}
                      </p>
                    ) : null}

                    {shotsForSelectedApproachHole.length > 0 ? (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                        {shotsForSelectedApproachHole.map((shot) => (
                          <li
                            key={shot.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-medium text-slate-900">{shot.club}</span>
                              <span className="text-slate-500"> · </span>
                              <span className="text-slate-600">{formatApproachResultLabel(shot.result)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDirectionalApproachShot(shot.id)}
                              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label="Remove entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-3 text-center text-xs text-slate-500">
                        No approach shots for hole {selectedApproachHole} yet.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowAdvancedApproachMatrix(false)}
                      className="w-full text-center text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                    >
                      Hide matrix
                    </button>
                  </div>
                )}
              </div>
              )}
            </StatCard>
          )}

          {/* Putting */}
          {showPutting && (
            <StatCard title="Putting" onClear={clearPutting}>
              <div className="divide-y divide-stone-100">
                {tracks("putts") && (
                  <RoundStatNumberField
                    label="Total putts *"
                    info="Only strokes taken once the ball is on the putting surface."
                    text={totalPuttsText}
                    onTextChange={(raw) => {
                      setTotalPuttsText(raw);
                      const v = optionalNumberFromInput(raw);
                      changeRound({ totalPutts: v === null ? 0 : Math.max(0, v) });
                    }}
                  />
                )}
                {tracks("putts_per_gir") && (
                  <RoundStatNumberField
                    label="Putts per GIR"
                    decimal
                    placeholder="0.0"
                    info="Average putts on greens hit in regulation, e.g. 1.8."
                    text={puttsPerGirText}
                    onTextChange={(raw) => {
                      setPuttsPerGirText(raw);
                      const v = optionalNumberFromInput(raw);
                      changeRound({
                        puttsPerGir: v === null ? null : Math.min(9.99, Math.max(0, Math.round(v * 100) / 100)),
                      });
                    }}
                  />
                )}
                {tracks("three_putts") && (
                  <RoundStatCounter
                    label="3-putts"
                    info="Any hole where 3 or more strokes were taken once the ball reached the putting surface."
                    value={roundData.threePutts}
                    max={HOLES}
                    onChange={(v) => setCounter("threePutts", v)}
                  />
                )}
              </div>

              {tracks("short_putts") && (
                <div>
                  <SubLabel info="Putts from inside 6ft (1.8m).">Putts inside 6ft</SubLabel>
                  {renderCounters([
                    { field: "puttsUnder6ftAttempts", label: "Attempts" },
                    { field: "made6ftAndIn", label: "Made", max: roundData.puttsUnder6ftAttempts },
                  ])}
                  <RoundCalcLine
                    items={[
                      { label: "Make", value: pctText(roundData.made6ftAndIn, roundData.puttsUnder6ftAttempts) },
                    ]}
                  />
                </div>
              )}
            </StatCard>
          )}

          {/* Short Game */}
          {showShortGame && (
            <StatCard title="Short game" onClear={clearShortGame}>
              {tracks("scrambling") && (
                <div>
                  <SubLabel info="Missing the green in regulation but still making par or better.">
                    Up & downs
                  </SubLabel>
                  {renderCounters([
                    {
                      field: "missed",
                      label: "Attempts",
                      info: girTracked
                        ? "Greens missed. Fills in from your GIR until you change it."
                        : "Greens missed.",
                    },
                    { field: "upAndDownConversions", label: "Converted", max: roundData.missed },
                  ])}
                  <RoundCalcLine
                    items={[{ label: "Scrambling", value: pctText(roundData.upAndDownConversions, roundData.missed) }]}
                  />
                </div>
              )}

              {tracks("sand_saves") && (
                <div>
                  <SubLabel info="Greenside bunkers only: up and down from the sand.">Sand saves</SubLabel>
                  {renderCounters([
                    { field: "bunkerAttempts", label: "Attempts" },
                    { field: "bunkerSaves", label: "Converted", max: roundData.bunkerAttempts },
                  ])}
                  <RoundCalcLine
                    items={[{ label: "Sand saves", value: pctText(roundData.bunkerSaves, roundData.bunkerAttempts) }]}
                  />
                </div>
              )}

              {tracks("chipping") && (
                <div>
                  <SubLabel info="Chips and pitches from around the green.">Chipping</SubLabel>
                  {renderCounters([
                    { field: "chipInside6ft", label: "Chip inside 6ft", info: "Approx. 1.8 metres" },
                    {
                      field: "doubleChips",
                      label: "Double chips",
                      info: "Any instance where an initial chip or pitch failed to reach the putting surface, requiring a second chip.",
                    },
                  ])}
                </div>
              )}
            </StatCard>
          )}

          {/* Scoring distribution */}
          {tracks("distribution") && (
            <StatCard
              title="Scoring distribution"
              onClear={clearDistribution}
              aside={
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    holesCounted > HOLES
                      ? "bg-red-50 text-red-600"
                      : holesCounted === HOLES
                        ? "bg-[#014421]/10 text-[#014421]"
                        : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {holesCounted} of {HOLES} holes
                </span>
              }
            >
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                {distribution.map((d) =>
                  roundData[d.field] > 0 ? (
                    <div
                      key={d.field}
                      style={{
                        width: `${(roundData[d.field] / Math.max(holesCounted, HOLES)) * 100}%`,
                        backgroundColor: SCORE_DISTRIBUTION_COLORS[d.field],
                      }}
                    />
                  ) : null,
                )}
              </div>
              {renderCounters(distribution.map((d) => ({ ...d, dot: SCORE_DISTRIBUTION_COLORS[d.field] })))}
            </StatCard>
          )}

          {/* Penalties */}
          {tracks("penalties") && (
            <StatCard title="Penalties" onClear={clearPenalties}>
              {renderCounters([
                { field: "totalPenalties", label: "Total penalties" },
                { field: "teePenalties", label: "Off the tee" },
                { field: "approachPenalties", label: "On approach" },
              ])}
            </StatCard>
          )}

          {/* Save Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!isRequiredFilled || isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#01361a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save round
                </>
              )}
            </button>
            {missingToSave && !isSaving ? (
              <p className="mt-2 text-center text-xs text-stone-500">Add your {missingToSave} to save.</p>
            ) : null}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
