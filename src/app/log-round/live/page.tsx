"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Radio, Save, Check, MoveUpLeft, MoveUp, MoveUpRight, MoveLeft, MoveRight, MoveDownLeft, MoveDown, MoveDownRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  LIVE_APPROACH_CLUB_OPTIONS,
  LIVE_APPROACH_MATRIX_ROWS,
  LIVE_NOT_POSSIBLE_REASONS,
  formatLiveApproachDirection,
  formatLiveGreenHit,
  formatLiveNotPossibleReason,
  type LiveApproachShotDirection,
  type LiveNotPossibleReason,
} from "@/lib/liveApproachShotConfig";
import {
  formatLivePuttEntry,
  LIVE_PUTT_BREAK_OPTIONS,
  normalizePuttLogs,
  puttingCompleteFromLogs,
  type LivePuttMissLine,
  type LivePuttMissLength,
} from "@/lib/livePuttingConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import {
  defaultCoursePars,
  findCourseProfileByName,
  loadCourseProfiles,
  loadRecentCourseNames,
  mergePlayedCourseNames,
  courseNamesMatch,
  normalizeCoursePars,
  saveCourseProfile,
  touchRecentCourse,
} from "@/lib/liveCourseProfiles";
import {
  aggregateLiveRound,
  applyDerivedHoleStrokes,
  clearLiveRoundDraft,
  createLiveRoundDraft,
  courseHoleNumberForPlayingHole,
  deriveLiveHoleStrokes,
  effectiveHoleStrokes,
  formatLiveScoreVsPar,
  holeScoreNameVsPar,
  isHoleFinishedForRound,
  loadLiveRoundDraft,
  remapLiveDraftHoles,
  saveLiveRoundDraft,
  saveLiveRoundHandoff,
  roundTotalsThroughCurrent,
  isLiveTeeOtherClub,
  LIVE_TEE_OTHER_CLUBS,
  LIVE_ROUND_TYPE_OPTIONS,
  LIVE_TEE_QUICK_CLUBS,
  LIVE_TEE_BOX_OPTIONS,
  LIVE_TEE_FACE_COLS,
  LIVE_TEE_FACE_ROWS,
  formatLiveRoundType,
  formatLiveTeeBox,
  liveTeeFaceContactId,
  liveTeeFaceContactLabel,
  totalApproachPenalties,
  nextApproachShotNumber,
  normalizeApproachShots,
  defaultLiveHoleWorkflow,
  type LiveFirResult,
  type LiveGreenHitResult,
  type LiveHoleEntry,
  type LiveNineSide,
  type LiveRoundDraft,
  type LiveRoundType,
  type LiveRoundSetup,
  type LiveTeeBox,
  type LiveTeeDirection,
  type LiveTeeFaceContact,
  type LiveTeeMissLie,
  type LivePuttEntry,
} from "@/lib/liveRoundDraft";
import { LiveRoundInProgressBanner } from "@/components/LiveRoundInProgressBanner";
import { LiveRoundScorecard } from "@/components/LiveRoundScorecard";
import { ShareRoundCommunityModal } from "@/components/ShareRoundCommunityModal";
import {
  LIVE_ENTRY_ENABLED,
  LiveEntryTestingBanner,
} from "@/components/LiveEntryNotReadyModal";

function optionalNumberFromInput(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function roundToOneDecimal(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 10) / 10;
}

/** Numeric delta vs par for display beside stroke entry (+1, -1, E, etc.). */
function scoreVsParDelta(strokes: number | null, par: number | null): string | null {
  if (strokes == null || strokes <= 0 || par == null) return null;
  const diff = strokes - par;
  if (diff === 0) return "E";
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

const LIVE_APPROACH_DIRECTION_ICONS: Record<LiveApproachShotDirection, LucideIcon> = {
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

function formatLoggedApproachShot(s: {
  shotNumber: number;
  distanceMeters: number | null;
  greenHit: LiveGreenHitResult;
  club?: string | null;
  shotDirection?: LiveApproachShotDirection | null;
  notPossibleReason?: LiveNotPossibleReason | null;
  penalties?: number;
}): string {
  const parts = [`Shot ${s.shotNumber}`];
  if (s.club) parts.push(s.club);
  if (s.distanceMeters != null) parts.push(`${s.distanceMeters} m`);
  if (s.shotDirection) parts.push(formatLiveApproachDirection(s.shotDirection));
  if ((s.penalties ?? 0) > 0) {
    parts.push(`${s.penalties} pen.`);
  }
  parts.push(formatLiveGreenHit(s.greenHit, s.notPossibleReason));
  return parts.join(" · ");
}

const LIVE_NEW_COURSE_VALUE = "__new_course__";

const LIVE_TEE_BOX_DOT: Record<LiveTeeBox, string> = {
  black: "bg-gray-900",
  blue: "bg-blue-600",
  white: "bg-white ring-1 ring-inset ring-gray-300",
  yellow: "bg-yellow-400",
  red: "bg-red-600",
  pink: "bg-pink-500",
  green: "bg-green-600",
};

export default function LiveRoundEntryPage() {
  return <LiveRoundEntryContent />;
}

function LiveRoundEntryContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { rounds } = useStats();
  const today = new Date().toISOString().split("T")[0];

  const [phase, setPhase] = useState<"setup" | "holes">("setup");
  const [draft, setDraft] = useState<LiveRoundDraft | null>(null);
  const [setup, setSetup] = useState<LiveRoundSetup>({
    date: today,
    course: "",
    handicap: null,
    holes: 18,
    teeBox: "white",
    roundType: "practice",
    nineSide: "front",
    coursePars: defaultCoursePars(),
  });
  const [handicapText, setHandicapText] = useState("");
  const [strokesText, setStrokesText] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [savedCourses, setSavedCourses] = useState<string[]>([]);
  const [showScorecardEditor, setShowScorecardEditor] = useState(false);
  const [shouldSaveCourseProfile, setShouldSaveCourseProfile] = useState(true);
  const [customCourseMode, setCustomCourseMode] = useState(false);
  const [otherClubOpen, setOtherClubOpen] = useState(false);
  const [approachDistanceText, setApproachDistanceText] = useState("");
  const [puttDistanceText, setPuttDistanceText] = useState("");
  const [approachClub, setApproachClub] = useState<string>("7i");
  const [approachDirection, setApproachDirection] =
    useState<LiveApproachShotDirection | null>(null);
  const [approachPenalties, setApproachPenalties] = useState(0);
  const [pendingNotPossible, setPendingNotPossible] = useState(false);
  const [pendingPuttMiss, setPendingPuttMiss] = useState(false);
  const [puttMissLine, setPuttMissLine] = useState<LivePuttMissLine | null>(null);
  const [puttMissLength, setPuttMissLength] = useState<LivePuttMissLength | null>(null);
  const [sharePromptOpen, setSharePromptOpen] = useState(false);
  const pendingFinishDraftRef = useRef<LiveRoundDraft | null>(null);

  const resetApproachFormDraft = () => {
    setApproachDistanceText("");
    setApproachClub("7i");
    setApproachDirection(null);
    setApproachPenalties(0);
    setPendingNotPossible(false);
  };

  const syncPuttingFormForEntry = (entry: LiveHoleEntry) => {
    setPendingPuttMiss(false);
    setPuttMissLine(null);
    setPuttMissLength(null);
    const puttNumber = entry.currentPuttNumber ?? 1;
    if (puttNumber === 1 && entry.firstPuttDistanceFeet != null) {
      setPuttDistanceText(String(entry.firstPuttDistanceFeet));
    } else {
      setPuttDistanceText("");
    }
  };

  const syncHoleFormForEntry = (entry: LiveHoleEntry) => {
    setOtherClubOpen(isLiveTeeOtherClub(entry.teeClub));
    resetApproachFormDraft();
    syncPuttingFormForEntry(entry);
  };

  const syncStrokesTextForEntry = useCallback((entry: LiveHoleEntry | null | undefined) => {
    if (!entry) {
      setStrokesText("");
      return;
    }
    if (entry.strokesManual && entry.strokes != null) {
      setStrokesText(String(entry.strokes));
      return;
    }
    const derived = deriveLiveHoleStrokes(entry);
    if (derived != null) {
      setStrokesText(String(derived));
      return;
    }
    setStrokesText(entry.strokes != null ? String(entry.strokes) : "");
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    setSavedCourses(loadRecentCourseNames(user.id));
    const existing = loadLiveRoundDraft(user.id);
    if (existing) {
      setDraft(existing);
      setSetup({
        ...existing.setup,
        teeBox: existing.setup.teeBox ?? "white",
        roundType: existing.setup.roundType ?? "practice",
        coursePars: existing.setup.coursePars ?? defaultCoursePars(),
        nineSide: existing.setup.nineSide ?? "front",
      });
      setHandicapText(
        existing.setup.handicap != null ? String(existing.setup.handicap) : "",
      );
      setPhase("holes");
      const hole = existing.holes.find((h) => h.hole === existing.currentHole);
      if (hole) syncHoleFormForEntry(hole);
      syncStrokesTextForEntry(hole);
    }
  }, [user?.id, syncStrokesTextForEntry]);

  const courseProfiles = useMemo(
    () => (user?.id ? loadCourseProfiles(user.id) : []),
    [user?.id, setup.course],
  );

  const playedCourseNames = useMemo(
    () =>
      mergePlayedCourseNames(
        courseProfiles.map((p) => p.name),
        savedCourses,
        rounds.map((r) => r.course),
      ),
    [courseProfiles, savedCourses, rounds],
  );

  const setupCourseInList = useMemo(
    () =>
      setup.course.trim() !== "" &&
      playedCourseNames.some((n) => courseNamesMatch(n, setup.course)),
    [setup.course, playedCourseNames],
  );

  const currentHoleEntry = useMemo(() => {
    if (!draft) return null;
    return draft.holes.find((h) => h.hole === draft.currentHole) ?? null;
  }, [draft]);

  const aggregated = useMemo(
    () => (draft ? aggregateLiveRound(draft) : null),
    [draft],
  );

  const roundTotals = useMemo(
    () => (draft ? roundTotalsThroughCurrent(draft) : null),
    [draft],
  );

  const holesCompleted =
    draft?.holes.filter((h) => isHoleFinishedForRound(h, draft.currentHole)).length ?? 0;

  const persistDraft = (next: LiveRoundDraft) => {
    setDraft(next);
    if (user?.id) saveLiveRoundDraft(user.id, next);
  };

  const applySetupPatch = (patch: Partial<LiveRoundSetup>) => {
    setSetup((prev) => {
      const next = { ...prev, ...patch };
      if (next.holes === 18) next.nineSide = undefined;
      else if (!next.nineSide) next.nineSide = "front";
      return next;
    });
  };

  const loadCourseFromProfile = (courseName: string) => {
    if (!user?.id) return;
    const profile = findCourseProfileByName(user.id, courseName);
    applySetupPatch({
      course: courseName,
      coursePars: profile?.pars ?? defaultCoursePars(),
    });
    setShowScorecardEditor(!profile);
    setShouldSaveCourseProfile(!profile);
  };

  const updateCoursePar = (courseHoleIndex: number, value: number) => {
    setSetup((prev) => {
      const pars = [...(prev.coursePars ?? defaultCoursePars())];
      pars[courseHoleIndex] = Math.min(6, Math.max(3, value));
      return { ...prev, coursePars: pars };
    });
  };

  const updateCurrentHole = (patch: Partial<LiveHoleEntry>) => {
    if (!draft) return;
    let merged = patch;
    if (patch.teeDirection != null && currentHoleEntry?.par !== 3) {
      merged = {
        ...patch,
        fir: patch.teeDirection as LiveFirResult,
      };
    }
    if (patch.teeSolidStrike === true) {
      merged = { ...merged, teeFaceContact: null };
    }
    if (patch.teeCorrectFlight === true) {
      merged = { ...merged, teeDoubleCross: null };
    }
    if (patch.par != null) {
      const workflow = defaultLiveHoleWorkflow(patch.par);
      merged = {
        ...merged,
        ...workflow,
        gir: null,
        putts: 0,
        strokes: null,
        strokesManual: false,
        firstPuttDistanceFeet: null,
        puttGreenBreak: null,
        puttLogs: [],
        currentPuttNumber: 1,
        penalties: 0,
      };
      if (patch.par === 3) {
        merged = {
          ...merged,
          teeClub: null,
          teeDirection: null,
          teeMissLie: null,
          teeSolidStrike: null,
          teeFaceContact: null,
          teeCorrectFlight: null,
          teeDoubleCross: null,
          fir: "na",
        };
      } else if (currentHoleEntry?.par === 3) {
        merged = { ...merged, fir: null };
      }
    }
    const nextHoles = draft.holes.map((h) => {
      if (h.hole !== draft.currentHole) return h;
      return applyDerivedHoleStrokes({ ...h, ...merged });
    });
    const updatedEntry = nextHoles.find((h) => h.hole === draft.currentHole);
    persistDraft({ ...draft, holes: nextHoles });
    if (updatedEntry && !updatedEntry.strokesManual && !("strokes" in patch) && !("strokesManual" in patch)) {
      syncStrokesTextForEntry(updatedEntry);
    }
  };

  const selectTeeClub = (club: string | null, otherOpen: boolean) => {
    setOtherClubOpen(otherOpen);
    updateCurrentHole({ teeClub: club });
    resetApproachFormDraft();
  };

  const finalizeCurrentHoleStrokes = (holes: LiveHoleEntry[]) => {
    if (!draft) return holes;
    return holes.map((h) => {
      if (h.hole !== draft.currentHole) return h;
      if (h.strokesManual) return h;
      const derived = deriveLiveHoleStrokes(h);
      if (derived != null && derived > 0) return { ...h, strokes: derived };
      return h;
    });
  };

  const showSavedToast = (message: string) => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(null), 2500);
  };

  const persistCourseProfileIfNeeded = (courseName: string, pars: number[] | undefined) => {
    if (!user?.id || !shouldSaveCourseProfile || !pars) return;
    const normalized = normalizeCoursePars(pars);
    if (!normalized) return;
    saveCourseProfile(user.id, courseName, normalized);
    touchRecentCourse(user.id, courseName);
    setSavedCourses(loadRecentCourseNames(user.id));
  };

  const startOrResume = () => {
    if (!setup.course.trim()) {
      alert("Enter a course name to start live entry.");
      return;
    }
    const handicap = roundToOneDecimal(optionalNumberFromInput(handicapText));
    const setupWithHcp: LiveRoundSetup = {
      ...setup,
      course: setup.course.trim(),
      handicap,
      coursePars: setup.coursePars ?? defaultCoursePars(),
      nineSide: setup.holes === 9 ? setup.nineSide ?? "front" : undefined,
    };

    persistCourseProfileIfNeeded(setupWithHcp.course, setupWithHcp.coursePars);

    const sameRound =
      draft &&
      draft.setup.course === setupWithHcp.course &&
      draft.setup.holes === setupWithHcp.holes &&
      (setupWithHcp.holes === 18 || draft.setup.nineSide === setupWithHcp.nineSide);

    const next = sameRound
      ? remapLiveDraftHoles({ ...draft, setup: setupWithHcp }, setupWithHcp)
      : createLiveRoundDraft(setupWithHcp);

    persistDraft(next);
    setPhase("holes");
    const hole = next.holes.find((h) => h.hole === next.currentHole);
    if (hole) syncHoleFormForEntry(hole);
    syncStrokesTextForEntry(hole);
  };

  const goToHole = (hole: number) => {
    if (!draft) return;
    const clamped = Math.min(draft.setup.holes, Math.max(1, hole));
    const holes = finalizeCurrentHoleStrokes(draft.holes);
    persistDraft({ ...draft, holes, currentHole: clamped });
    const entry = holes.find((h) => h.hole === clamped);
    if (entry) syncHoleFormForEntry(entry);
    syncStrokesTextForEntry(entry);
  };

  const saveProgress = () => {
    if (!draft || !user?.id) return;
    const holes = finalizeCurrentHoleStrokes(draft.holes);
    const next = { ...draft, holes };
    persistDraft(next);
    saveLiveRoundDraft(user.id, next);
    showSavedToast("Progress saved — pick up anytime.");
  };

  const finishRound = () => {
    if (!draft || !user?.id) return;
    const holes = finalizeCurrentHoleStrokes(draft.holes);
    const finalized = { ...draft, holes };
    const completed = holes.filter((h) =>
      isHoleFinishedForRound(h, draft.currentHole),
    ).length;
    if (completed === 0) {
      alert("Log at least one hole before finishing.");
      return;
    }
    pendingFinishDraftRef.current = finalized;
    setSharePromptOpen(true);
  };

  const completeFinishRound = (shareOnCommunity: boolean) => {
    setSharePromptOpen(false);
    const finalized = pendingFinishDraftRef.current;
    pendingFinishDraftRef.current = null;
    if (!finalized || !user?.id) return;

    const totals = {
      ...aggregateLiveRound(finalized),
      shareOnCommunity,
      shareCommunityConfirmed: true,
    };
    saveLiveRoundHandoff(user.id, totals);
    if (finalized.setup.coursePars) {
      persistCourseProfileIfNeeded(finalized.setup.course, finalized.setup.coursePars);
    }
    clearLiveRoundDraft(user.id);
    router.push("/log-round?from=live");
  };

  const handleApproachGreenHit = (
    greenHit: LiveGreenHitResult,
    notPossibleReason?: LiveNotPossibleReason,
  ) => {
    if (!currentHoleEntry) return;
    if (greenHit === "not_possible" && !notPossibleReason) {
      setPendingNotPossible(true);
      return;
    }

    const shotNumber = currentHoleEntry.currentApproachShot ?? 2;
    const distanceMeters = optionalNumberFromInput(approachDistanceText);
    const completedShot = {
      shotNumber,
      distanceMeters,
      greenHit,
      club: approachClub,
      shotDirection: approachDirection,
      notPossibleReason:
        greenHit === "not_possible" ? (notPossibleReason ?? null) : null,
      penalties: approachPenalties,
    };
    const prior = (currentHoleEntry.approachShots ?? []).filter(
      (s) => s.shotNumber < shotNumber,
    );
    const approachShots = [...prior, completedShot];
    const penalties = totalApproachPenalties(approachShots);

    setPendingNotPossible(false);

    if (greenHit === "yes") {
      updateCurrentHole({
        approachShots,
        penalties,
        holePhase: "putting",
        gir: true,
        puttLogs: [],
        currentPuttNumber: 1,
        putts: 0,
        firstPuttDistanceFeet: null,
        puttGreenBreak: null,
      });
      setApproachDistanceText("");
      setApproachDirection(null);
      setApproachPenalties(0);
      setPuttDistanceText("");
      return;
    }

    updateCurrentHole({
      approachShots,
      penalties,
      holePhase: "approach",
      currentApproachShot: nextApproachShotNumber(shotNumber, approachPenalties),
      gir: false,
      girNotPossibleAttempt:
        greenHit === "not_possible" ||
        prior.some((s) => s.greenHit === "not_possible"),
    });
    setApproachDistanceText("");
    setApproachDirection(null);
    setApproachPenalties(0);
  };

  const editApproachShot = (targetShot: number) => {
    if (!currentHoleEntry || targetShot < 2) return;
    const all = currentHoleEntry.approachShots ?? [];
    const editing = all.find((s) => s.shotNumber === targetShot);
    const kept = all.filter((s) => s.shotNumber < targetShot);

    updateCurrentHole({
      approachShots: kept,
      penalties: totalApproachPenalties(kept),
      currentApproachShot: targetShot,
      holePhase: "approach",
      gir: null,
      putts: 0,
      firstPuttDistanceFeet: null,
      puttGreenBreak: null,
      puttLogs: [],
      currentPuttNumber: 1,
      girNotPossibleAttempt: kept.some((s) => s.greenHit === "not_possible"),
    });
    setApproachDistanceText(
      editing?.distanceMeters != null ? String(editing.distanceMeters) : "",
    );
    setApproachClub(editing?.club ?? "7i");
    setApproachDirection(editing?.shotDirection ?? null);
    setApproachPenalties(editing?.penalties ?? 0);
    setPendingNotPossible(false);
    setPuttDistanceText("");
  };

  const commitPutt = (
    made: boolean,
    missLine?: LivePuttMissLine | null,
    missLength?: LivePuttMissLength | null,
  ) => {
    if (!currentHoleEntry) return;
    const puttNumber = currentHoleEntry.currentPuttNumber ?? 1;
    const distanceFeet = optionalNumberFromInput(puttDistanceText);
    const entry: LivePuttEntry = {
      puttNumber,
      made,
      distanceFeet,
      break: currentHoleEntry.puttGreenBreak ?? null,
      missLine: made ? null : (missLine ?? null),
      missLength: made ? null : (missLength ?? null),
    };
    const prior = (currentHoleEntry.puttLogs ?? []).filter(
      (p) => p.puttNumber < puttNumber,
    );
    const puttLogs = [...prior, entry];
    const putts = puttLogs.length;

    if (made) {
      updateCurrentHole({
        puttLogs,
        putts,
        firstPuttDistanceFeet:
          puttNumber === 1 ? distanceFeet : currentHoleEntry.firstPuttDistanceFeet,
      });
      setPuttDistanceText("");
    } else {
      updateCurrentHole({
        puttLogs,
        putts,
        currentPuttNumber: puttNumber + 1,
        firstPuttDistanceFeet:
          puttNumber === 1 ? distanceFeet : currentHoleEntry.firstPuttDistanceFeet,
      });
      setPuttDistanceText("");
    }

    setPendingPuttMiss(false);
    setPuttMissLine(null);
    setPuttMissLength(null);
  };

  const tryCommitPuttMiss = (
    line: LivePuttMissLine | null,
    length: LivePuttMissLength | null,
  ) => {
    if (line && length) commitPutt(false, line, length);
  };

  const editPutt = (targetPutt: number) => {
    if (!currentHoleEntry || targetPutt < 1) return;
    const all = currentHoleEntry.puttLogs ?? [];
    const editing = all.find((p) => p.puttNumber === targetPutt);
    const kept = all.filter((p) => p.puttNumber < targetPutt);

    updateCurrentHole({
      puttLogs: kept,
      currentPuttNumber: targetPutt,
      putts: kept.length,
      firstPuttDistanceFeet:
        targetPutt === 1 ? (editing?.distanceFeet ?? null) : currentHoleEntry.firstPuttDistanceFeet,
      puttGreenBreak:
        targetPutt === 1
          ? (editing?.break ?? currentHoleEntry.puttGreenBreak ?? null)
          : currentHoleEntry.puttGreenBreak ?? null,
    });
    setPuttDistanceText(
      editing?.distanceFeet != null ? String(editing.distanceFeet) : "",
    );
    setPendingPuttMiss(false);
    setPuttMissLine(null);
    setPuttMissLength(null);
  };

  const greenHitButton = (value: LiveGreenHitResult, label: string) => {
    const active =
      value === "not_possible"
        ? pendingNotPossible
        : !pendingNotPossible && false;
    return (
      <button
        type="button"
        onClick={() => {
          if (value === "not_possible") {
            handleApproachGreenHit("not_possible");
          } else {
            setPendingNotPossible(false);
            handleApproachGreenHit(value);
          }
        }}
        className={`rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-colors ${
          active
            ? "border-[#014421] bg-[#014421] text-white"
            : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
        }`}
      >
        {label}
      </button>
    );
  };

  const teeDirButton = (value: LiveTeeDirection, label: string) => {
    const active = currentHoleEntry?.teeDirection === value;
    return (
      <button
        type="button"
        onClick={() => {
          const directionChanged = currentHoleEntry?.teeDirection !== value;
          updateCurrentHole({
            teeDirection: value,
            teeMissLie:
              value === "hit" || directionChanged
                ? null
                : (currentHoleEntry?.teeMissLie ?? null),
          });
        }}
        className={`rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-colors ${
          active
            ? "border-[#014421] bg-[#014421] text-white"
            : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
        }`}
      >
        {label}
      </button>
    );
  };

  const teeMissLieButton = (value: LiveTeeMissLie, label: string) => {
    const active = currentHoleEntry?.teeMissLie === value;
    return (
      <button
        type="button"
        onClick={() => updateCurrentHole({ teeMissLie: value })}
        className={`rounded-xl border-2 px-2 py-2 text-xs font-semibold transition-colors ${
          active
            ? "border-[#014421] bg-[#014421] text-white"
            : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
        }`}
      >
        {label}
      </button>
    );
  };

  const teeFaceContactButton = (value: LiveTeeFaceContact, label: string) => {
    const active = currentHoleEntry?.teeFaceContact === value;
    return (
      <button
        type="button"
        onClick={() => updateCurrentHole({ teeFaceContact: value })}
        className={`w-full rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
          active
            ? "border-[#014421] bg-[#014421] text-white"
            : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
        }`}
      >
        {label}
      </button>
    );
  };

  const displayCourseHole = draft
    ? (currentHoleEntry?.courseHoleNumber ??
      courseHoleNumberForPlayingHole(draft.currentHole, draft.setup))
    : 1;

  const holePar = currentHoleEntry?.par ?? null;
  const showPuttingPhase = currentHoleEntry?.holePhase === "putting";
  const showTeeShot = holePar != null && holePar !== 3 && !showPuttingPhase;
  const showApproachPhase = holePar != null && !showPuttingPhase;
  const currentApproachShot = currentHoleEntry?.currentApproachShot ?? 2;
  const loggedApproachShots = normalizeApproachShots(currentHoleEntry?.approachShots);
  const loggedPutts = normalizePuttLogs(currentHoleEntry?.puttLogs);
  const currentPuttNumber = currentHoleEntry?.currentPuttNumber ?? 1;
  const puttingComplete = puttingCompleteFromLogs(loggedPutts);
  const canGoBackApproachShot = currentApproachShot > 2 || loggedApproachShots.length > 0;
  const showTeeMissLie =
    showTeeShot &&
    (currentHoleEntry?.teeDirection === "left" ||
      currentHoleEntry?.teeDirection === "right");
  const showTeeFaceContact = showTeeShot && currentHoleEntry?.teeSolidStrike === false;
  const showTeeDoubleCross = showTeeShot && currentHoleEntry?.teeCorrectFlight === false;
  const currentHoleStrokes = currentHoleEntry
    ? effectiveHoleStrokes(currentHoleEntry)
    : null;
  const strokesVsParDelta = scoreVsParDelta(currentHoleStrokes, holePar);
  const holeScoreName =
    currentHoleStrokes != null && holePar != null
      ? holeScoreNameVsPar(currentHoleStrokes, holePar)
      : null;

  return (
    <div className="flex min-h-full flex-col bg-[#014421]">
      <div
        className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 px-4 pb-4 pt-6"
        style={{ backgroundColor: "#014421" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 shrink-0 text-[#FFA500]" aria-hidden />
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl">Live Entry</h1>
            </div>
            <p className="text-sm text-white/80">Save hole-by-hole while you play</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/log-round")}
          className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          Post-round
        </button>
      </div>

      {saveNotice && (
        <div className="mx-4 mb-2 rounded-xl bg-[#FFA500] px-4 py-2 text-center text-sm font-semibold text-black">
          {saveNotice}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-32">
        <div className="mx-auto max-w-md space-y-4">
          <LiveEntryTestingBanner />
          {LIVE_ENTRY_ENABLED && draft && (
            <LiveRoundInProgressBanner draft={draft} variant="live" />
          )}
          {phase === "setup" ? (
            <div className="rounded-2xl bg-white p-4 shadow-lg">
              <h2 className="mb-1 text-lg font-bold text-gray-900">Start your round</h2>
              <p className="mb-4 text-sm text-gray-600">
                Pick a saved course or enter a new one. Pars are remembered for next time — choose
                front or back nine when playing 9 holes.
              </p>
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="live-entry-course"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Course *
                  </label>
                  {playedCourseNames.length > 0 && !customCourseMode ? (
                    <div className="space-y-2">
                      <select
                        id="live-entry-course"
                        value={
                          setupCourseInList
                            ? playedCourseNames.find((n) =>
                                courseNamesMatch(n, setup.course),
                              ) ?? ""
                            : ""
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === LIVE_NEW_COURSE_VALUE) {
                            setCustomCourseMode(true);
                            applySetupPatch({ course: "" });
                            return;
                          }
                          if (value) loadCourseFromProfile(value);
                        }}
                        className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                      >
                        <option value="">Select a course…</option>
                        <option value={LIVE_NEW_COURSE_VALUE}>Add new course…</option>
                        {playedCourseNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {setup.course.trim() && !setupCourseInList && (
                        <p className="text-xs text-gray-500">
                          Current: {setup.course} — not in your saved list.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        id="live-entry-course"
                        type="text"
                        value={setup.course}
                        onChange={(e) => {
                          const name = e.target.value;
                          applySetupPatch({ course: name });
                          if (user?.id && findCourseProfileByName(user.id, name)) {
                            loadCourseFromProfile(name);
                          }
                        }}
                        onBlur={() => {
                          if (setup.course.trim() && user?.id) {
                            const profile = findCourseProfileByName(user.id, setup.course);
                            if (profile) loadCourseFromProfile(profile.name);
                          }
                        }}
                        placeholder="Enter course name"
                        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                      />
                      {playedCourseNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomCourseMode(false);
                            if (
                              setup.course.trim() &&
                              !playedCourseNames.some((n) =>
                                courseNamesMatch(n, setup.course),
                              )
                            ) {
                              applySetupPatch({ course: "" });
                            }
                          }}
                          className="text-xs font-semibold text-[#014421] underline-offset-2 hover:underline"
                        >
                          Choose from courses you&apos;ve played
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Tees</label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {LIVE_TEE_BOX_OPTIONS.map(({ id, label }) => {
                      const active = setup.teeBox === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => applySetupPatch({ teeBox: id })}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2.5 transition-colors ${
                            active
                              ? "border-[#014421] bg-[#014421]/5"
                              : "border-gray-200 bg-white hover:border-[#FFA500]"
                          }`}
                        >
                          <span
                            className={`h-5 w-5 shrink-0 rounded-full ${LIVE_TEE_BOX_DOT[id]}`}
                            aria-hidden
                          />
                          <span
                            className={`text-[11px] font-semibold leading-tight ${
                              active ? "text-[#014421]" : "text-gray-700"
                            }`}
                          >
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Round type</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {LIVE_ROUND_TYPE_OPTIONS.map(({ id, label }) => {
                      const active = setup.roundType === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => applySetupPatch({ roundType: id })}
                          className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                            active
                              ? "border-[#014421] bg-[#014421] text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={setup.date}
                    onChange={(e) => applySetupPatch({ date: e.target.value })}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Handicap</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={handicapText}
                      onChange={(e) => setHandicapText(e.target.value)}
                      placeholder="0.0"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Holes</label>
                    <select
                      value={setup.holes}
                      onChange={(e) =>
                        applySetupPatch({
                          holes: Number(e.target.value) === 9 ? 9 : 18,
                        })
                      }
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                    >
                      <option value={9}>9 Holes</option>
                      <option value={18}>18 Holes</option>
                    </select>
                  </div>
                </div>
                {setup.holes === 9 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Which nine?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["front", "Front 9 (1–9)"],
                          ["back", "Back 9 (10–18)"],
                        ] as const
                      ).map(([side, label]) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() => applySetupPatch({ nineSide: side as LiveNineSide })}
                          className={`rounded-xl border-2 py-2.5 text-sm font-semibold ${
                            (setup.nineSide ?? "front") === side
                              ? "border-[#014421] bg-[#014421] text-white"
                              : "border-gray-200 bg-white text-gray-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <button
                    type="button"
                    onClick={() => setShowScorecardEditor((v) => !v)}
                    className="flex w-full items-center justify-between text-left text-sm font-semibold text-gray-800"
                  >
                    <span>Course scorecard (pars)</span>
                    <span className="text-xs text-gray-500">{showScorecardEditor ? "Hide" : "Edit"}</span>
                  </button>
                  {showScorecardEditor && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-gray-600">
                        Enter par for all 18 holes once — used automatically for front/back nine
                        rounds.
                      </p>
                      <div className="grid grid-cols-9 gap-1">
                        {(setup.coursePars ?? defaultCoursePars()).map((par, i) => (
                          <div key={i} className="text-center">
                            <p className="mb-0.5 text-[10px] font-medium text-gray-500">{i + 1}</p>
                            <select
                              value={par}
                              onChange={(e) =>
                                updateCoursePar(i, Number(e.target.value))
                              }
                              className="w-full rounded-lg border border-gray-200 bg-white py-1 text-center text-xs font-semibold"
                            >
                              {[3, 4, 5].map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={shouldSaveCourseProfile}
                          onChange={(e) => setShouldSaveCourseProfile(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Save course &amp; pars for next round
                      </label>
                    </div>
                  )}
                  {!showScorecardEditor && setup.coursePars && (
                    <p className="mt-2 text-xs text-gray-600">
                      Par{" "}
                      {(setup.nineSide === "back" ? setup.coursePars.slice(9, 18) : setup.coursePars.slice(0, 9))
                        .reduce((a, b) => a + b, 0)}{" "}
                      for your {setup.holes === 9 ? (setup.nineSide === "back" ? "back" : "front") : "full"} nine
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={startOrResume}
                className="mt-5 w-full rounded-xl bg-[#FFA500] py-3.5 font-semibold text-black shadow-md transition hover:bg-amber-500"
              >
                {draft ? "Continue live round" : "Start live entry"}
              </button>
            </div>
          ) : (
            draft &&
            currentHoleEntry && (
              <>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-white">
                  <p className="truncate text-sm font-semibold">{draft.setup.course}</p>
                  <p className="text-xs text-white/75">
                    {holesCompleted} of {draft.setup.holes} holes logged
                    {draft.setup.teeBox && (
                      <>
                        {" "}
                        · {formatLiveTeeBox(draft.setup.teeBox)} tees
                      </>
                    )}
                    {draft.setup.roundType && (
                      <>
                        {" "}
                        · {formatLiveRoundType(draft.setup.roundType)}
                      </>
                    )}
                    {draft.setup.holes === 9 &&
                      ` · ${draft.setup.nineSide === "back" ? "Back" : "Front"} nine`}
                  </p>
                  {roundTotals?.gross != null && (
                    <p className="mt-1 text-sm font-bold tabular-nums">
                      Round total {roundTotals.gross}
                      {roundTotals.vsPar != null && (
                        <span className="ml-2 font-semibold text-[#FFA500]">
                          {formatLiveScoreVsPar(roundTotals.vsPar)}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-lg">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => goToHole(draft.currentHole - 1)}
                      disabled={draft.currentHole <= 1}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 disabled:opacity-40"
                      aria-label="Previous hole"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="text-center">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Hole {displayCourseHole}
                        {draft.setup.holes === 9 ? (
                          <span className="normal-case text-gray-400">
                            {" "}
                            · {draft.currentHole} of 9
                          </span>
                        ) : (
                          <span className="text-gray-400"> / 18</span>
                        )}
                      </p>
                      <div className="flex items-center justify-center">
                        <p className="text-3xl font-bold tabular-nums text-gray-900">
                          {holePar != null ? (
                            <>Par {holePar}</>
                          ) : (
                            <span className="text-xl text-gray-500">Par ?</span>
                          )}
                        </p>
                      </div>
                      <div className="mt-2 flex justify-center gap-1.5">
                        {[3, 4, 5].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateCurrentHole({ par: p })}
                            className={`rounded-lg border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                              holePar === p
                                ? "border-[#014421] bg-[#014421] text-white"
                                : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                            }`}
                          >
                            Par {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => goToHole(draft.currentHole + 1)}
                      disabled={draft.currentHole >= draft.setup.holes}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 disabled:opacity-40"
                      aria-label="Next hole"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mb-5">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Strokes this hole *
                    </label>
                    <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-gray-200">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={strokesText}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setStrokesText(raw);
                          const n = optionalNumberFromInput(raw);
                          const isManual = raw.trim() !== "";
                          updateCurrentHole({
                            strokes: n,
                            strokesManual: isManual,
                          });
                        }}
                        placeholder={holePar != null ? "e.g. 5" : "Set par first"}
                        disabled={holePar == null}
                        className="min-w-0 flex-1 border-0 px-4 py-3 text-center text-2xl font-bold tabular-nums text-gray-900 focus:border-[#FFA500] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#FFA500] disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      {holePar != null && holeScoreName != null && (
                        <div
                          className="flex min-w-[5.5rem] shrink-0 flex-col items-center justify-center border-l-2 border-gray-200 bg-[#FFA500]/15 px-3 py-2"
                          aria-label={`${holeScoreName} this hole${strokesVsParDelta != null ? ` (${strokesVsParDelta})` : ""}`}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Hole
                          </span>
                          <span className="text-center text-base font-bold leading-tight text-[#014421]">
                            {holeScoreName}
                          </span>
                        </div>
                      )}
                      {draft.currentHole >= 2 && roundTotals?.gross != null && (
                        <div
                          className="flex min-w-[5.5rem] shrink-0 flex-col items-center justify-center border-l-2 border-gray-200 bg-[#014421]/5 px-3 py-2"
                          aria-label={`Round total ${roundTotals.gross}${roundTotals.vsPar != null ? `, ${formatLiveScoreVsPar(roundTotals.vsPar)} to par` : ""}`}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Round
                          </span>
                          <span className="text-xl font-bold tabular-nums leading-tight text-gray-900">
                            {roundTotals.gross}
                          </span>
                          {roundTotals.vsPar != null && (
                            <span className="text-sm font-bold tabular-nums leading-tight text-[#014421]">
                              {formatLiveScoreVsPar(roundTotals.vsPar)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {showTeeShot && (
                    <div className="mb-5 rounded-xl border-2 border-[#FFA500]/40 bg-amber-50/50 p-3">
                      <p className="mb-3 text-sm font-bold text-gray-900">Shot 1</p>
                      <div className="mb-3">
                        <label className="mb-2 block text-xs font-medium text-gray-600">Club</label>
                        <div className="flex flex-wrap gap-1.5">
                          {LIVE_TEE_QUICK_CLUBS.map((club) => {
                            const active =
                              currentHoleEntry.teeClub === club && !otherClubOpen;
                            return (
                              <button
                                key={club}
                                type="button"
                                onClick={() => selectTeeClub(club, false)}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                  active
                                    ? "border-[#014421] bg-[#014421] text-white"
                                    : "border-gray-200 bg-white text-gray-700"
                                }`}
                              >
                                {club}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setOtherClubOpen(true)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                              otherClubOpen
                                ? "border-[#014421] bg-[#014421] text-white"
                                : "border-gray-200 bg-white text-gray-700"
                            }`}
                          >
                            Other
                          </button>
                        </div>
                        {otherClubOpen && (
                          <select
                            value={
                              isLiveTeeOtherClub(currentHoleEntry.teeClub)
                                ? (currentHoleEntry.teeClub ?? "")
                                : ""
                            }
                            onChange={(e) => {
                              const club = e.target.value;
                              selectTeeClub(club || null, true);
                            }}
                            className="mt-2 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-[#FFA500] focus:outline-none"
                          >
                            <option value="">Select club…</option>
                            {LIVE_TEE_OTHER_CLUBS.map((club) => (
                              <option key={club} value={club}>
                                {club}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="mb-3">
                        <label className="mb-2 block text-xs font-medium text-gray-600">
                          Direction
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {teeDirButton("left", "Left")}
                          {teeDirButton("hit", "Hit fairway")}
                          {teeDirButton("right", "Right")}
                        </div>
                        {showTeeMissLie && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {teeMissLieButton("rough", "Rough")}
                            {teeMissLieButton("recovery", "Recovery / Trees")}
                            {teeMissLieButton("hazard", "Hazard")}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-xs font-medium text-gray-600">
                            Solid strike?
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentHole({
                                  teeSolidStrike: true,
                                  teeFaceContact: null,
                                })
                              }
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeSolidStrike === true
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => updateCurrentHole({ teeSolidStrike: false })}
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeSolidStrike === false
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-medium text-gray-600">
                            Correct flight?
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentHole({
                                  teeCorrectFlight: true,
                                  teeDoubleCross: null,
                                })
                              }
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeCorrectFlight === true
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => updateCurrentHole({ teeCorrectFlight: false })}
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeCorrectFlight === false
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      </div>
                      {showTeeDoubleCross && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-gray-600">Double cross?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateCurrentHole({ teeDoubleCross: true })}
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeDoubleCross === true
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => updateCurrentHole({ teeDoubleCross: false })}
                              className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                                currentHoleEntry.teeDoubleCross === false
                                  ? "border-[#014421] bg-[#014421] text-white"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                      {showTeeFaceContact && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-gray-600">Face contact</p>
                          <div className="grid grid-cols-3 gap-2">
                            {LIVE_TEE_FACE_ROWS.flatMap((row) =>
                              LIVE_TEE_FACE_COLS.map((col) => {
                                const id = liveTeeFaceContactId(row, col);
                                return (
                                  <div key={id} className="min-w-0">
                                    {teeFaceContactButton(
                                      id,
                                      liveTeeFaceContactLabel(id),
                                    )}
                                  </div>
                                );
                              }),
                            )}
                            <div className="col-span-3">
                              {teeFaceContactButton("not_sure", "Not sure")}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {showApproachPhase && (
                    <div className="mb-5 rounded-xl border-2 border-[#014421]/30 bg-emerald-50/40 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900">
                          Shot {currentApproachShot}
                        </p>
                        {canGoBackApproachShot && (
                          <button
                            type="button"
                            onClick={() => {
                              const target =
                                loggedApproachShots.length > 0
                                  ? loggedApproachShots[loggedApproachShots.length - 1]
                                      .shotNumber
                                  : currentApproachShot - 1;
                              editApproachShot(target);
                            }}
                            className="shrink-0 text-xs font-semibold text-[#014421] underline-offset-2 hover:underline"
                          >
                            ← Back to Shot{" "}
                            {loggedApproachShots.length > 0
                              ? loggedApproachShots[loggedApproachShots.length - 1].shotNumber
                              : currentApproachShot - 1}
                          </button>
                        )}
                      </div>
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Shot distance (meters)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={approachDistanceText}
                          onChange={(e) => setApproachDistanceText(e.target.value)}
                          placeholder="e.g. 132"
                          className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-center text-lg font-semibold tabular-nums text-gray-900 focus:border-[#FFA500] focus:outline-none"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="mb-2 block text-xs font-medium text-gray-600">
                          Penalties (this shot)
                        </label>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setApproachPenalties((n) => Math.max(0, n - 1))
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-lg font-bold text-gray-900 hover:border-[#FFA500]"
                          >
                            −
                          </button>
                          <span className="min-w-[2.5rem] rounded-xl border-2 border-gray-200 bg-white px-2 py-1 text-center text-2xl font-bold tabular-nums text-gray-900">
                            {approachPenalties}
                          </span>
                          <button
                            type="button"
                            onClick={() => setApproachPenalties((n) => n + 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-lg font-bold text-gray-900 hover:border-[#FFA500]"
                          >
                            +
                          </button>
                        </div>
                        {totalApproachPenalties(loggedApproachShots) > 0 && (
                          <p className="mt-1 text-center text-[11px] text-gray-500">
                            {totalApproachPenalties(loggedApproachShots)} penalty stroke
                            {totalApproachPenalties(loggedApproachShots) !== 1 ? "s" : ""}{" "}
                            logged on earlier shots
                          </p>
                        )}
                      </div>
                      <div className="mb-4">
                        <label
                          htmlFor="live-approach-club"
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          Club used
                        </label>
                        <select
                          id="live-approach-club"
                          value={approachClub}
                          onChange={(e) => setApproachClub(e.target.value)}
                          className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-[#FFA500] focus:outline-none"
                        >
                          {LIVE_APPROACH_CLUB_OPTIONS.map((club) => (
                            <option key={club} value={club}>
                              {club}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-4">
                        <p className="mb-2 text-xs font-medium text-gray-600">
                          Shot direction
                        </p>
                        <div
                          className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-3"
                          role="group"
                          aria-label="Approach shot direction"
                        >
                          {LIVE_APPROACH_MATRIX_ROWS.flatMap((row) =>
                            row.map((result) => {
                              const Icon = LIVE_APPROACH_DIRECTION_ICONS[result];
                              const isSelected = approachDirection === result;
                              return (
                                <button
                                  key={result}
                                  type="button"
                                  onClick={() => setApproachDirection(result)}
                                  title={
                                    result === "gir"
                                      ? "On target"
                                      : result.replace(/-/g, " ")
                                  }
                                  className={`flex aspect-square w-full max-w-[4.25rem] shrink-0 items-center justify-center justify-self-center rounded-full border-2 bg-white transition-all active:scale-95 ${
                                    isSelected
                                      ? "border-[#014421] text-[#014421] ring-2 ring-[#014421]/30"
                                      : "border-gray-300 text-gray-600 hover:border-[#FFA500]"
                                  }`}
                                >
                                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                                </button>
                              );
                            }),
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-gray-600">
                          Green hit?
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {greenHitButton("yes", "Yes")}
                          {greenHitButton("no", "No")}
                          {greenHitButton("short_sided", "Short Sided")}
                          {greenHitButton("not_possible", "Not Possible")}
                        </div>
                        {pendingNotPossible && (
                          <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-800">
                              No GIR opportunity?
                            </p>
                            <p className="text-[11px] leading-snug text-gray-500">
                              Choose why the green wasn&apos;t realistically in play for this shot.
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              {LIVE_NOT_POSSIBLE_REASONS.map(({ id, label }) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() =>
                                    handleApproachGreenHit("not_possible", id)
                                  }
                                  className="rounded-xl border-2 border-gray-200 bg-white px-2 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:border-[#FFA500]"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-gray-500">
                          Use <span className="font-medium">No</span> when you had a look but missed.
                          Use <span className="font-medium">Short Sided</span> when you missed and
                          left a tough angle. Use <span className="font-medium">Not Possible</span>{" "}
                          when going for the green wasn&apos;t realistic.
                        </p>
                      </div>
                      {loggedApproachShots.length > 0 && (
                        <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-600">
                          <p className="font-semibold text-gray-800">Logged shots</p>
                          <ul className="mt-1 space-y-1">
                            {loggedApproachShots.map((s) => (
                              <li
                                key={s.shotNumber}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0">{formatLoggedApproachShot(s)}</span>
                                <button
                                  type="button"
                                  onClick={() => editApproachShot(s.shotNumber)}
                                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#014421] hover:border-[#FFA500]"
                                >
                                  Edit
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {showPuttingPhase && (
                    <div className="mb-5 rounded-xl border-2 border-[#FFA500]/50 bg-amber-50/60 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900">Putting</p>
                        {loggedApproachShots.length > 0 && !puttingComplete && (
                          <button
                            type="button"
                            onClick={() =>
                              editApproachShot(
                                loggedApproachShots[loggedApproachShots.length - 1].shotNumber,
                              )
                            }
                            className="shrink-0 text-xs font-semibold text-[#014421] underline-offset-2 hover:underline"
                          >
                            ← Back to Shot{" "}
                            {loggedApproachShots[loggedApproachShots.length - 1].shotNumber}
                          </button>
                        )}
                      </div>

                      {!puttingComplete ? (
                        <>
                          <p className="mb-3 text-sm font-semibold text-gray-800">
                            Putt {currentPuttNumber}
                          </p>
                          <div className="mb-4">
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Putt distance (feet)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={puttDistanceText}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setPuttDistanceText(raw);
                                if (currentPuttNumber === 1) {
                                  updateCurrentHole({
                                    firstPuttDistanceFeet: optionalNumberFromInput(raw),
                                  });
                                }
                              }}
                              placeholder="e.g. 25"
                              className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-center text-lg font-semibold tabular-nums text-gray-900 focus:border-[#FFA500] focus:outline-none"
                            />
                          </div>
                          <div className="mb-4">
                            <label className="mb-2 block text-xs font-medium text-gray-600">
                              Green break
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {LIVE_PUTT_BREAK_OPTIONS.map((option) => {
                                const active = currentHoleEntry.puttGreenBreak === option.id;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() =>
                                      updateCurrentHole({ puttGreenBreak: option.id })
                                    }
                                    className={`rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-colors ${
                                      active
                                        ? "border-[#014421] bg-[#014421] text-white"
                                        : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {!pendingPuttMiss ? (
                            <div className="mb-3">
                              <label className="mb-2 block text-xs font-medium text-gray-600">
                                Result
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => commitPutt(true)}
                                  className="rounded-xl border-2 border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-[#FFA500]"
                                >
                                  Make
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingPuttMiss(true);
                                    setPuttMissLine(null);
                                    setPuttMissLength(null);
                                  }}
                                  className="rounded-xl border-2 border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-[#FFA500]"
                                >
                                  Miss
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-3 space-y-3 rounded-xl border border-gray-200 bg-white p-3">
                              <p className="text-xs font-semibold text-gray-800">Miss details</p>
                              <div>
                                <p className="mb-2 text-xs font-medium text-gray-600">Line</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {(["high", "good", "low"] as const).map((line) => (
                                    <button
                                      key={line}
                                      type="button"
                                      onClick={() => {
                                        setPuttMissLine(line);
                                        tryCommitPuttMiss(line, puttMissLength);
                                      }}
                                      className={`rounded-xl border-2 py-2.5 text-sm font-semibold capitalize transition-colors ${
                                        puttMissLine === line
                                          ? "border-[#014421] bg-[#014421] text-white"
                                          : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                                      }`}
                                    >
                                      {line}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="mb-2 text-xs font-medium text-gray-600">Distance</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {(["long", "short", "good"] as const).map((length) => (
                                    <button
                                      key={length}
                                      type="button"
                                      onClick={() => {
                                        setPuttMissLength(length);
                                        tryCommitPuttMiss(puttMissLine, length);
                                      }}
                                      className={`rounded-xl border-2 py-2.5 text-xs font-semibold capitalize transition-colors ${
                                        puttMissLength === length
                                          ? "border-[#014421] bg-[#014421] text-white"
                                          : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
                                      }`}
                                    >
                                      {length}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingPuttMiss(false);
                                  setPuttMissLine(null);
                                  setPuttMissLength(null);
                                }}
                                className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
                              >
                                Cancel miss
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="mb-3 text-center text-sm font-semibold text-[#014421]">
                          Holed out — {loggedPutts.length} putt
                          {loggedPutts.length !== 1 ? "s" : ""}
                        </p>
                      )}

                      {loggedPutts.length > 0 && (
                        <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-600">
                          <p className="font-semibold text-gray-800">Logged putts</p>
                          <ul className="mt-1 space-y-1">
                            {loggedPutts.map((p) => (
                              <li
                                key={p.puttNumber}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0">{formatLivePuttEntry(p)}</span>
                                <button
                                  type="button"
                                  onClick={() => editPutt(p.puttNumber)}
                                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#014421] hover:border-[#FFA500]"
                                >
                                  Edit
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {currentHoleEntry.gir === true && (
                        <p className="mt-3 text-center text-xs font-semibold text-[#014421]">
                          GIR recorded
                        </p>
                      )}
                      {currentHoleEntry.girNotPossibleAttempt &&
                        currentHoleEntry.gir !== true && (
                          <p className="mt-3 text-center text-xs text-gray-600">
                            Green not possible this hole — excluded from GIR-when-possible.
                          </p>
                        )}
                    </div>
                  )}

                </div>

                <LiveRoundScorecard draft={draft} onSelectHole={goToHole} />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={saveProgress}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 py-3.5 text-sm font-semibold text-white hover:bg-white/20"
                  >
                    <Save className="h-4 w-4" aria-hidden />
                    Save progress
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveProgress();
                      if (draft.currentHole < draft.setup.holes) {
                        goToHole(draft.currentHole + 1);
                      }
                    }}
                    className="rounded-xl bg-white py-3.5 text-sm font-semibold text-[#014421] shadow-md hover:bg-gray-50"
                  >
                    {draft.currentHole < draft.setup.holes ? "Next hole" : "Last hole"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={finishRound}
                  className="w-full rounded-xl bg-[#FFA500] py-4 font-semibold text-black shadow-lg hover:bg-amber-500"
                >
                  Finish round → review &amp; save
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "Discard this live round draft? Saved hole data on this device will be cleared.",
                      )
                    ) {
                      if (user?.id) clearLiveRoundDraft(user.id);
                      setDraft(null);
                      setPhase("setup");
                    }
                  }}
                  className="w-full py-2 text-center text-sm text-white/70 hover:text-white"
                >
                  Discard live draft
                </button>
              </>
            )
          )}
        </div>
      </div>

      <ShareRoundCommunityModal
        open={sharePromptOpen}
        onClose={() => {
          setSharePromptOpen(false);
          pendingFinishDraftRef.current = null;
        }}
        onConfirm={completeFinishRound}
        context="live-finish"
      />
    </div>
  );
}
