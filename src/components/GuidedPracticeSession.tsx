"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  FlagTriangleRight,
  Gauge,
  History,
  Minus,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { FacilityType } from "@/components/DrillCard";
import { useAuth } from "@/contexts/AuthContext";
import { keepElementInView, useKeepInViewOnChange } from "@/hooks/useKeepInView";
import { usePracticeHandicap } from "@/hooks/usePracticeHandicap";
import { SHOW_PDFS } from "@/lib/drillResources";
import { realVideoUrl } from "@/lib/videoLinks";
import { bunnyVideoIdForDrill } from "@/lib/bunnyStream";
import { CARD_HANDICAP_TEST_IDS, COMBINE_TEST_CARDS, type CombineCategoryId } from "@/lib/combineTestsCatalog";
import { formatHandicap, weakestArea, type PracticeHandicap } from "@/lib/practiceHandicap";
import { GAME_AREAS, type GameArea } from "@/lib/practiceHandicapBenchmarks";
import {
  FINDER_SCORE_BANDS,
  FINDER_STRUGGLES,
  FINDER_STYLES,
  areasFromStruggles,
  focusesFromStruggles,
  recordFinderAnswers,
  type FinderScoreBand,
  type FinderStruggle,
  type FinderStyle,
} from "@/lib/practiceFinder";

export type GuidedSessionDrill = {
  id: string;
  title: string;
  category: string;
  area: FacilityType;
  estimatedMinutes: number;
  description?: string;
  goal?: string;
  videoUrl?: string;
  pdfUrl?: string;
};

export type GuidedSessionBlock = { area: FacilityType; minutes: number };

export type BuildSessionOptions = {
  focuses?: string[];
  styleKeywords?: string[];
  /** Practice Finder score band id (e.g. 80-90). */
  scoreBandId?: string;
  /** Practice Finder practice kind ids (mechanics / skill / performance). */
  styleIds?: string[];
};

type Mode = "log" | "build" | "test" | "find";
type Step =
  | "mode"
  | "area"
  | "findScore"
  | "findStruggle"
  | "findStyle"
  | "time"
  | "day"
  | "preview"
  | "test"
  | "done";

/** Combine tab for each area of the practice handicap. */
const TEST_AREA_CATEGORY: Record<GameArea, CombineCategoryId> = {
  driving: "Tee Shot",
  irons: "Irons",
  wedges: "Wedges",
  chipping: "Chipping",
  bunkers: "Bunkers",
  putting: "Putting",
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MIN_ROUNDS_FOR_STATS = 3;
const BUILD_TIME_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
const LOG_TIME_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
const ON_COURSE_HOLE_PRESETS = [1, 3, 6, 9, 12, 15, 18] as const;
const ON_COURSE_MIN_HOLES = 1;
const ON_COURSE_MAX_HOLES = 18;
const MINUTES_PER_HOLE = 15;

const clampOnCourseHoles = (n: number) =>
  Math.min(ON_COURSE_MAX_HOLES, Math.max(ON_COURSE_MIN_HOLES, Math.round(n)));

const AREAS: { id: FacilityType; label: string; icon: LucideIcon }[] = [
  { id: "Driving", label: "Driving", icon: Target },
  { id: "Irons", label: "Irons", icon: Target },
  { id: "Wedges", label: "Wedges", icon: Flag },
  { id: "Chipping", label: "Chipping", icon: Flag },
  { id: "Bunkers", label: "Bunkers", icon: FlagTriangleRight },
  { id: "Putting", label: "Putting", icon: Flag },
  { id: "Mental/Strategy", label: "Mental / Strategy", icon: BookOpen },
  { id: "On-Course", label: "On-course", icon: FlagTriangleRight },
];

/** Time share per area when stats pick 1, 2 or 3 areas (weakest first). */
const STATS_AREA_SHARES = [[1], [0.65, 0.35], [0.5, 0.3, 0.2]];
const MIN_STATS_AREA_MINUTES = 15;

/** Short sessions focus on the weakest area; longer ones spread across the next weakest too. */
function splitStatsMinutes(ranking: FacilityType[], minutes: number): GuidedSessionBlock[] {
  const maxAreas = minutes >= 90 ? 3 : minutes >= 45 ? 2 : 1;
  const areas = ranking.slice(0, maxAreas);
  if (areas.length === 0) return [];
  const shares = STATS_AREA_SHARES[areas.length - 1];
  const blocks = areas
    .map((area, i) => ({ area, minutes: Math.round((minutes * shares[i]) / 5) * 5 }))
    .filter((b, i) => i === 0 || b.minutes >= MIN_STATS_AREA_MINUTES);
  const assigned = blocks.reduce((sum, b) => sum + b.minutes, 0);
  blocks[0].minutes += minutes - assigned;
  return blocks;
}

function todayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type Props = {
  /** Areas below target from the player's rounds, weakest first. */
  statsAreas: FacilityType[];
  roundsCount: number;
  statsLoading?: boolean;
  buildSession: (blocks: GuidedSessionBlock[], opts?: BuildSessionOptions) => GuidedSessionDrill[];
  onAddToSchedule: (drillIds: string[], dayIndex: number) => Promise<void>;
  /** Returns XP earned, or null if saving failed. */
  onLogPractice: (area: FacilityType, minutes: number, holes?: number) => Promise<number | null>;
  onViewSchedule: (dayIndex: number) => void;
  onOpenVideo: (url: string) => void;
};

/** Combines for one area, the ones that set the practice handicap first, with the player's level on each. */
function TestPicker({ area, practice }: { area: GameArea; practice: PracticeHandicap | null }) {
  const label = GAME_AREAS.find((a) => a.id === area)?.label ?? area;
  const areaResult = practice?.areas.find((a) => a.area === area) ?? null;
  const cards = COMBINE_TEST_CARDS.filter((c) => c.category === TEST_AREA_CATEGORY[area]).sort(
    (a, b) => Number(Boolean(CARD_HANDICAP_TEST_IDS[b.id])) - Number(Boolean(CARD_HANDICAP_TEST_IDS[a.id])),
  );

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">Pick a {label.toLowerCase()} test</p>
      <p className="mb-3 text-xs text-gray-500">
        {areaResult?.handicap != null
          ? `Your ${label.toLowerCase()} plays to ${formatHandicap(areaResult.handicap)}. Each test uses your last 3 attempts.`
          : `You haven't tested ${label.toLowerCase()} yet. One test sets your level.`}
      </p>
      <div className="space-y-2">
        {cards.map((card) => {
          const testId = CARD_HANDICAP_TEST_IDS[card.id];
          const result = testId ? areaResult?.combines.find((c) => c.id === testId) : undefined;
          return (
            <Link
              key={card.id}
              href={card.href}
              className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white p-3 transition-colors hover:border-[#014421] hover:bg-[#014421]/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{card.title}</span>
                <span className="block text-xs leading-snug text-gray-500">{card.blurb}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {testId ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        result ? "bg-[#014421]/10 text-[#014421]" : "bg-[#FFA500]/15 text-orange-700"
                      }`}
                    >
                      {result ? `Your level ${formatHandicap(result.handicap)}` : "Sets your level"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                      Practice only
                    </span>
                  )}
                  {card.meta.map((m) => (
                    <span key={m} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {m}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function GuidedPracticeSession({
  statsAreas,
  roundsCount,
  statsLoading = false,
  buildSession,
  onAddToSchedule,
  onLogPractice,
  onViewSchedule,
  onOpenVideo,
}: Props) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode | null>(null);
  const [area, setArea] = useState<FacilityType | null>(null);
  const [areaFromStats, setAreaFromStats] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [holes, setHoles] = useState<number | null>(null);
  const [dayIndex, setDayIndex] = useState<number>(todayDayIndex());
  const [session, setSession] = useState<GuidedSessionDrill[]>([]);
  const [busy, setBusy] = useState(false);
  const [loggedXp, setLoggedXp] = useState<number | null>(null);
  const [expandedDrillKey, setExpandedDrillKey] = useState<string | null>(null);
  const [testArea, setTestArea] = useState<GameArea | null>(null);
  const [finderScoreBand, setFinderScoreBand] = useState<FinderScoreBand | null>(null);
  const [finderStruggles, setFinderStruggles] = useState<FinderStruggle[]>([]);
  const [finderStyles, setFinderStyles] = useState<FinderStyle[]>([]);
  const { user } = useAuth();
  const handicapData = usePracticeHandicap(mode === "test" ? user?.id : null);
  const practiceHcp = handicapData.status === "ready" ? handicapData.practice : null;
  const cardRef = useRef<HTMLDivElement>(null);
  useKeepInViewOnChange(cardRef, step);

  useEffect(() => {
    if (!expandedDrillKey) return;
    keepElementInView(
      cardRef.current?.querySelector(`[data-drill-key="${CSS.escape(expandedDrillKey)}"]`),
    );
  }, [expandedDrillKey]);

  const statsUnlocked = !statsLoading && roundsCount >= MIN_ROUNDS_FOR_STATS;
  const steps: Step[] =
    mode === "log"
      ? ["mode", "area", "time"]
      : mode === "test"
        ? ["mode", "area", "test"]
        : mode === "find"
          ? ["mode", "findScore", "findStruggle", "findStyle", "time", "day", "preview"]
          : ["mode", "area", "time", "day", "preview"];
  const stepNumber = Math.max(0, steps.indexOf(step));

  const dayOptions = useMemo(() => {
    const start = todayDayIndex();
    return DAY_NAMES.map((name, idx) => ({ idx, name }))
      .filter(({ idx }) => idx >= start)
      .map(({ idx, name }) => ({
        idx,
        label: idx === start ? "Today" : idx === start + 1 ? "Tomorrow" : name,
      }));
  }, []);

  const reset = () => {
    setStep("mode");
    setMode(null);
    setArea(null);
    setAreaFromStats(false);
    setMinutes(null);
    setHoles(null);
    setDayIndex(todayDayIndex());
    setSession([]);
    setLoggedXp(null);
    setExpandedDrillKey(null);
    setTestArea(null);
    setFinderScoreBand(null);
    setFinderStruggles([]);
    setFinderStyles([]);
  };

  const chooseTestArea = (a: GameArea) => {
    setTestArea(a);
    setStep("test");
  };

  /** Untested areas first, so every part of the game gets a level; then the weakest. */
  const suggestedTestArea = (): GameArea | null => {
    if (!practiceHcp) return null;
    const untested = practiceHcp.areas.find((a) => a.handicap == null);
    return untested?.area ?? weakestArea(practiceHcp)?.area ?? null;
  };

  const practiceAnotherArea = () => {
    const keepMode = mode;
    reset();
    if (keepMode) chooseMode(keepMode);
  };

  const goBack = () => {
    const prev = steps[stepNumber - 1];
    if (prev) setStep(prev);
  };

  const chooseMode = (m: Mode) => {
    setMode(m);
    setArea(null);
    setAreaFromStats(false);
    setFinderScoreBand(null);
    setFinderStruggles([]);
    setFinderStyles([]);
    if (m === "find") {
      setStep("findScore");
      return;
    }
    setStep("area");
  };

  const chooseFinderScore = (band: FinderScoreBand) => {
    setFinderScoreBand(band);
    setFinderStruggles([]);
    setStep("findStruggle");
  };

  const toggleFinderStruggle = (s: FinderStruggle) => {
    setFinderStruggles((prev) => {
      const has = prev.some((x) => x.id === s.id);
      if (has) return prev.filter((x) => x.id !== s.id);
      return FINDER_STRUGGLES.filter((x) => x.id === s.id || prev.some((p) => p.id === x.id));
    });
  };

  const confirmFinderStruggles = () => {
    if (finderStruggles.length === 0) return;
    const areas = areasFromStruggles(finderStruggles);
    setArea(areas[0] ?? null);
    setAreaFromStats(false);
    setFinderStyles([]);
    setStep("findStyle");
  };

  const toggleFinderStyle = (s: FinderStyle) => {
    setFinderStyles((prev) => {
      const has = prev.some((x) => x.id === s.id);
      if (has) return prev.filter((x) => x.id !== s.id);
      return FINDER_STYLES.filter((x) => x.id === s.id || prev.some((p) => p.id === x.id));
    });
  };

  const confirmFinderStyles = () => {
    if (finderStyles.length === 0) return;
    setMinutes(null);
    setStep("time");
  };

  const finderBuildOpts = (): BuildSessionOptions | undefined => {
    if (mode !== "find" || finderStruggles.length === 0) return undefined;
    const keywords = [
      ...(finderScoreBand?.preferKeywords ?? []),
      ...finderStyles.flatMap((s) => s.preferKeywords),
    ];
    return {
      focuses: focusesFromStruggles(finderStruggles),
      styleKeywords: keywords.length > 0 ? keywords : undefined,
      scoreBandId: finderScoreBand?.id,
      styleIds: finderStyles.map((s) => s.id),
    };
  };

  const chooseArea = (a: FacilityType, fromStats = false) => {
    setArea(a);
    setAreaFromStats(fromStats);
    setMinutes(null);
    setHoles(null);
    setStep("time");
  };

  const chooseTime = async (value: number) => {
    if (mode === "find") {
      if (finderStruggles.length === 0) return;
      setMinutes(value);
      setStep("day");
      return;
    }
    if (!area) return;
    if (mode === "log") {
      const isOnCourse = area === "On-Course";
      const logMinutes = isOnCourse ? value * MINUTES_PER_HOLE : value;
      if (isOnCourse) setHoles(value);
      setMinutes(logMinutes);
      setBusy(true);
      const xp = await onLogPractice(area, logMinutes, isOnCourse ? value : undefined);
      setBusy(false);
      if (xp == null) return;
      setLoggedXp(xp);
      setStep("done");
      return;
    }
    setMinutes(value);
    setStep("day");
  };

  const sessionBlocks = (): GuidedSessionBlock[] => {
    if (!minutes) return [];
    if (mode === "find" && finderStruggles.length > 0) {
      const areas = areasFromStruggles(finderStruggles);
      return areas.length > 1 ? splitStatsMinutes(areas, minutes) : [{ area: areas[0], minutes }];
    }
    if (!area) return [];
    return areaFromStats ? splitStatsMinutes(statsAreas, minutes) : [{ area, minutes }];
  };

  const chooseDay = (idx: number) => {
    if (!minutes) return;
    if (mode === "find") {
      if (finderStruggles.length === 0) return;
    } else if (!area) {
      return;
    }
    setDayIndex(idx);
    if (mode === "find" && finderStruggles.length > 0 && finderStyles.length > 0 && finderScoreBand) {
      recordFinderAnswers({
        scoreBandId: finderScoreBand.id,
        struggleIds: finderStruggles.map((s) => s.id),
        styleIds: finderStyles.map((s) => s.id),
      });
    }
    setSession(buildSession(sessionBlocks(), finderBuildOpts()));
    setExpandedDrillKey(null);
    setStep("preview");
  };

  const reshuffle = () => {
    if (!minutes) return;
    if (mode === "find" ? finderStruggles.length === 0 : !area) return;
    setSession(buildSession(sessionBlocks(), finderBuildOpts()));
    setExpandedDrillKey(null);
  };

  const addToSchedule = async () => {
    if (session.length === 0) return;
    setBusy(true);
    try {
      await onAddToSchedule(
        session.map((d) => d.id),
        dayIndex,
      );
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  const labelFor = (a: FacilityType) => AREAS.find((x) => x.id === a)?.label ?? a;
  const areaLabel = area ? labelFor(area) : "";
  const statsAreaLabels = statsAreas.slice(0, 3).map(labelFor);
  const sessionAreas = Array.from(new Set(session.map((d) => d.area)));
  const multiArea = sessionAreas.length > 1;
  const sessionMinutes = session.reduce((sum, d) => sum + d.estimatedMinutes, 0);
  const dayLabel = dayOptions.find((d) => d.idx === dayIndex)?.label ?? DAY_NAMES[dayIndex];

  const optionBtn =
    "w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 text-left text-sm font-semibold text-gray-900 transition-colors hover:border-[#014421] hover:bg-[#014421]/5 disabled:cursor-not-allowed disabled:opacity-50";
  const gridBtn =
    "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-2 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-[#014421] hover:bg-[#014421]/5 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div ref={cardRef} id="guided-practice" className="mb-6 scroll-mt-4">
      <div className="rounded-2xl border-2 border-[#014421]/15 bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">Guided Practice</h2>
          </div>
          {step !== "mode" && step !== "done" ? (
            <div className="flex items-center gap-1.5" aria-label={`Step ${stepNumber + 1} of ${steps.length}`}>
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${
                    i <= stepNumber ? "w-4 bg-[#014421]" : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {step !== "mode" && step !== "done" ? (
          <button
            type="button"
            onClick={goBack}
            disabled={busy}
            className="mb-3 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        ) : null}

        {step === "mode" && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-800">What would you like to do?</p>
            <button type="button" className={optionBtn} onClick={() => chooseMode("find")}>
              <span className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <span>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    Find practice for me
                    <span className="rounded bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c77c00]">
                      Beta
                    </span>
                  </span>
                  <span className="block text-xs font-normal text-gray-500">
                    Short questionnaire — we learn what you need and pick the drills
                  </span>
                </span>
              </span>
            </button>
            <button type="button" className={optionBtn} onClick={() => chooseMode("build")}>
              <span className="flex items-center gap-3">
                <CalendarPlus className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <span>
                  Build a practice session
                  <span className="block text-xs font-normal text-gray-500">
                    Answer 4 quick questions and get a plan for your schedule
                  </span>
                </span>
              </span>
            </button>
            <button type="button" className={optionBtn} onClick={() => chooseMode("log")}>
              <span className="flex items-center gap-3">
                <History className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <span>
                  Enter practice I&apos;ve already done
                  <span className="block text-xs font-normal text-gray-500">
                    Log a session to earn XP and track your hours
                  </span>
                </span>
              </span>
            </button>
            <button type="button" className={optionBtn} onClick={() => chooseMode("test")}>
              <span className="flex items-center gap-3">
                <Gauge className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <span>
                  Test my level
                  <span className="block text-xs font-normal text-gray-500">
                    Do a combine to see what handicap each part of your game plays to
                  </span>
                </span>
              </span>
            </button>
          </div>
        )}

        {step === "findScore" && mode === "find" && (
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-800">What scores do you usually shoot?</p>
            <div className="space-y-2">
              {FINDER_SCORE_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  className={optionBtn}
                  onClick={() => chooseFinderScore(band)}
                >
                  {band.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "findStruggle" && mode === "find" && (
          <div>
            <p className="mb-1 text-sm font-semibold text-gray-800">What&apos;s costing you the most right now?</p>
            <p className="mb-3 text-xs text-gray-500">Select one or more</p>
            {statsUnlocked && statsAreas[0] ? (
              <button
                type="button"
                className={`${optionBtn} mb-3`}
                onClick={() => {
                  const areaId = statsAreas[0];
                  const match =
                    FINDER_STRUGGLES.find((s) => s.areas[0] === areaId) ??
                    FINDER_STRUGGLES.find((s) => s.areas.includes(areaId));
                  if (match) {
                    setFinderStruggles([match]);
                    setArea(match.areas[0] ?? null);
                    setAreaFromStats(false);
                    setFinderStyles([]);
                    setStep("findStyle");
                  }
                }}
              >
                Start from my round stats
              </button>
            ) : null}
            <div className="space-y-2">
              {FINDER_STRUGGLES.map((s) => {
                const on = finderStruggles.some((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={`${optionBtn} ${on ? "border-[#014421] bg-[#014421]/5" : ""}`}
                    onClick={() => toggleFinderStruggle(s)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {s.label}
                      {on ? <Check className="h-4 w-4 text-[#014421]" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={finderStruggles.length === 0}
              onClick={confirmFinderStruggles}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === "findStyle" && mode === "find" && finderStruggles.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-gray-800">What kind of practice?</p>
            <p className="mb-3 text-xs text-gray-500">Select one or more</p>
            <div className="space-y-2">
              {FINDER_STYLES.map((s) => {
                const on = finderStyles.some((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={`${optionBtn} ${on ? "border-[#014421] bg-[#014421]/5" : ""}`}
                    onClick={() => toggleFinderStyle(s)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {s.label}
                      {on ? <Check className="h-4 w-4 text-[#014421]" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={finderStyles.length === 0}
              onClick={confirmFinderStyles}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === "area" && mode === "test" && (
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-800">Which part of your game do you want to test?</p>
            <button
              type="button"
              className={`${optionBtn} mb-3`}
              disabled={!practiceHcp}
              onClick={() => {
                const a = suggestedTestArea();
                if (a) chooseTestArea(a);
              }}
            >
              <span className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <span>
                  Not sure? Pick for me
                  <span className="block text-xs font-normal text-gray-500">
                    {!practiceHcp
                      ? "Loading your results…"
                      : practiceHcp.testedAreas < GAME_AREAS.length
                        ? "We'll start with an area you haven't tested yet"
                        : "We'll retest your weakest area"}
                  </span>
                </span>
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              {GAME_AREAS.map((a) => {
                const hcp = practiceHcp?.areas.find((x) => x.area === a.id)?.handicap ?? null;
                return (
                  <button key={a.id} type="button" className={gridBtn} onClick={() => chooseTestArea(a.id)}>
                    <Gauge className="h-5 w-5 text-[#014421]" aria-hidden />
                    {a.label}
                    <span className="text-[11px] font-medium text-gray-500">
                      {!practiceHcp ? "…" : hcp == null ? "Not tested yet" : `Level ${formatHandicap(hcp)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "test" && testArea && (
          <TestPicker area={testArea} practice={practiceHcp} />
        )}

        {step === "area" && mode !== "test" && (
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-800">
              {mode === "log" ? "What part of your game did you practise?" : "What part of your game are you working on?"}
            </p>
            {mode === "build" && (
              <button
                type="button"
                className={`${optionBtn} mb-3`}
                disabled={!statsUnlocked}
                onClick={() => chooseArea(statsAreas[0] ?? "Putting", true)}
              >
                <span className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                  <span>
                    Not sure? Use my stats
                    <span className="block text-xs font-normal text-gray-500">
                      {statsLoading
                        ? "Loading your stats…"
                        : statsUnlocked
                        ? "We'll pick the area costing you the most shots"
                        : `Log ${MIN_ROUNDS_FOR_STATS - roundsCount} more round${
                            MIN_ROUNDS_FOR_STATS - roundsCount === 1 ? "" : "s"
                          } to unlock`}
                    </span>
                  </span>
                </span>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {AREAS.filter((a) => mode === "log" || a.id !== "On-Course").map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.id} type="button" className={gridBtn} onClick={() => chooseArea(a.id)}>
                    <Icon className="h-5 w-5 text-[#014421]" aria-hidden />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "time" && (area || (mode === "find" && finderStruggles.length > 0)) && (
          <div>
            {mode === "find" && finderStruggles.length > 0 ? (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#014421]/5 p-3 text-xs text-[#014421]">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Plan for a <span className="font-bold">{finderScoreBand?.label ?? "—"}</span> player
                  {" · "}
                  <span className="font-bold">
                    {finderStruggles.map((s) => s.label.toLowerCase()).join(", ")}
                  </span>
                  {finderStyles.length > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-bold">
                        {finderStyles.map((s) => s.label.toLowerCase()).join(", ")}
                      </span>
                    </>
                  ) : null}
                  . Beta — we&apos;ll keep learning from your answers.
                </span>
              </div>
            ) : null}
            {areaFromStats ? (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {statsAreaLabels.length > 1 ? (
                  <span>
                    Your rounds say you&apos;re losing the most shots in{" "}
                    <span className="font-bold">{statsAreaLabels.join(", then ")}</span>. Short sessions focus on{" "}
                    {statsAreaLabels[0]}; longer ones cover more areas.
                  </span>
                ) : (
                  <span>
                    Your rounds say <span className="font-bold">{statsAreaLabels[0]}</span> is where you&apos;re
                    losing the most shots, so this session focuses there.
                  </span>
                )}
              </div>
            ) : null}
            <p className="mb-3 text-sm font-semibold text-gray-800">
              {mode === "log"
                ? area === "On-Course"
                  ? "How many holes did you play?"
                  : `How long did you practise ${areaLabel.toLowerCase()}?`
                : "How much time do you have?"}
            </p>
            {mode === "log" && area === "On-Course" ? (
              (() => {
                const selected = clampOnCourseHoles(holes ?? 9);
                const mins = selected * MINUTES_PER_HOLE;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        disabled={busy || selected <= ON_COURSE_MIN_HOLES}
                        onClick={() => setHoles(clampOnCourseHoles(selected - 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-gray-200 text-gray-700 hover:border-[#014421] hover:bg-gray-50 disabled:opacity-40"
                        aria-label="Fewer holes"
                      >
                        <Minus className="h-5 w-5" aria-hidden />
                      </button>
                      <div className="min-w-[5rem] text-center">
                        <p className="text-4xl font-bold tabular-nums text-gray-900">{selected}</p>
                        <p className="text-xs font-medium text-gray-500">
                          hole{selected === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy || selected >= ON_COURSE_MAX_HOLES}
                        onClick={() => setHoles(clampOnCourseHoles(selected + 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-gray-200 text-gray-700 hover:border-[#014421] hover:bg-gray-50 disabled:opacity-40"
                        aria-label="More holes"
                      >
                        <Plus className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {ON_COURSE_HOLE_PRESETS.map((preset) => {
                        const active = selected === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            disabled={busy}
                            onClick={() => setHoles(preset)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                              active
                                ? "border-[#014421] bg-[#014421] text-white"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#014421]"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-center text-xs text-gray-500">
                      {mins} minutes · {MINUTES_PER_HOLE} min per hole
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void chooseTime(selected)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Flag className="h-4 w-4" aria-hidden />
                      Log {selected} hole{selected === 1 ? "" : "s"}
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(mode === "log" ? LOG_TIME_OPTIONS : BUILD_TIME_OPTIONS).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={gridBtn}
                    disabled={busy}
                    onClick={() => void chooseTime(value)}
                  >
                    <Clock className="h-4 w-4 text-[#014421]" aria-hidden />
                    {formatMinutes(value)}
                  </button>
                ))}
              </div>
            )}
            {busy ? <p className="mt-3 text-center text-xs text-gray-500">Saving…</p> : null}
          </div>
        )}

        {step === "day" && (
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-800">When will you practise?</p>
            <div className="grid grid-cols-2 gap-2">
              {dayOptions.map((d) => (
                <button key={d.idx} type="button" className={gridBtn} onClick={() => chooseDay(d.idx)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {mode === "find" && finderStruggles.length > 0
                ? "Practice picked for you"
                : multiArea
                  ? `Your ${sessionAreas.map((a) => labelFor(a).toLowerCase()).join(" + ")} session`
                  : `Your ${areaLabel.toLowerCase()} session`}
            </p>
            <p className="mb-3 text-xs text-gray-500">
              {dayLabel} · {formatMinutes(sessionMinutes || minutes || 0)}
              {mode === "find" && finderStruggles.length > 0
                ? ` · ${finderScoreBand ? `${finderScoreBand.label} · ` : ""}${finderStruggles.map((s) => s.label).join(", ")}${finderStyles.length ? ` · ${finderStyles.map((s) => s.label).join(", ")}` : ""}`
                : ""}
            </p>
            {session.length === 0 ? (
              <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-600">
                No drills fit that time yet. Try a longer session or another answer.
              </p>
            ) : (
              <div className="space-y-3">
                {sessionAreas.map((a) => {
                  const areaDrills = session.filter((d) => d.area === a);
                  const areaMinutes = areaDrills.reduce((sum, d) => sum + d.estimatedMinutes, 0);
                  return (
                    <div key={a}>
                      {multiArea ? (
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#014421]">
                          {labelFor(a)} · {formatMinutes(areaMinutes)}
                        </p>
                      ) : null}
                      <ol className="space-y-2">
                        {areaDrills.map((d) => {
                          const number = session.indexOf(d) + 1;
                          const key = `${d.id}-${number}`;
                          const expanded = expandedDrillKey === key;
                          const pdfUrl = SHOW_PDFS ? d.pdfUrl : undefined;
                          const bunnyId = bunnyVideoIdForDrill({ title: d.title, video_url: d.videoUrl });
                          const videoUrl = bunnyId ? `bunny:${bunnyId}` : realVideoUrl(d.videoUrl);
                          const hasDetails = Boolean(d.description || d.goal || videoUrl || pdfUrl);
                          return (
                            <li key={key} data-drill-key={key} className="scroll-mt-4 rounded-xl bg-gray-50">
                              <button
                                type="button"
                                onClick={() => setExpandedDrillKey(expanded ? null : key)}
                                aria-expanded={expanded}
                                className="flex w-full items-center gap-3 p-3 text-left"
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#014421] text-xs font-bold text-white">
                                  {number}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={`block text-sm font-semibold text-gray-900 ${expanded ? "" : "truncate"}`}
                                  >
                                    {d.title}
                                  </span>
                                  <span className="block text-xs text-gray-500">{formatMinutes(d.estimatedMinutes)}</span>
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                    expanded ? "rotate-180" : ""
                                  }`}
                                  aria-hidden
                                />
                              </button>
                              {expanded ? (
                                <div className="space-y-3 border-t border-gray-200 px-3 pb-3 pt-3">
                                  {d.description ? (
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                                      {d.description}
                                    </p>
                                  ) : null}
                                  {d.goal ? (
                                    <div className="rounded-lg bg-white p-2.5 ring-1 ring-gray-200">
                                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#014421]">
                                        Goal / Reps
                                      </p>
                                      <p className="whitespace-pre-wrap text-sm text-gray-800">{d.goal}</p>
                                    </div>
                                  ) : null}
                                  {videoUrl || pdfUrl ? (
                                    <div className="flex gap-2">
                                      {videoUrl ? (
                                        <button
                                          type="button"
                                          onClick={() => onOpenVideo(videoUrl)}
                                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                                        >
                                          <PlayCircle className="h-4 w-4" aria-hidden />
                                          Watch video
                                        </button>
                                      ) : null}
                                      {pdfUrl ? (
                                        <a
                                          href={pdfUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                                        >
                                          <FileText className="h-4 w-4" aria-hidden />
                                          View PDF
                                        </a>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {!hasDetails ? (
                                    <p className="text-xs text-gray-500">No extra details for this drill yet.</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={reshuffle}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Shuffle
              </button>
              <button
                type="button"
                onClick={() => void addToSchedule()}
                disabled={busy || session.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden />
                {busy ? "Adding…" : "Add to my schedule"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-green-50 p-5 text-center">
            <CheckCircle2 className="h-8 w-8 text-[#014421]" aria-hidden />
            {mode === "log" ? (
              <p className="text-sm font-semibold text-[#014421]">
                Logged {holes ? `${holes} holes on course` : `${formatMinutes(minutes || 0)} of ${areaLabel.toLowerCase()}`}
                {loggedXp ? ` · +${loggedXp} XP` : ""}
              </p>
            ) : (
              <p className="text-sm font-semibold text-[#014421]">
                {session.length} drill{session.length === 1 ? "" : "s"} added to {dayLabel.toLowerCase() === "today" ? "today" : dayLabel}
                &apos;s schedule
              </p>
            )}
            <div className="flex w-full gap-2">
              {mode === "build" || mode === "find" ? (
                <button
                  type="button"
                  onClick={() => onViewSchedule(dayIndex)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Start in schedule
                </button>
              ) : null}
              <button
                type="button"
                onClick={practiceAnotherArea}
                className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              >
                {mode === "find"
                  ? "Find again"
                  : mode === "build"
                    ? "Practice another area"
                    : "Log another area"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
