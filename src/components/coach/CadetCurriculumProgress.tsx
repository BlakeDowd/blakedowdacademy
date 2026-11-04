"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Crown,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cadetSkillLabel } from "@/lib/cadetProgram";
import {
  CADET_HOLE_GROUPS,
  CADET_PROGRESSION_STANDARDS,
  cadetHoleGroupLabel,
  fetchCadetEnrollments,
  fetchCadetScoresForPlayer,
  formatToPar,
  summarizeCadetOnCourseForLevelUp,
  upsertCadetEnrollment,
  type CadetHoleGroup,
  type CadetOnCourseLevelSummary,
  type CadetProgressionStepId,
  type CadetScoreRow,
} from "@/lib/cadetScoring";
import {
  cadetScorecardReadyForLevelUp,
  fetchCadetScorecardsForPlayer,
  recommendCadetPracticeFromScorecards,
  summarizeCadetScorecards,
  type CadetPracticeRecommendation,
  type CadetScorecard,
  type CadetScorecardStatSummary,
} from "@/lib/cadetScorecard";
import {
  CADET_CURRICULUM_MIGRATION_HINT,
  CADET_TERMS,
  CADET_TESTS_MIGRATION_HINT,
  buildCadetLevelUpRecommendations,
  cadetProgressionStepLabel,
  cadetTestOutcomeLabel,
  cadetThreeTermWindows,
  computeCadetMoveUpReadiness,
  currentCadetProgramYear,
  currentCadetTerm,
  fetchCadetCurriculum,
  fetchCadetModuleCompletions,
  fetchCadetModuleTestResults,
  bestCadetTestByPlayer,
  cadetTestGradeLabel,
  cadetTestScoreTypeLabel,
  formatCadetTestGradeMarksSummary,
  formatCadetTestScore,
  groupCurriculumByWeek,
  nextCadetHoleGroup,
  priorTermTestResult,
  type CadetCurriculumWeek,
  type CadetModuleCompletion,
  type CadetModuleStatus,
  type CadetModuleTestResult,
  type CadetTerm,
} from "@/lib/cadetCurriculum";
import { fetchCadetEnrolledPlayers } from "@/lib/cadetInvites";
import { CadetSetupInvites } from "@/components/coach/CadetSetupInvites";

type PlayerOpt = { id: string; full_name: string | null };

function ProgressionLadder({
  current,
  isJuniorMember,
}: {
  current: CadetHoleGroup | null;
  isJuniorMember: boolean;
}) {
  const currentId: CadetProgressionStepId | null = isJuniorMember
    ? "junior_member"
    : current;

  return (
    <div className="cadet-path-rail relative z-[1]">
      {CADET_PROGRESSION_STANDARDS.map((step, i) => {
        const isCurrent = currentId === step.id;
        const currentIdx = currentId
          ? CADET_PROGRESSION_STANDARDS.findIndex((s) => s.id === currentId)
          : -1;
        const past = currentIdx > i;
        const isJm = step.id === "junior_member";
        return (
          <div
            key={String(step.id)}
            className={`cadet-path-step flex min-w-0 flex-1 flex-col items-center ${
              isCurrent ? "cadet-path-step-current" : ""
            }`}
            style={{ animationDelay: `${100 + i * 70}ms` }}
          >
            <div
              className={`relative flex h-[3.35rem] w-full max-w-[3.1rem] flex-col items-center justify-center rounded-2xl px-0.5 ring-1 transition ${
                isJm
                  ? "bg-[#d6c4a1] text-[#013319] ring-[#d6c4a1]/55"
                  : isCurrent
                    ? "bg-[#014421] text-white ring-[#014421]/30"
                    : past
                      ? "bg-[#014421]/12 text-[#014421] ring-[#014421]/15"
                      : "bg-white text-stone-400 ring-stone-200"
              }`}
              title={isJm ? "Junior Member" : undefined}
            >
              {isJm ? (
                <span className="absolute -top-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#014421] text-[#d6c4a1] ring-2 ring-white">
                  <Crown className="h-3 w-3" aria-hidden />
                </span>
              ) : null}
              <span className={`font-bold ${isJm ? "text-[9px] leading-tight" : "text-sm tabular-nums"}`}>
                {step.shortLabel}
              </span>
              {past && !isJm ? <Check className="mt-0.5 h-3 w-3" aria-hidden /> : null}
              {isCurrent ? (
                <span
                  className={`mt-0.5 text-[8px] font-bold uppercase tracking-wide ${
                    isJm ? "text-[#013319]/80" : "text-white/85"
                  }`}
                >
                  Now
                </span>
              ) : null}
            </div>
            <span
              className={`mt-1.5 text-center font-semibold leading-tight ${
                isJm
                  ? "max-w-[3.5rem] text-[7px] font-bold uppercase tracking-wide text-[#014421]"
                  : "text-[8px] uppercase tracking-wide text-stone-400"
              }`}
            >
              {isJm ? "Junior Member" : "hole"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CadetCurriculumProgress({
  initialPlayerId = null,
  initialYear,
  initialTerm,
}: {
  initialPlayerId?: string | null;
  initialYear?: number;
  initialTerm?: CadetTerm;
} = {}) {
  const [year, setYear] = useState(() => initialYear ?? currentCadetProgramYear());
  const [term, setTerm] = useState<CadetTerm>(() => initialTerm ?? currentCadetTerm());
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPlayerId);
  const [modules, setModules] = useState<CadetCurriculumWeek[]>([]);
  const [yearModules, setYearModules] = useState<CadetCurriculumWeek[]>([]);
  const [completions, setCompletions] = useState<CadetModuleCompletion[]>([]);
  const [testResults, setTestResults] = useState<CadetModuleTestResult[]>([]);
  const [allTestResults, setAllTestResults] = useState<CadetModuleTestResult[]>([]);
  const [onCourseScores, setOnCourseScores] = useState<CadetScoreRow[]>([]);
  const [scorecards, setScorecards] = useState<CadetScorecard[]>([]);
  const [scorecardsAvailable, setScorecardsAvailable] = useState(true);
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup | null>(null);
  const [isJuniorMember, setIsJuniorMember] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [studentLoading, setStudentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [testsAvailable, setTestsAvailable] = useState(true);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = createClient();
      const enrolled = await fetchCadetEnrolledPlayers(client);
      let list: PlayerOpt[] = enrolled.players;
      // Fallback to all profiles only before cadet_enrollments exists.
      if (!enrolled.available) {
        const { data } = await client.from("profiles").select("id, full_name").order("full_name");
        list = (data as PlayerOpt[]) || [];
      }
      if (cancelled) return;
      setPlayers(list);
      if (initialPlayerId) {
        const hit = list.find((p) => p.id === initialPlayerId);
        setSelectedId(initialPlayerId);
        if (hit) setQuery(hit.full_name?.trim() || "Student");
        else {
          // Deep-link may be a profile not yet in enrolled list — still select and show name from profiles.
          const { data } = await client
            .from("profiles")
            .select("id, full_name")
            .eq("id", initialPlayerId)
            .maybeSingle();
          if (!cancelled && data) {
            const p = data as PlayerOpt;
            setPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
            setQuery(p.full_name?.trim() || "Student");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPlayerId]);

  useEffect(() => {
    if (!initialPlayerId) return;
    setSelectedId(initialPlayerId);
  }, [initialPlayerId]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => (p.full_name || "").trim().toLowerCase().includes(q))
      .slice(0, 12);
  }, [players, query]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedId) ?? null,
    [players, selectedId],
  );

  const clearStudentOverlay = useCallback(() => {
    setCompletions([]);
    setTestResults([]);
    setAllTestResults([]);
    setOnCourseScores([]);
    setScorecards([]);
    setHoleGroup(null);
    setIsJuniorMember(false);
    setStudentLoading(false);
  }, []);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setError(null);
    const client = createClient();
    const [curr, yearCurr, priorYearCurr] = await Promise.all([
      fetchCadetCurriculum(client, { year, term }),
      fetchCadetCurriculum(client, { year }),
      fetchCadetCurriculum(client, { year: year - 1 }),
    ]);
    setAvailable(curr.available);
    if (curr.error) setError(curr.error);
    setModules(curr.rows);
    setYearModules([...priorYearCurr.rows, ...yearCurr.rows]);
    setPlanLoading(false);
  }, [year, term]);

  const loadStudent = useCallback(
    async (playerId: string) => {
      setStudentLoading(true);
      setError(null);
      setOk(null);
      const client = createClient();

      const [curr, yearCurr, priorYearCurr, enroll] = await Promise.all([
        fetchCadetCurriculum(client, { year, term }),
        fetchCadetCurriculum(client, { year }),
        fetchCadetCurriculum(client, { year: year - 1 }),
        fetchCadetEnrollments(client),
      ]);

      setAvailable(curr.available);
      if (curr.error) setError(curr.error);
      setModules(curr.rows);
      setYearModules([...priorYearCurr.rows, ...yearCurr.rows]);

      const enrollment = enroll.rows.find((r) => r.player_id === playerId);
      const group = enrollment?.hole_group ?? null;
      setHoleGroup(group);
      setIsJuniorMember(Boolean(enrollment?.is_junior_member));

      const termWindow = cadetThreeTermWindows(year).find((w) => w.term === term);
      const yearIds = yearCurr.rows.map((r) => r.id);
      const termIds = curr.rows.map((r) => r.id);

      const [comp, tests, history, scoresRes, cardsRes] = await Promise.all([
        termIds.length
          ? fetchCadetModuleCompletions(client, termIds)
          : Promise.resolve({ rows: [] as CadetModuleCompletion[], error: null, available: true }),
        yearIds.length
          ? fetchCadetModuleTestResults(client, {
              curriculumWeekIds: yearIds,
              playerId,
            })
          : Promise.resolve({ rows: [] as CadetModuleTestResult[], error: null, available: true }),
        fetchCadetModuleTestResults(client, { playerId }),
        fetchCadetScoresForPlayer(client, {
          playerId,
          holeGroup: group ?? undefined,
          start: termWindow?.start,
          end: termWindow?.end,
        }),
        fetchCadetScorecardsForPlayer(client, {
          playerId,
          holeGroup: group ?? undefined,
          start: termWindow?.start,
          end: termWindow?.end,
        }),
      ]);

      if (curr.available) {
        setCompletions(comp.rows.filter((c) => c.player_id === playerId));
        setTestResults(tests.rows.filter((r) => r.program_year === year && r.term === term));
        setTestsAvailable(tests.available);
        if (tests.error && !tests.available) setError(tests.error);
        setAllTestResults(history.rows.length ? history.rows : tests.rows);
      } else {
        setCompletions([]);
        setTestResults([]);
        setAllTestResults([]);
      }
      setOnCourseScores(scoresRes.scores);
      setScorecards(cardsRes.cards);
      setScorecardsAvailable(cardsRes.available);
      setStudentLoading(false);
    },
    [year, term],
  );

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!selectedId) {
      clearStudentOverlay();
      return;
    }
    void loadStudent(selectedId);
  }, [selectedId, loadStudent, clearStudentOverlay]);

  const onCourseSummary: CadetOnCourseLevelSummary = useMemo(
    () => summarizeCadetOnCourseForLevelUp(onCourseScores, holeGroup),
    [onCourseScores, holeGroup],
  );

  const scorecardSummary: CadetScorecardStatSummary = useMemo(
    () => summarizeCadetScorecards(scorecards),
    [scorecards],
  );

  const scorecardLevel = useMemo(
    () => cadetScorecardReadyForLevelUp(scorecardSummary, holeGroup),
    [scorecardSummary, holeGroup],
  );

  const practiceRecs: CadetPracticeRecommendation[] = useMemo(
    () => recommendCadetPracticeFromScorecards(scorecardSummary),
    [scorecardSummary],
  );

  const readiness = useMemo(
    () =>
      computeCadetMoveUpReadiness({
        modules,
        completions: selectedId ? completions : [],
        testResults: selectedId ? testResults : [],
        currentGroup: selectedId ? holeGroup : null,
        playerId: selectedId || "",
        isJuniorMember: selectedId ? isJuniorMember : false,
        onCourseReady: selectedId ? onCourseSummary.ready : false,
        onCourseDetail: selectedId
          ? onCourseSummary.detail
          : "Select a student to see on-course form",
        scorecardReady: selectedId && scorecardsAvailable ? scorecardLevel.ready : undefined,
        scorecardDetail:
          selectedId && scorecardsAvailable ? scorecardLevel.detail : undefined,
      }),
    [
      modules,
      completions,
      testResults,
      holeGroup,
      selectedId,
      isJuniorMember,
      onCourseSummary,
      scorecardsAvailable,
      scorecardLevel,
    ],
  );

  const modulesByWeek = useMemo(() => groupCurriculumByWeek(modules), [modules]);

  const completionByModule = useMemo(() => {
    const m = new Map<string, CadetModuleStatus>();
    for (const c of completions) m.set(c.curriculum_week_id, c.status);
    return m;
  }, [completions]);

  const levelUpRecs = useMemo(
    () =>
      buildCadetLevelUpRecommendations({
        readiness,
        onCourseDetail: onCourseSummary.detail,
        scorecardDetail: scorecardsAvailable ? scorecardLevel.detail : null,
        practiceDetails: practiceRecs
          .filter((p) => p.severity !== "watch")
          .map((p) => p.title),
        playerName: selectedPlayer?.full_name,
      }),
    [
      readiness,
      onCourseSummary.detail,
      scorecardsAvailable,
      scorecardLevel.detail,
      practiceRecs,
      selectedPlayer?.full_name,
    ],
  );

  const testModules = useMemo(() => modules.filter((m) => m.is_test), [modules]);

  /** Best attempt per module (any pass wins) for status chips. */
  const resultByModule = useMemo(() => {
    const m = new Map<string, CadetModuleTestResult>();
    if (!selectedId) return m;
    const byWeek = new Map<string, CadetModuleTestResult[]>();
    for (const r of testResults) {
      if (r.player_id !== selectedId) continue;
      const list = byWeek.get(r.curriculum_week_id) ?? [];
      list.push(r);
      byWeek.set(r.curriculum_week_id, list);
    }
    for (const [weekId, list] of byWeek) {
      const best = bestCadetTestByPlayer(list).get(selectedId);
      if (best) m.set(weekId, best);
    }
    return m;
  }, [testResults, selectedId]);

  const attemptCountByModule = useMemo(() => {
    const m = new Map<string, number>();
    if (!selectedId) return m;
    for (const r of testResults) {
      if (r.player_id !== selectedId) continue;
      m.set(r.curriculum_week_id, (m.get(r.curriculum_week_id) ?? 0) + 1);
    }
    return m;
  }, [testResults, selectedId]);

  const moduleLookup = useMemo(() => {
    const m = new Map<
      string,
      Pick<CadetCurriculumWeek, "subject" | "test_skill_id" | "test_standard">
    >();
    for (const mod of yearModules) {
      m.set(mod.id, {
        subject: mod.subject,
        test_skill_id: mod.test_skill_id,
        test_standard: mod.test_standard,
      });
    }
    return m;
  }, [yearModules]);

  /** Full history for the selected student — oldest first so coaches see improvement from the start. */
  const improvementHistory = useMemo(() => {
    if (!selectedId) return [];
    return [...allTestResults]
      .filter((r) => r.player_id === selectedId)
      .sort((a, b) => {
        if (a.program_year !== b.program_year) return a.program_year - b.program_year;
        if (a.term !== b.term) return a.term - b.term;
        return a.created_at.localeCompare(b.created_at);
      })
      .map((r) => {
        const mod = moduleLookup.get(r.curriculum_week_id);
        return {
          result: r,
          subject: mod?.subject || "Test",
          skillId: mod?.test_skill_id ?? null,
        };
      });
  }, [allTestResults, selectedId, moduleLookup]);

  const promote = async () => {
    if (!selectedId || !readiness.nextStep || !holeGroup) return;
    const label = cadetProgressionStepLabel(readiness.nextStep);
    if (!confirm(`Move ${selectedPlayer?.full_name || "student"} to ${label}?`)) {
      return;
    }
    setMoving(true);
    setError(null);
    setOk(null);
    if (readiness.nextStep === "junior_member") {
      const res = await upsertCadetEnrollment(createClient(), {
        playerId: selectedId,
        holeGroup: 10,
        isJuniorMember: true,
      });
      setMoving(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setIsJuniorMember(true);
      setHoleGroup(10);
      setOk("Marked as Junior Member.");
      return;
    }
    const res = await upsertCadetEnrollment(createClient(), {
      playerId: selectedId,
      holeGroup: readiness.nextStep,
      isJuniorMember: false,
    });
    setMoving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setHoleGroup(readiness.nextStep);
    setIsJuniorMember(false);
    setOk(`Moved to ${cadetHoleGroupLabel(readiness.nextStep)}.`);
  };

  const enrollAt = async (group: CadetHoleGroup) => {
    if (!selectedId) return;
    setMoving(true);
    setError(null);
    const res = await upsertCadetEnrollment(createClient(), {
      playerId: selectedId,
      holeGroup: group,
      isJuniorMember: false,
    });
    setMoving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setHoleGroup(group);
    setIsJuniorMember(false);
    setOk(`Set to ${cadetHoleGroupLabel(group)}.`);
  };

  return (
    <section className="space-y-3">
      <div className="cadet-panel-rise overflow-hidden rounded-2xl border border-[#014421]/10 bg-white/90 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#014421] to-[#1a5c38] text-white">
            <TrendingUp className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#014421]/70">
              Player pathway
            </p>
            <h2 className="cadet-display mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
              Curriculum progress
            </h2>
            <p className="mt-1 text-xs leading-snug text-stone-500">
              Search a cadet to see tests, on-course form, and level-up recommendations through to Junior Member.
            </p>
          </div>
        </div>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Program year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-[#014421]"
          >
            {Array.from({ length: 5 }, (_, i) => currentCadetProgramYear() - 1 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Term">
          {CADET_TERMS.map((t) => {
            const on = term === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTerm(t)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition ${
                  on ? "bg-[#014421] text-white shadow-sm" : "border border-stone-200 bg-stone-50 text-stone-700"
                }`}
              >
                Term {t}
              </button>
            );
          })}
        </div>
      </div>

      <CadetSetupInvites />

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setStandardsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              Skill standards
            </span>
            <span className="mt-0.5 block text-xs text-stone-400">
              3 → 5 → 7 → 10 → Junior Member
            </span>
          </span>
          {standardsOpen ? (
            <ChevronDown className="h-4 w-4 text-stone-400" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
          )}
        </button>
        {standardsOpen ? (
          <div className="space-y-2 border-t border-stone-100 px-4 py-3">
            <p className="text-[11px] leading-snug text-stone-500">
              Move up when term modules, gated tests, and on-course scoring are ready. Junior Member is the highest step.
            </p>
            {CADET_PROGRESSION_STANDARDS.map((step, i) => {
              const isJm = step.id === "junior_member";
              const isCurrent = isJm
                ? isJuniorMember
                : !isJuniorMember && holeGroup === step.id;
              return (
                <div
                  key={String(step.id)}
                  className={`rounded-xl px-3 py-2.5 ring-1 ${
                    isJm
                      ? "bg-gradient-to-r from-[#d6c4a1]/35 to-[#d6c4a1]/10 ring-[#d6c4a1]/50"
                      : isCurrent
                        ? "bg-[#014421]/5 ring-[#014421]/25"
                        : "bg-stone-50/80 ring-stone-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-1 text-[10px] font-bold ${
                        isJm
                          ? "bg-[#d6c4a1] text-[#013319]"
                          : isCurrent
                            ? "bg-[#014421] text-white"
                            : "bg-white text-stone-700 ring-1 ring-stone-200"
                      }`}
                    >
                      {isJm ? <Crown className="h-3.5 w-3.5" aria-hidden /> : step.shortLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-stone-900">
                        {step.title}
                        {isCurrent ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#014421]">
                            Current
                          </span>
                        ) : null}
                        {!isJm && i < CADET_PROGRESSION_STANDARDS.length - 1 ? (
                          <span className="ml-1.5 text-[10px] font-medium text-stone-400">
                            → {CADET_PROGRESSION_STANDARDS[i + 1]!.title}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-stone-600">{step.focus}</p>
                      <p className="mt-1 text-[10px] font-medium text-stone-400">{step.moveUp}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="cadet-panel-rise overflow-hidden rounded-2xl border border-[#014421]/10 bg-white/90 p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#014421]/70">
          Student profile
        </p>
        <p className="mt-1 text-xs leading-snug text-stone-500">
          {selectedId
            ? "Showing this student’s ladder, modules, and tests for the term."
            : "Search enrolled Cadets (use a setup link above if they’re new)."}
        </p>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId(null);
              setOk(null);
            }}
            placeholder="Search student name…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none focus:border-[#014421]"
          />
        </div>
        {query.trim() && !selectedId ? (
          filteredPlayers.length === 0 ? (
            <p className="mt-2 text-center text-xs text-stone-500">No students match.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {filteredPlayers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setQuery(p.full_name?.trim() || "Unnamed");
                    }}
                    className="w-full rounded-xl bg-stone-50 px-3 py-2 text-left text-sm font-semibold text-stone-800 ring-1 ring-stone-200 hover:bg-[#014421]/5"
                  >
                    {p.full_name?.trim() || "Unnamed"}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {selectedId ? (
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setQuery("");
              setOk(null);
            }}
            className="mt-2 text-[11px] font-semibold text-[#014421] hover:underline"
          >
            Clear student · show term plan only
          </button>
        ) : null}
      </div>

      {!available && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {error || CADET_CURRICULUM_MIGRATION_HINT}
        </p>
      )}
      {available && error && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>
      )}
      {ok && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          {ok}
        </p>
      )}

      {planLoading ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading term plan…
        </p>
      ) : (
        <>
          <div className="cadet-panel-rise overflow-hidden rounded-2xl border border-[#014421]/10 bg-gradient-to-b from-white to-[#f3f7f4] p-4 shadow-sm">
            <p className="cadet-display text-2xl font-semibold tracking-tight text-stone-900">
              {selectedId
                ? selectedPlayer?.full_name?.trim() || "Student"
                : `Term ${term} plan`}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#014421]/65">
              {selectedId
                ? studentLoading
                  ? "Loading student…"
                  : "Progression pathway"
                : "Pathway · pick a student to highlight their step"}
            </p>
            <div className="mt-4 rounded-2xl bg-white/80 px-2 pb-3 pt-4 ring-1 ring-[#014421]/10">
              <ProgressionLadder
                current={selectedId ? holeGroup : null}
                isJuniorMember={selectedId ? isJuniorMember : false}
              />
            </div>
            {selectedId && holeGroup == null && !studentLoading ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-stone-500">Not enrolled yet — set a starting hole group:</p>
                <div className="flex flex-wrap gap-1.5">
                  {CADET_HOLE_GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={moving}
                      onClick={() => void enrollAt(g)}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    >
                      {cadetHoleGroupLabel(g)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Term {term} snapshot
              {!selectedId ? <span className="font-medium normal-case text-stone-400"> · plan</span> : null}
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-stone-50 px-2 py-2">
                <dt className="text-[10px] font-semibold uppercase text-stone-400">Modules</dt>
                <dd className="text-lg font-bold tabular-nums text-stone-900">
                  {selectedId ? `${readiness.modulesDone}/${readiness.modulesTotal}` : `—/${modules.length}`}
                </dd>
              </div>
              <div className="rounded-xl bg-stone-50 px-2 py-2">
                <dt className="text-[10px] font-semibold uppercase text-stone-400">Tests</dt>
                <dd className="text-lg font-bold tabular-nums text-stone-900">
                  {selectedId
                    ? `${readiness.testsPassed}/${readiness.testsTotal}`
                    : `—/${testModules.length}`}
                </dd>
              </div>
              <div className="rounded-xl bg-stone-50 px-2 py-2">
                <dt className="text-[10px] font-semibold uppercase text-stone-400">Rounds</dt>
                <dd className="text-lg font-bold tabular-nums text-stone-900">
                  {selectedId ? onCourseSummary.rounds : "—"}
                </dd>
                {selectedId ? (
                  <dd className="text-[10px] font-semibold text-stone-400">
                    {onCourseSummary.avgToPar != null
                      ? `avg ${formatToPar(onCourseSummary.avgToPar)}`
                      : onCourseSummary.avgGross != null
                        ? `avg ${onCourseSummary.avgGross}`
                        : "—"}
                  </dd>
                ) : null}
              </div>
            </dl>

            {modulesByWeek.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                  Term modules
                </p>
                {modulesByWeek.map(({ week, modules: weekMods }) => (
                  <div key={week} className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#014421]/70">
                      Week {week}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {weekMods.map((mod) => {
                        const status = selectedId ? completionByModule.get(mod.id) : undefined;
                        return (
                          <li key={mod.id} className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-stone-900">{mod.subject}</p>
                              {mod.is_test ? (
                                <p className="text-[10px] font-medium text-[#014421]/70">Skill test</p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                !selectedId
                                  ? "bg-white text-stone-400 ring-1 ring-stone-200"
                                  : status === "done"
                                    ? "bg-[#014421]/10 text-[#014421]"
                                    : status === "needs_work"
                                      ? "bg-amber-50 text-amber-800"
                                      : "bg-white text-stone-400 ring-1 ring-stone-200"
                              }`}
                            >
                              {!selectedId
                                ? "—"
                                : status === "done"
                                  ? "Done"
                                  : status === "needs_work"
                                    ? "Needs work"
                                    : "Open"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-500">
                No modules in Term {term} {year} yet. Add them on the Year plan tab.
              </p>
            )}

            {selectedId && scorecardsAvailable ? (
              <div className="mt-3 rounded-xl bg-[#014421]/[0.04] px-3 py-2.5 ring-1 ring-[#014421]/10">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#014421]/70">
                  Scorecard averages · {scorecardSummary.holes} holes
                </p>
                <dl className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                  <div>
                    <dt className="text-[9px] font-semibold uppercase text-stone-400">&lt;30m</dt>
                    <dd className="text-sm font-bold tabular-nums text-stone-900">
                      {scorecardSummary.avgShotsTo30m ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-semibold uppercase text-stone-400">Chips</dt>
                    <dd className="text-sm font-bold tabular-nums text-stone-900">
                      {scorecardSummary.avgChipsPerHole ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-semibold uppercase text-stone-400">Bunker</dt>
                    <dd className="text-sm font-bold tabular-nums text-stone-900">
                      {scorecardSummary.avgBunkerPerHole ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-semibold uppercase text-stone-400">Putts</dt>
                    <dd className="text-sm font-bold tabular-nums text-stone-900">
                      {scorecardSummary.avgPuttsPerHole ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {selectedId && scorecardsAvailable && practiceRecs.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                  Recommended practice
                </p>
                {practiceRecs.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-lg px-2.5 py-1.5 text-xs ${
                      p.severity === "high"
                        ? "bg-amber-50 text-amber-950"
                        : p.severity === "medium"
                          ? "bg-amber-50/70 text-amber-900"
                          : "bg-stone-50 text-stone-600"
                    }`}
                  >
                    <span className="font-bold">{p.title}</span>
                    <span className="text-stone-500"> · {p.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {!testsAvailable ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                {CADET_TESTS_MIGRATION_HINT}
              </p>
            ) : null}

            {testModules.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                  Skill tests
                </p>
                <ul className="space-y-2">
                {testModules.map((mod) => {
                  const result = selectedId ? resultByModule.get(mod.id) : undefined;
                  const attemptCount = selectedId ? attemptCountByModule.get(mod.id) ?? 0 : 0;
                  const prior = selectedId
                    ? priorTermTestResult(allTestResults, moduleLookup, {
                        playerId: selectedId,
                        year,
                        term,
                        subject: mod.subject,
                        skillId: mod.test_skill_id,
                      })
                    : null;
                  return (
                    <li
                      key={mod.id}
                      className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-stone-900">{mod.subject}</p>
                          {mod.test_standard ? (
                            <p className="mt-0.5 text-[11px] text-stone-500">{mod.test_standard}</p>
                          ) : null}
                          <p className="mt-0.5 text-[10px] font-medium text-stone-400">
                            {formatCadetTestGradeMarksSummary(
                              mod.test_grade_marks,
                              mod.test_score_type,
                            ) || cadetTestScoreTypeLabel(mod.test_score_type)}
                            {mod.test_max_score != null && !mod.test_grade_marks?.length
                              ? ` · /${mod.test_max_score}`
                              : ""}
                            {mod.test_skill_id ? ` · ${cadetSkillLabel(mod.test_skill_id)}` : ""}
                          </p>
                          {!selectedId ? (
                            <p className="mt-1 text-[11px] text-stone-400">Select a student for results</p>
                          ) : result ? (
                            <p
                              className={`mt-1 text-xs font-bold ${
                                result.outcome === "pass" ? "text-[#014421]" : "text-amber-700"
                              }`}
                            >
                              Best{" "}
                              {result.grade ? `${cadetTestGradeLabel(result.grade)} · ` : ""}
                              {formatCadetTestScore(result.score, result.max_score, result.attempts)}
                              {attemptCount > 1 ? (
                                <span className="ml-1 font-medium text-stone-400">
                                  ({attemptCount} attempts)
                                </span>
                              ) : null}
                              {prior ? (
                                <span className="ml-1 font-medium text-stone-400">
                                  (was{" "}
                                  {prior.grade ? `${cadetTestGradeLabel(prior.grade)} · ` : ""}
                                  {formatCadetTestScore(prior.score, prior.max_score, prior.attempts)} T
                                  {prior.term} {prior.program_year})
                                </span>
                              ) : null}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-stone-400">
                              No attempts this term
                              {prior ? (
                                <span>
                                  {" "}
                                  · earlier{" "}
                                  {prior.grade ? `${cadetTestGradeLabel(prior.grade)} · ` : ""}
                                  {formatCadetTestScore(prior.score, prior.max_score, prior.attempts)} T
                                  {prior.term}
                                </span>
                              ) : null}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
                </ul>
              </div>
            ) : modules.length > 0 ? (
              <p className="mt-3 text-xs text-stone-500">
                No test modules in this term yet. Mark a module as a test on the Year plan tab.
              </p>
            ) : null}
          </div>

          {selectedId ? (
            studentLoading ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading student results…
              </p>
            ) : (
              <>
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                    Improvement from the start
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    Every recorded attempt for this student, oldest first.
                  </p>
                  {improvementHistory.length === 0 ? (
                    <p className="mt-3 text-xs text-stone-500">
                      No test attempts yet. Log scores from Year plan → Test attempts.
                    </p>
                  ) : (
                    <ol className="mt-3 space-y-2">
                      {improvementHistory.map(({ result: r, subject, skillId }, idx) => (
                        <li
                          key={r.id}
                          className="flex items-start gap-2 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-stone-400 ring-1 ring-stone-200">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-stone-900">{subject}</p>
                            <p className="text-[10px] font-medium text-stone-400">
                              Term {r.term} {r.program_year}
                              {skillId ? ` · ${cadetSkillLabel(skillId)}` : ""}
                            </p>
                            <p
                              className={`mt-0.5 text-xs font-bold ${
                                r.outcome === "pass" ? "text-[#014421]" : "text-amber-700"
                              }`}
                            >
                              {r.grade ? `${cadetTestGradeLabel(r.grade)} · ` : ""}
                              {formatCadetTestScore(r.score, r.max_score, r.attempts)}
                              {!r.grade ? ` · ${cadetTestOutcomeLabel(r.outcome)}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#014421]/10 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#014421]/70">
                    Level-up recommendations
                  </p>
                  <p className="mt-1 text-[11px] text-stone-500">
                    On-course scores and skill testing for this term.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {levelUpRecs.map((rec, i) => (
                      <li
                        key={rec.id}
                        className={`cadet-path-step rounded-xl px-3 py-2.5 ring-1 ${
                          rec.tone === "go"
                            ? "bg-gradient-to-r from-[#014421]/10 to-[#1a5c38]/5 ring-[#014421]/20"
                            : rec.tone === "practise"
                              ? "bg-amber-50 ring-amber-200/80"
                              : "bg-stone-50 ring-stone-200"
                        }`}
                        style={{ animationDelay: `${80 + i * 60}ms` }}
                      >
                        <p
                          className={`text-xs font-bold ${
                            rec.tone === "go"
                              ? "text-[#014421]"
                              : rec.tone === "practise"
                                ? "text-amber-950"
                                : "text-stone-800"
                          }`}
                        >
                          {rec.source === "on_course"
                            ? "On course · "
                            : rec.source === "skill_test"
                              ? "Skill test · "
                              : rec.source === "scorecard"
                                ? "Scorecard · "
                                : rec.source === "module"
                                  ? "Module · "
                                  : ""}
                          {rec.title}
                        </p>
                        <p
                          className={`mt-0.5 text-[11px] leading-snug ${
                            rec.tone === "practise" ? "text-amber-900/80" : "text-stone-600"
                          }`}
                        >
                          {rec.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Move-up</p>
                  {holeGroup == null ? (
                    <p className="mt-2 text-sm text-stone-600">Enrol the student on the ladder first.</p>
                  ) : readiness.atTop ? (
                    <p className="mt-2 text-sm font-semibold text-[#014421]">
                      Top of pathway · Junior Member
                    </p>
                  ) : readiness.ready && readiness.nextStep ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-semibold text-[#014421]">
                        Ready for {cadetProgressionStepLabel(readiness.nextStep)}
                      </p>
                      <p className="text-xs text-stone-500">
                        Modules done, skill tests passed, and on-course scoring meets the term bar.
                      </p>
                      <button
                        type="button"
                        disabled={moving}
                        onClick={() => void promote()}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Move to {cadetProgressionStepLabel(readiness.nextStep)}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-semibold text-stone-800">
                        Not ready for{" "}
                        {readiness.nextStep
                          ? cadetProgressionStepLabel(readiness.nextStep)
                          : nextCadetHoleGroup(holeGroup)
                            ? cadetHoleGroupLabel(nextCadetHoleGroup(holeGroup)!)
                            : holeGroup === 10
                              ? "Junior Member"
                              : "next step"}
                      </p>
                      {readiness.gaps.length === 0 && modules.length === 0 ? (
                        <p className="text-xs text-stone-500">No modules planned for this term yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {readiness.gaps.map((g) => (
                            <li
                              key={`${g.kind}-${g.moduleId}`}
                              className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950"
                            >
                              <span className="font-bold">
                                {g.kind === "test"
                                  ? "Skill test"
                                  : g.kind === "on_course"
                                    ? "On course"
                                    : g.kind === "scorecard"
                                      ? "Scorecard"
                                      : "Module"}
                                :
                              </span>{" "}
                              {g.subject}
                              <span className="text-amber-800/80"> · {g.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-xs text-stone-500">
              Search a student above to fill in Done / Needs work, test scores, scorecards, and move-up.
            </p>
          )}
        </>
      )}
    </section>
  );
}
