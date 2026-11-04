"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  Trash2,
  UserCheck,
  Video,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { useBunnyVideoMetadata } from "@/hooks/useBunnyVideoMetadata";
import { authJsonHeaders, uploadCoachingVideo } from "@/lib/coachingFeed";
import { buildBunnyThumbnailUrl } from "@/lib/bunnyStream";
import { listCadetSkillOptions } from "@/lib/cadetProgram";
import { CADET_HOLE_GROUPS, cadetHoleGroupLabel, type CadetHoleGroup } from "@/lib/cadetScoring";
import {
  CADET_COMPLETIONS_MIGRATION_HINT,
  CADET_CURRICULUM_MIGRATION_HINT,
  CADET_TERMS,
  CADET_TESTS_MIGRATION_HINT,
  cadetCurriculumProfileHref,
  cadetDrillLibraryHref,
  CADET_TEST_GRADE_IDS,
  CADET_TEST_SCORE_TYPES,
  cadetTestGradeLabel,
  cadetTestOutcomeLabel,
  cadetTestScoreTypeLabel,
  clearCadetModuleCompletion,
  currentCadetProgramYear,
  defaultCadetTestGradeMarks,
  deleteCadetCurriculumWeek,
  fetchCadetBunnyVideoTitle,
  fetchCadetCurriculum,
  fetchCadetDrillCatalog,
  fetchCadetModuleCompletions,
  fetchCadetModuleTestResults,
  formatCadetTestGradeMarksSummary,
  formatCadetTestPassMark,
  formatCadetTestScore,
  groupCurriculumByWeek,
  insertCadetCurriculumWeek,
  insertCadetModuleTestAttempt,
  latestCadetTestByPlayer,
  rankCadetTestGrade,
  resolveCadetBunnyVideoId,
  suggestCadetTestOutcome,
  updateCadetCurriculumWeek,
  upsertCadetModuleCompletion,
  type CadetCurriculumWeek,
  type CadetDrillRef,
  type CadetModuleCompletion,
  type CadetModuleStatus,
  type CadetModuleTestResult,
  type CadetTerm,
  type CadetTestGradeId,
  type CadetTestGradeMark,
  type CadetTestOutcome,
  type CadetTestScoreType,
} from "@/lib/cadetCurriculum";

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";

function CadetGradeMarksEditor({
  bands,
  onChange,
  scoreType,
  busy,
  fieldClass,
}: {
  bands: CadetTestGradeMark[];
  onChange: (next: CadetTestGradeMark[]) => void;
  scoreType: CadetTestScoreType;
  busy?: boolean;
  fieldClass: string;
}) {
  const op = scoreType === "strokes" ? "≤" : "≥";
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-stone-500">
        Grade marks (score {op} mark → that grade)
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {CADET_TEST_GRADE_IDS.map((id) => {
          const band = bands.find((b) => b.id === id) ?? {
            id,
            label: cadetTestGradeLabel(id),
            mark: 0,
          };
          return (
            <label key={id} className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">
              {band.label}
              <input
                type="number"
                min={0}
                max={500}
                step="any"
                value={Number.isFinite(band.mark) ? String(band.mark) : ""}
                onChange={(e) => {
                  const mark = Number(e.target.value);
                  onChange(
                    CADET_TEST_GRADE_IDS.map((gid) => {
                      const cur = bands.find((b) => b.id === gid) ?? {
                        id: gid,
                        label: cadetTestGradeLabel(gid),
                        mark: 0,
                      };
                      return gid === id
                        ? { ...cur, mark: Number.isFinite(mark) ? mark : 0 }
                        : cur;
                    }),
                  );
                }}
                className={`${fieldClass} mt-1`}
                disabled={busy}
                title={`${band.label}: ${op}${band.mark}`}
              />
            </label>
          );
        })}
      </div>
      <p className="text-[10px] text-stone-400">
        5-hole+ = Pass for move-up · 3-hole = developing · 10-hole = top band
      </p>
    </div>
  );
}

type PlayerOpt = { id: string; full_name: string | null };

export function CadetYearFramework() {
  const [year, setYear] = useState(() => currentCadetProgramYear());
  const [term, setTerm] = useState<CadetTerm>(1);
  const [rows, setRows] = useState<CadetCurriculumWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingWeek, setAddingWeek] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tickOpenId, setTickOpenId] = useState<string | null>(null);
  const [sessionTickWeek, setSessionTickWeek] = useState<number | null>(null);
  const [testOpenId, setTestOpenId] = useState<string | null>(null);
  const [addingTestId, setAddingTestId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [completions, setCompletions] = useState<CadetModuleCompletion[]>([]);
  const [completionsAvailable, setCompletionsAvailable] = useState(true);
  const [testResults, setTestResults] = useState<CadetModuleTestResult[]>([]);
  const [testsAvailable, setTestsAvailable] = useState(true);

  const byWeek = useMemo(() => groupCurriculumByWeek(rows), [rows]);

  const completionsByWeek = useMemo(() => {
    const map = new Map<string, CadetModuleCompletion[]>();
    for (const c of completions) {
      const list = map.get(c.curriculum_week_id) ?? [];
      list.push(c);
      map.set(c.curriculum_week_id, list);
    }
    return map;
  }, [completions]);

  const testResultsByWeek = useMemo(() => {
    const map = new Map<string, CadetModuleTestResult[]>();
    for (const r of testResults) {
      if (r.program_year !== year || r.term !== term) continue;
      const list = map.get(r.curriculum_week_id) ?? [];
      list.push(r);
      map.set(r.curriculum_week_id, list);
    }
    return map;
  }, [testResults, year, term]);

  const reloadCompletions = useCallback(async (weekIds: string[]) => {
    const res = await fetchCadetModuleCompletions(createClient(), weekIds);
    setCompletionsAvailable(res.available);
    if (res.error && !res.available) setError(res.error);
    setCompletions(res.rows);
  }, []);

  const reloadTestResults = useCallback(async (weekIds: string[]) => {
    const res = await fetchCadetModuleTestResults(createClient(), {
      curriculumWeekIds: weekIds,
      year,
      term,
    });
    setTestsAvailable(res.available);
    if (res.error && !res.available) setError(res.error);
    setTestResults(res.rows);
  }, [year, term]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = createClient();
    const res = await fetchCadetCurriculum(client, { year, term });
    setAvailable(res.available);
    if (res.error) setError(res.error);
    setRows(res.rows);
    if (res.available && res.rows.length) {
      const ids = res.rows.map((r) => r.id);
      await Promise.all([reloadCompletions(ids), reloadTestResults(ids)]);
    } else {
      setCompletions([]);
      setTestResults([]);
    }
    setLoading(false);
  }, [year, term, reloadCompletions, reloadTestResults]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (!cancelled) setPlayers((data as PlayerOpt[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedWeek = rows.length
    ? Math.min(20, Math.max(...rows.map((r) => r.week_number)) + 1)
    : 1;

  return (
    <section className="space-y-3">
      <div className="cadet-panel-rise overflow-hidden rounded-2xl border border-[#014421]/10 bg-white/90 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#014421] to-[#1a5c38] text-white">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#014421]/70">
              Season plan
            </p>
            <h2 className="cadet-display mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
              Year framework
            </h2>
            <p className="mt-1 text-xs leading-snug text-stone-500">
              Plan by week — stack modules for one session, attach tests, and track who is ready to move up.
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

      {!available && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {error || CADET_CURRICULUM_MIGRATION_HINT}
        </p>
      )}
      {available && error && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Weekly modules · {rows.length}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              Same week = same session — e.g. Week 1 can be Putting + Low Point.
            </p>
          </div>
          {available && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setAddingWeek((w) => (w != null ? null : suggestedWeek));
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
            >
              {addingWeek != null ? (
                <X className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              {addingWeek != null ? "Close" : "Add module"}
            </button>
          )}
        </div>

        {addingWeek != null && available && (
          <ModuleForm
            mode="create"
            defaultWeek={addingWeek}
            onCancel={() => setAddingWeek(null)}
            onSubmit={async (values) => {
              const res = await insertCadetCurriculumWeek(createClient(), {
                year,
                term,
                weekNumber: values.weekNumber,
                subject: values.subject,
                moduleNotes: values.moduleNotes,
                bunnyVideoId: values.bunnyVideoId,
                bunnyVideoTitle: values.bunnyVideoTitle,
                drillRefs: values.drillRefs,
                isTest: values.isTest,
                testStandard: values.testStandard,
                testMaxScore: values.testMaxScore,
                testPassMark: values.testPassMark,
                testGradeMarks: values.testGradeMarks,
                testScoreType: values.testScoreType,
                testSkillId: values.testSkillId,
                gatesHoleGroup: values.gatesHoleGroup,
              });
              if (res.error) return res.error;
              setAddingWeek(null);
              await reload();
              return null;
            }}
          />
        )}

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : byWeek.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-500">
            No modules in Term {term} {year} yet. Tap Add module to start the framework.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {byWeek.map(({ week, modules }) => (
              <li key={week} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#014421]">
                      Week {week}
                      <span className="ml-1.5 font-medium normal-case tracking-normal text-stone-400">
                        · {modules.length} module{modules.length === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  {available && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setAddingWeek(week);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#014421] hover:bg-[#014421]/5"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Add to week
                    </button>
                  )}
                </div>

                {modules.length > 1 ? (
                  <WeekSessionTickOff
                    week={week}
                    modules={modules}
                    open={sessionTickWeek === week}
                    onToggle={() =>
                      setSessionTickWeek((w) => (w === week ? null : week))
                    }
                    players={players}
                    completionsByModule={completionsByWeek}
                    available={completionsAvailable}
                    onError={setError}
                    onChanged={async () => {
                      await reloadCompletions(rows.map((r) => r.id));
                    }}
                  />
                ) : null}

                <ul className="mt-2 space-y-2">
                  {modules.map((mod) =>
                    editingId === mod.id ? (
                      <ModuleForm
                        key={mod.id}
                        mode="edit"
                        defaultWeek={mod.week_number}
                        defaultSubject={mod.subject}
                        defaultNotes={mod.module_notes ?? ""}
                        defaultBunnyVideoId={mod.bunny_video_id ?? ""}
                        defaultBunnyVideoTitle={mod.bunny_video_title ?? ""}
                        defaultDrillRefs={mod.drill_refs}
                        defaultIsTest={mod.is_test}
                        defaultTestStandard={mod.test_standard ?? ""}
                        defaultTestMaxScore={mod.test_max_score}
                        defaultTestPassMark={mod.test_pass_mark}
                        defaultTestGradeMarks={mod.test_grade_marks}
                        defaultTestScoreType={mod.test_score_type}
                        defaultTestSkillId={mod.test_skill_id ?? ""}
                        defaultGatesHoleGroup={mod.gates_hole_group}
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (values) => {
                          const res = await updateCadetCurriculumWeek(createClient(), mod.id, {
                            weekNumber: values.weekNumber,
                            subject: values.subject,
                            moduleNotes: values.moduleNotes,
                            bunnyVideoId: values.bunnyVideoId,
                            bunnyVideoTitle: values.bunnyVideoTitle,
                            drillRefs: values.drillRefs,
                            isTest: values.isTest,
                            testStandard: values.testStandard,
                            testMaxScore: values.testMaxScore,
                            testPassMark: values.testPassMark,
                            testGradeMarks: values.testGradeMarks,
                            testScoreType: values.testScoreType,
                            testSkillId: values.testSkillId,
                            gatesHoleGroup: values.gatesHoleGroup,
                          });
                          if (res.error) return res.error;
                          setEditingId(null);
                          await reload();
                          return null;
                        }}
                      />
                    ) : (
                      <div
                        key={mod.id}
                        className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-semibold text-stone-900">{mod.subject}</p>
                              {mod.is_test ? (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-[#014421]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#014421]">
                                  <ClipboardCheck className="h-3 w-3" aria-hidden />
                                  Test
                                </span>
                              ) : null}
                              {mod.gates_hole_group ? (
                                <span className="rounded-md bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                                  Gates {cadetHoleGroupLabel(mod.gates_hole_group)}
                                </span>
                              ) : null}
                            </div>
                            {mod.is_test && mod.test_standard ? (
                              <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
                                Grade: {mod.test_standard}
                                <span className="text-stone-400">
                                  {" "}
                                  · {cadetTestScoreTypeLabel(mod.test_score_type)}
                                  {mod.test_max_score != null ? ` /${mod.test_max_score}` : ""}
                                  {formatCadetTestGradeMarksSummary(
                                    mod.test_grade_marks,
                                    mod.test_score_type,
                                  )
                                    ? ` · ${formatCadetTestGradeMarksSummary(mod.test_grade_marks, mod.test_score_type)}`
                                    : formatCadetTestPassMark(
                                          mod.test_score_type,
                                          mod.test_pass_mark,
                                          mod.test_max_score,
                                        )
                                      ? ` · ${formatCadetTestPassMark(mod.test_score_type, mod.test_pass_mark, mod.test_max_score)}`
                                      : ""}
                                </span>
                              </p>
                            ) : null}
                            {mod.module_notes ? (
                              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-snug text-stone-600">
                                {mod.module_notes}
                              </p>
                            ) : null}
                            {mod.drill_refs.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {mod.drill_refs.map((d) => (
                                  <li key={`${mod.id}-${d.id}`}>
                                    <Link
                                      href={cadetDrillLibraryHref(d)}
                                      className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold text-[#014421] ring-1 ring-stone-200 hover:bg-[#014421]/5"
                                    >
                                      <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      <span className="min-w-0 truncate">{d.title}</span>
                                      <span className="shrink-0 text-[10px] font-medium text-stone-400">
                                        {d.category}
                                      </span>
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {mod.bunny_video_id ? (
                              <ModuleVideoButton
                                videoId={mod.bunny_video_id}
                                storedTitle={mod.bunny_video_title}
                                playing={playingId === mod.id}
                                onToggle={() =>
                                  setPlayingId((id) => (id === mod.id ? null : mod.id))
                                }
                              />
                            ) : (
                              <p className="mt-1.5 text-[11px] text-stone-400">No video attached</p>
                            )}
                            {playingId === mod.id && mod.bunny_video_id ? (
                              <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl bg-black">
                                <BunnyVideoPlayer videoId={mod.bunny_video_id} fill />
                              </div>
                            ) : null}
                            <ModuleTickOff
                              moduleId={mod.id}
                              open={tickOpenId === mod.id}
                              onToggle={() =>
                                setTickOpenId((id) => (id === mod.id ? null : mod.id))
                              }
                              players={players}
                              completions={completionsByWeek.get(mod.id) ?? []}
                              available={completionsAvailable}
                              onError={setError}
                              onChanged={async () => {
                                await reloadCompletions(rows.map((r) => r.id));
                              }}
                            />
                            {!mod.is_test ? (
                              <div className="mt-2 border-t border-stone-200/80 pt-2">
                                {addingTestId === mod.id ? (
                                  <AddTestQuickForm
                                    subject={mod.subject}
                                    onCancel={() => setAddingTestId(null)}
                                    onSave={async (values) => {
                                      const res = await updateCadetCurriculumWeek(
                                        createClient(),
                                        mod.id,
                                        {
                                          isTest: true,
                                          testStandard: values.standard,
                                          testMaxScore: values.maxScore,
                                          testPassMark: values.passMark,
                                          testGradeMarks: values.gradeMarks,
                                          testScoreType: values.scoreType,
                                          testSkillId: null,
                                          gatesHoleGroup: values.gatesHoleGroup,
                                        },
                                      );
                                      if (res.error) {
                                        setError(res.error);
                                        return res.error;
                                      }
                                      setAddingTestId(null);
                                      setTestOpenId(mod.id);
                                      await reload();
                                      return null;
                                    }}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(null);
                                      setAddingTestId(mod.id);
                                      setTestOpenId(null);
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#014421]/30 bg-white px-3 py-2 text-xs font-bold text-[#014421] hover:bg-[#014421]/5"
                                  >
                                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                                    Add test
                                  </button>
                                )}
                              </div>
                            ) : (
                              <ModuleTestEntry
                                module={mod}
                                year={year}
                                term={term}
                                open={testOpenId === mod.id}
                                onToggle={() =>
                                  setTestOpenId((id) => (id === mod.id ? null : mod.id))
                                }
                                players={players}
                                results={testResultsByWeek.get(mod.id) ?? []}
                                available={testsAvailable}
                                onError={setError}
                                onChanged={async () => {
                                  await reloadTestResults(rows.map((r) => r.id));
                                }}
                              />
                            )}
                          </div>
                          <div className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAddingWeek(null);
                                setEditingId(mod.id);
                              }}
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-700"
                              aria-label={`Edit ${mod.subject}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  if (!confirm(`Remove “${mod.subject}” from week ${mod.week_number}?`)) return;
                                  const res = await deleteCadetCurriculumWeek(createClient(), mod.id);
                                  if (res.error) {
                                    setError(res.error);
                                    return;
                                  }
                                  await reload();
                                })();
                              }}
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-red-600"
                              aria-label={`Delete ${mod.subject}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AddTestQuickForm({
  subject,
  onCancel,
  onSave,
}: {
  subject: string;
  onCancel: () => void;
  onSave: (values: {
    standard: string;
    maxScore: number | null;
    passMark: number | null;
    gradeMarks: CadetTestGradeMark[];
    scoreType: CadetTestScoreType;
    gatesHoleGroup: CadetHoleGroup | null;
  }) => Promise<string | null>;
}) {
  const [standard, setStandard] = useState(`Pass ${subject} combine`);
  const [scoreType, setScoreType] = useState<CadetTestScoreType>("makes");
  const [maxScore, setMaxScore] = useState("10");
  const [gradeMarks, setGradeMarks] = useState<CadetTestGradeMark[]>(() =>
    defaultCadetTestGradeMarks(10, "makes"),
  );
  const [gates, setGates] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field =
    "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs text-stone-900 outline-none focus:border-[#014421]";

  const applyMaxDefaults = (nextMax: string, nextType: CadetTestScoreType) => {
    const maxNum = nextMax.trim() === "" ? 10 : Number(nextMax);
    setGradeMarks(defaultCadetTestGradeMarks(Number.isFinite(maxNum) ? maxNum : 10, nextType));
  };

  return (
    <div className="space-y-2 rounded-xl border border-[#014421]/20 bg-white px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#014421]">Add test</p>
      <p className="text-[11px] leading-snug text-stone-500">
        Set 3 → 5 → 7 → 10-hole marks — scores auto-rank to a pathway grade.
      </p>
      <label className="block text-[11px] font-medium text-stone-500">
        Grading guidelines
        <input
          value={standard}
          onChange={(e) => setStandard(e.target.value)}
          placeholder="e.g. Make 6/8 from 3–6 ft, start line solid"
          maxLength={400}
          className={`${field} mt-1`}
          disabled={busy}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-stone-500">
          Scoring
          <select
            value={scoreType}
            onChange={(e) => {
              const next = e.target.value as CadetTestScoreType;
              setScoreType(next);
              if (next !== "completion") applyMaxDefaults(maxScore, next);
            }}
            className={`${field} mt-1`}
            disabled={busy}
          >
            {CADET_TEST_SCORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {cadetTestScoreTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        {scoreType !== "completion" ? (
          <label className="block text-[11px] font-medium text-stone-500">
            {scoreType === "makes" ? "Out of" : "Max (optional)"}
            <input
              type="number"
              min={1}
              max={200}
              value={maxScore}
              onChange={(e) => {
                setMaxScore(e.target.value);
                applyMaxDefaults(e.target.value, scoreType);
              }}
              placeholder="e.g. 10"
              className={`${field} mt-1`}
              disabled={busy}
            />
          </label>
        ) : (
          <div />
        )}
      </div>
      {scoreType !== "completion" ? (
        <CadetGradeMarksEditor
          bands={gradeMarks}
          onChange={setGradeMarks}
          scoreType={scoreType}
          busy={busy}
          fieldClass={field}
        />
      ) : null}
      <label className="block text-[11px] font-medium text-stone-500">
        Gates move to
        <select
          value={gates}
          onChange={(e) => setGates(e.target.value)}
          className={`${field} mt-1`}
          disabled={busy}
        >
          <option value="">Any / current</option>
          {CADET_HOLE_GROUPS.filter((g) => g !== 3).map((g) => (
            <option key={g} value={g}>
              {cadetHoleGroupLabel(g)}
            </option>
          ))}
        </select>
      </label>
      {err && <p className="text-[11px] font-medium text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              const gatesNum = gates ? Number(gates) : null;
              const maxNum =
                scoreType === "completion" || maxScore.trim() === "" ? null : Number(maxScore);
              const fiveHole = gradeMarks.find((b) => b.id === "5");
              const message = await onSave({
                standard: standard.trim(),
                maxScore: maxNum,
                passMark: fiveHole?.mark ?? null,
                gradeMarks: scoreType === "completion" ? [] : gradeMarks,
                scoreType,
                gatesHoleGroup:
                  gatesNum != null && CADET_HOLE_GROUPS.includes(gatesNum as CadetHoleGroup)
                    ? (gatesNum as CadetHoleGroup)
                    : null,
              });
              setBusy(false);
              if (message) setErr(message);
            })();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#014421] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Save test
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-[11px] font-semibold text-stone-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ModuleTestEntry({
  module,
  year,
  term,
  open,
  onToggle,
  players,
  results,
  available,
  onError,
  onChanged,
}: {
  module: CadetCurriculumWeek;
  year: number;
  term: CadetTerm;
  open: boolean;
  onToggle: () => void;
  players: PlayerOpt[];
  results: CadetModuleTestResult[];
  available: boolean;
  onError: (msg: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [score, setScore] = useState("");
  const [attempts, setAttempts] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [scoreType, setScoreType] = useState<CadetTestScoreType>(module.test_score_type || "makes");
  const [maxScoreEdit, setMaxScoreEdit] = useState(
    module.test_max_score != null ? String(module.test_max_score) : "",
  );
  const [standardEdit, setStandardEdit] = useState(module.test_standard || "");
  const [gradeMarksEdit, setGradeMarksEdit] = useState<CadetTestGradeMark[]>(
    module.test_grade_marks.length
      ? module.test_grade_marks
      : defaultCadetTestGradeMarks(module.test_max_score, module.test_score_type),
  );
  const [scoringBusy, setScoringBusy] = useState(false);

  useEffect(() => {
    setScoreType(module.test_score_type || "makes");
    setMaxScoreEdit(module.test_max_score != null ? String(module.test_max_score) : "");
    setStandardEdit(module.test_standard || "");
    setGradeMarksEdit(
      module.test_grade_marks.length
        ? module.test_grade_marks
        : defaultCadetTestGradeMarks(module.test_max_score, module.test_score_type),
    );
  }, [
    module.id,
    module.test_score_type,
    module.test_max_score,
    module.test_standard,
    module.test_grade_marks,
  ]);

  const latestByPlayer = useMemo(() => latestCadetTestByPlayer(results), [results]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => (p.full_name || "").trim().toLowerCase().includes(q))
      .slice(0, 12);
  }, [players, query]);

  const passedPlayers = useMemo(() => {
    const ids = new Set<string>();
    for (const r of results) if (r.outcome === "pass") ids.add(r.player_id);
    return ids.size;
  }, [results]);

  const scoreTypeNow = module.test_score_type || "makes";
  const gradeBands = module.test_grade_marks;
  const scoreNum = scoreTypeNow === "completion" ? 1 : Number(score);
  const scoreReady =
    scoreTypeNow === "completion" || (score.trim() !== "" && Number.isFinite(scoreNum));
  const suggestedGrade: CadetTestGradeId | null = scoreReady
    ? rankCadetTestGrade(scoreNum, { scoreType: scoreTypeNow, bands: gradeBands })
    : null;
  const suggestedOutcome = scoreReady
    ? suggestCadetTestOutcome(scoreNum, {
        scoreType: scoreTypeNow,
        passMark: module.test_pass_mark,
        gradeMarks: gradeBands,
      })
    : null;
  const gradeSummary = formatCadetTestGradeMarksSummary(gradeBands, module.test_score_type);
  const passMarkLabel = formatCadetTestPassMark(
    module.test_score_type,
    module.test_pass_mark,
    module.test_max_score,
  );

  const save = async (playerId: string, outcome?: CadetTestOutcome) => {
    const n = scoreTypeNow === "completion" ? 1 : Number(score);
    if (scoreTypeNow !== "completion" && (!Number.isFinite(n) || n < 0)) {
      onError("Enter a score before saving the attempt.");
      return;
    }
    const grade = rankCadetTestGrade(n, { scoreType: scoreTypeNow, bands: gradeBands });
    const auto = suggestCadetTestOutcome(n, {
      scoreType: scoreTypeNow,
      passMark: module.test_pass_mark,
      gradeMarks: gradeBands,
    });
    const resolved = outcome ?? auto;
    if (!resolved) {
      onError("Set grade marks in Edit grading, or choose Pass / Needs practice.");
      return;
    }
    const att = attempts.trim() === "" ? null : Number(attempts);
    if (attempts.trim() !== "" && (!Number.isFinite(att) || (att ?? 0) < 1)) {
      onError("Attempts must be a whole number ≥ 1.");
      return;
    }
    setBusyId(playerId);
    onError(null);
    const res = await insertCadetModuleTestAttempt(createClient(), {
      curriculumWeekId: module.id,
      playerId,
      year,
      term,
      score: n,
      maxScore: module.test_max_score,
      attempts: att,
      grade,
      outcome: resolved,
    });
    setBusyId(null);
    if (res.error) {
      onError(res.error);
      return;
    }
    setScore("");
    setAttempts("");
    setQuery("");
    await onChanged();
  };

  const saveScoring = async () => {
    setScoringBusy(true);
    onError(null);
    const maxNum =
      scoreType === "completion" || maxScoreEdit.trim() === "" ? null : Number(maxScoreEdit);
    const fiveHole = gradeMarksEdit.find((b) => b.id === "5");
    const res = await updateCadetCurriculumWeek(createClient(), module.id, {
      isTest: true,
      testStandard: standardEdit.trim() || module.test_standard,
      testMaxScore: maxNum,
      testPassMark: fiveHole?.mark ?? module.test_pass_mark,
      testGradeMarks: scoreType === "completion" ? [] : gradeMarksEdit,
      testScoreType: scoreType,
      testSkillId: module.test_skill_id,
      gatesHoleGroup: module.gates_hole_group,
    });
    setScoringBusy(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    setScoringOpen(false);
    await onChanged();
  };

  const field =
    "w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs text-stone-900 outline-none focus:border-[#014421]";

  return (
    <div className="mt-2 border-t border-stone-200/80 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/80"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <ClipboardCheck className="h-3.5 w-3.5 text-[#014421]" aria-hidden />
          Test attempts
        </span>
        <span className="text-[11px] font-semibold text-stone-400">
          {results.length
            ? `${results.length} log${results.length === 1 ? "" : "s"} · ${passedPlayers} passed`
            : open
              ? "Hide"
              : "Log scores"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!available ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              {CADET_TESTS_MIGRATION_HINT}
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-dashed border-[#014421]/25 bg-white px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => setScoringOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-stone-600">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
                    <span className="truncate">
                      {gradeSummary || passMarkLabel || cadetTestScoreTypeLabel(module.test_score_type)}
                      {module.test_standard ? ` · ${module.test_standard}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-[#014421]">
                    {scoringOpen ? "Close" : "Edit grading"}
                  </span>
                </button>
                {scoringOpen ? (
                  <div className="mt-2 space-y-2 border-t border-stone-100 pt-2">
                    <label className="block text-[11px] font-medium text-stone-500">
                      Grading guidelines
                      <input
                        value={standardEdit}
                        onChange={(e) => setStandardEdit(e.target.value)}
                        placeholder="What coaches look for"
                        className={`${field} mt-1`}
                        disabled={scoringBusy}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-[11px] font-medium text-stone-500">
                        Type
                        <select
                          value={scoreType}
                          onChange={(e) => {
                            const next = e.target.value as CadetTestScoreType;
                            setScoreType(next);
                            if (next !== "completion") {
                              const maxN =
                                maxScoreEdit.trim() === "" ? 10 : Number(maxScoreEdit);
                              setGradeMarksEdit(
                                defaultCadetTestGradeMarks(
                                  Number.isFinite(maxN) ? maxN : 10,
                                  next,
                                ),
                              );
                            }
                          }}
                          className={`${field} mt-1`}
                          disabled={scoringBusy}
                        >
                          {CADET_TEST_SCORE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {cadetTestScoreTypeLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {scoreType !== "completion" ? (
                        <label className="block text-[11px] font-medium text-stone-500">
                          {scoreType === "makes" ? "Out of" : "Max"}
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={maxScoreEdit}
                            onChange={(e) => {
                              setMaxScoreEdit(e.target.value);
                              const maxN =
                                e.target.value.trim() === "" ? 10 : Number(e.target.value);
                              setGradeMarksEdit(
                                defaultCadetTestGradeMarks(
                                  Number.isFinite(maxN) ? maxN : 10,
                                  scoreType,
                                ),
                              );
                            }}
                            className={`${field} mt-1`}
                            disabled={scoringBusy}
                          />
                        </label>
                      ) : null}
                    </div>
                    {scoreType !== "completion" ? (
                      <CadetGradeMarksEditor
                        bands={gradeMarksEdit}
                        onChange={setGradeMarksEdit}
                        scoreType={scoreType}
                        busy={scoringBusy}
                        fieldClass={field}
                      />
                    ) : null}
                    <button
                      type="button"
                      disabled={scoringBusy}
                      onClick={() => void saveScoring()}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[#014421] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {scoringBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Save grading
                    </button>
                  </div>
                ) : null}
              </div>

              {suggestedOutcome && scoreReady ? (
                <p
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                    suggestedOutcome === "pass"
                      ? "bg-[#014421]/8 text-[#014421]"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  Ranks as {suggestedGrade ? cadetTestGradeLabel(suggestedGrade) : "Below 3-hole"} ·{" "}
                  {cadetTestOutcomeLabel(suggestedOutcome)}
                </p>
              ) : null}

              <div className="grid grid-cols-[1fr_64px_64px] gap-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search student…"
                    className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-xs text-stone-900 outline-none focus:border-[#014421]"
                  />
                </div>
                {scoreTypeNow !== "completion" ? (
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder={module.test_max_score != null ? `/${module.test_max_score}` : "Score"}
                    className={field}
                    title="Score for this attempt"
                  />
                ) : (
                  <div />
                )}
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={attempts}
                  onChange={(e) => setAttempts(e.target.value)}
                  placeholder="Att"
                  className={field}
                  title="Attempts this session (optional)"
                />
              </div>

              {query.trim() ? (
                filtered.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-stone-500">No students match.</p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-y-auto">
                    {filtered.map((p) => {
                      const name = p.full_name?.trim() || "Unnamed";
                      const latest = latestByPlayer.get(p.id);
                      const playerLogs = results.filter((r) => r.player_id === p.id);
                      const busy = busyId === p.id;
                          const canAuto = suggestedOutcome != null;
                          return (
                        <li
                          key={p.id}
                          className="flex flex-col gap-1.5 rounded-lg bg-white px-2 py-1.5 ring-1 ring-stone-200"
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
                              {name}
                            </span>
                            <span className="shrink-0 text-[10px] font-medium text-stone-400">
                              {playerLogs.length} att
                            </span>
                            {latest ? (
                              <span
                                className={`shrink-0 text-[10px] font-bold ${
                                  latest.outcome === "pass" ? "text-[#014421]" : "text-amber-700"
                                }`}
                              >
                                {latest.grade ? `${cadetTestGradeLabel(latest.grade)} · ` : ""}
                                {formatCadetTestScore(latest.score, latest.max_score, latest.attempts)}
                              </span>
                            ) : null}
                          </div>
                          {canAuto ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void save(p.id)}
                              className={`w-full rounded-md px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50 ${
                                suggestedOutcome === "pass" ? "bg-[#014421]" : "bg-amber-600"
                              }`}
                            >
                              {busy
                                ? "…"
                                : `Log ${suggestedGrade ? cadetTestGradeLabel(suggestedGrade) : "Below 3-hole"}`}
                            </button>
                          ) : null}
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void save(p.id, "pass")}
                              className="flex-1 rounded-md bg-[#014421]/90 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                            >
                              {busy ? "…" : "Pass"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void save(p.id, "needs_practice")}
                              className="flex-1 rounded-md bg-amber-600/90 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                            >
                              Needs practice
                            </button>
                          </div>
                          <Link
                            href={cadetCurriculumProfileHref(p.id, { year, term })}
                            className="text-center text-[10px] font-bold text-[#014421] hover:underline"
                          >
                            Open curriculum profile →
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <p className="text-[11px] text-stone-400">
                  {gradeSummary
                    ? "Search a student, enter score — auto-ranks 3 → 10-hole (override Pass anytime)."
                    : "Search a student, enter score. Set 3/5/7/10-hole marks in Edit grading to auto-rank."}
                </p>
              )}

              {results.length > 0 ? (
                <div className="rounded-lg bg-white/70 px-2 py-2 ring-1 ring-stone-200">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Attempt log · {results.length}
                  </p>
                  <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                    {[...results]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((r) => {
                        const name =
                          r.player_name?.trim() ||
                          players.find((p) => p.id === r.player_id)?.full_name?.trim() ||
                          "Unnamed";
                        return (
                          <li key={r.id} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate font-medium text-stone-700">
                              {name}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] font-bold ${
                                r.outcome === "pass" ? "text-[#014421]" : "text-amber-700"
                              }`}
                            >
                              {r.grade ? `${cadetTestGradeLabel(r.grade)} · ` : ""}
                              {formatCadetTestScore(r.score, r.max_score, r.attempts)}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WeekSessionTickOff({
  week,
  modules,
  open,
  onToggle,
  players,
  completionsByModule,
  available,
  onError,
  onChanged,
}: {
  week: number;
  modules: CadetCurriculumWeek[];
  open: boolean;
  onToggle: () => void;
  players: PlayerOpt[];
  completionsByModule: Map<string, CadetModuleCompletion[]>;
  available: boolean;
  onError: (msg: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => modules.map((m) => m.id));
  const [busyId, setBusyId] = useState<string | null>(null);
  const moduleIdsKey = modules.map((m) => m.id).join(",");

  useEffect(() => {
    setSelectedIds(moduleIdsKey ? moduleIdsKey.split(",") : []);
  }, [moduleIdsKey]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => (p.full_name || "").trim().toLowerCase().includes(q))
      .slice(0, 12);
  }, [players, query]);

  const applyStatus = async (playerId: string, status: CadetModuleStatus) => {
    if (!selectedIds.length) {
      onError("Select at least one module for this session.");
      return;
    }
    setBusyId(playerId);
    onError(null);
    const client = createClient();
    for (const moduleId of selectedIds) {
      const res = await upsertCadetModuleCompletion(client, {
        curriculumWeekId: moduleId,
        playerId,
        status,
      });
      if (res.error) {
        setBusyId(null);
        onError(res.error);
        return;
      }
    }
    setBusyId(null);
    await onChanged();
  };

  return (
    <div className="mt-2 rounded-xl border border-[#014421]/15 bg-[#014421]/[0.04] px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#014421]">
          <UserCheck className="h-3.5 w-3.5" aria-hidden />
          Session tick-off
        </span>
        <span className="text-[11px] font-semibold text-stone-400">
          {open ? "Hide" : `Mark across ${modules.length} modules`}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!available ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              {CADET_COMPLETIONS_MIGRATION_HINT}
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-stone-500">
                Tick a student once for every module covered in this Week {week} session.
              </p>
              <ul className="space-y-1">
                {modules.map((mod) => {
                  const on = selectedSet.has(mod.id);
                  return (
                    <li key={mod.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-stone-200">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setSelectedIds((ids) =>
                              on ? ids.filter((id) => id !== mod.id) : [...ids, mod.id],
                            );
                          }}
                          className="rounded border-stone-300 text-[#014421] focus:ring-[#014421]"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
                          {mod.subject}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search student name…"
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-xs text-stone-900 outline-none focus:border-[#014421]"
                  autoFocus
                />
              </div>

              {query.trim() ? (
                filtered.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-stone-500">No students match.</p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-y-auto">
                    {filtered.map((p) => {
                      const name = p.full_name?.trim() || "Unnamed";
                      const busy = busyId === p.id;
                      const statuses = modules
                        .filter((m) => selectedSet.has(m.id))
                        .map((m) =>
                          (completionsByModule.get(m.id) ?? []).find((c) => c.player_id === p.id)
                            ?.status,
                        );
                      const allDone =
                        statuses.length > 0 && statuses.every((s) => s === "done");
                      const allNeeds =
                        statuses.length > 0 && statuses.every((s) => s === "needs_work");
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-stone-200"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
                            {name}
                          </span>
                          <StatusButtons
                            current={allDone ? "done" : allNeeds ? "needs_work" : null}
                            busy={busy}
                            onPick={(s) => void applyStatus(p.id, s)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <p className="text-[11px] text-stone-400">Type a name, then mark Done or Needs work.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleTickOff({
  moduleId,
  open,
  onToggle,
  players,
  completions,
  available,
  onError,
  onChanged,
}: {
  moduleId: string;
  open: boolean;
  onToggle: () => void;
  players: PlayerOpt[];
  completions: CadetModuleCompletion[];
  available: boolean;
  onError: (msg: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const byPlayer = useMemo(() => {
    const m = new Map<string, CadetModuleCompletion>();
    for (const c of completions) m.set(c.player_id, c);
    return m;
  }, [completions]);

  const doneCount = completions.filter((c) => c.status === "done").length;
  const needsCount = completions.filter((c) => c.status === "needs_work").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = players.filter((p) => {
      const name = (p.full_name || "").trim().toLowerCase();
      if (!q) return false;
      return name.includes(q);
    });
    return list.slice(0, 12);
  }, [players, query]);

  const setStatus = async (playerId: string, status: CadetModuleStatus) => {
    const existing = byPlayer.get(playerId);
    setBusyId(playerId);
    onError(null);
    if (existing?.status === status) {
      const res = await clearCadetModuleCompletion(createClient(), {
        curriculumWeekId: moduleId,
        playerId,
      });
      setBusyId(null);
      if (res.error) {
        onError(res.error);
        return;
      }
      await onChanged();
      return;
    }
    const res = await upsertCadetModuleCompletion(createClient(), {
      curriculumWeekId: moduleId,
      playerId,
      status,
    });
    setBusyId(null);
    if (res.error) {
      onError(res.error);
      return;
    }
    await onChanged();
  };

  const sortedMarked = useMemo(() => {
    return [...completions].sort((a, b) => {
      const an = (a.player_name || "").toLowerCase();
      const bn = (b.player_name || "").toLowerCase();
      return an.localeCompare(bn);
    });
  }, [completions]);

  return (
    <div className="mt-2 border-t border-stone-200/80 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/80"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <UserCheck className="h-3.5 w-3.5 text-[#014421]" aria-hidden />
          Students
        </span>
        <span className="text-[11px] font-semibold text-stone-400">
          {completions.length
            ? `${doneCount} done · ${needsCount} needs work`
            : open
              ? "Hide"
              : "Search & tick off"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!available ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              {CADET_COMPLETIONS_MIGRATION_HINT}
            </p>
          ) : (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search student name…"
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-xs text-stone-900 outline-none focus:border-[#014421]"
                  autoFocus
                />
              </div>

              {query.trim() ? (
                filtered.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-stone-500">No students match.</p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-y-auto">
                    {filtered.map((p) => {
                      const name = p.full_name?.trim() || "Unnamed";
                      const current = byPlayer.get(p.id);
                      const busy = busyId === p.id;
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-stone-200"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
                            {name}
                          </span>
                          <StatusButtons
                            current={current?.status ?? null}
                            busy={busy}
                            onPick={(s) => void setStatus(p.id, s)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <p className="text-[11px] text-stone-400">Type a name to find a student.</p>
              )}

              {sortedMarked.length > 0 ? (
                <div className="rounded-lg bg-white/70 px-2 py-2 ring-1 ring-stone-200">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Marked · {sortedMarked.length}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {sortedMarked.map((c) => {
                      const name =
                        c.player_name?.trim() ||
                        players.find((p) => p.id === c.player_id)?.full_name?.trim() ||
                        "Unnamed";
                      const busy = busyId === c.player_id;
                      return (
                        <li key={c.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700">
                            {name}
                          </span>
                          <StatusButtons
                            current={c.status}
                            busy={busy}
                            onPick={(s) => void setStatus(c.player_id, s)}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setStatus(c.player_id, c.status)}
                            className="rounded p-1 text-stone-300 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Clear ${name}`}
                            title="Clear"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusButtons({
  current,
  busy,
  onPick,
}: {
  current: CadetModuleStatus | null;
  busy: boolean;
  onPick: (status: CadetModuleStatus) => void;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick("done")}
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold transition disabled:opacity-50 ${
          current === "done"
            ? "bg-[#014421] text-white"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        {busy && current === "done" ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Check className="h-3 w-3" aria-hidden />
        )}
        Done
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick("needs_work")}
        className={`rounded-md px-1.5 py-1 text-[10px] font-bold transition disabled:opacity-50 ${
          current === "needs_work"
            ? "bg-amber-600 text-white"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        Needs work
      </button>
    </span>
  );
}

function ModuleVideoButton({
  videoId,
  storedTitle,
  playing,
  onToggle,
}: {
  videoId: string;
  storedTitle: string | null;
  playing: boolean;
  onToggle: () => void;
}) {
  const { metadata } = useBunnyVideoMetadata(storedTitle ? null : videoId);
  const title = (storedTitle || metadata?.title || "").trim() || "Video";

  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 flex w-full items-center gap-2 overflow-hidden rounded-xl bg-stone-900 text-left"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildBunnyThumbnailUrl(videoId) || undefined}
        alt=""
        className="h-14 w-10 shrink-0 object-cover"
      />
      <span className="min-w-0 flex-1 py-2 pr-2">
        <span className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-white">
          <Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
          <span className="min-w-0 line-clamp-2">{title}</span>
        </span>
        <span className="mt-0.5 block text-[10px] font-medium text-white/50">
          {playing ? "Hide video" : "Tap to play"}
        </span>
      </span>
    </button>
  );
}

type BunnyLibraryItem = {
  guid: string;
  title: string;
  length: number;
  dateUploaded: string | null;
};

function formatLength(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function BunnyVideoPicker({
  bunnyLink,
  setBunnyLink,
  bunnyTitle,
  setBunnyTitle,
  resolvedPreview,
  busy,
  uploadPct,
  onPickUpload,
  fieldClass,
}: {
  bunnyLink: string;
  setBunnyLink: (v: string) => void;
  bunnyTitle: string;
  setBunnyTitle: (v: string) => void;
  resolvedPreview: string | null;
  busy: boolean;
  uploadPct: number | null;
  onPickUpload: () => void;
  fieldClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BunnyLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ limit: "60", purpose: "cadet" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/bunny/videos?${params}`, {
        headers: await authJsonHeaders(),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        items?: BunnyLibraryItem[];
        error?: string;
      };
      if (!res.ok) {
        setItems([]);
        setListError(body.error || `Couldn't load Bunny library (${res.status}).`);
        return;
      }
      setItems(body.items || []);
    } catch (e) {
      setItems([]);
      setListError(e instanceof Error ? e.message : "Couldn't load Bunny library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void load(query);
    }, query.trim() ? 280 : 0);
    return () => window.clearTimeout(t);
  }, [open, query, load]);

  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold text-stone-700">Bunny video (optional)</p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
        Pick by title from your Bunny library, paste an ID / URL, or upload a new file.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-60"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        {open ? "Hide library" : "Browse Bunny by title"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles…"
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-xs text-stone-900 outline-none focus:border-[#014421]"
              disabled={busy}
            />
          </div>
          {listError && <p className="px-1 text-[11px] font-medium text-amber-800">{listError}</p>}
          {loading ? (
            <p className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-stone-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading titles…
            </p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-stone-500">
              {query.trim() ? "No videos match that search." : "No videos found in the library."}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {items.map((item) => {
                const selected = resolvedPreview === item.guid;
                const len = formatLength(item.length);
                return (
                  <li key={item.guid}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setBunnyLink(item.guid);
                        setBunnyTitle(item.title);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ${
                        selected
                          ? "bg-[#014421] text-white"
                          : "bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      <Video
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? "text-white/80" : "text-[#014421]"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-snug">{item.title}</span>
                        <span
                          className={`mt-0.5 block text-[10px] ${selected ? "text-white/60" : "text-stone-400"}`}
                        >
                          {[len, item.guid.slice(0, 8)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <label className="mt-2 block text-[11px] font-medium text-stone-500">
        Video ID or URL
        <input
          value={bunnyLink}
          onChange={(e) => {
            setBunnyLink(e.target.value);
            setBunnyTitle("");
          }}
          placeholder="uuid or https://iframe.mediadelivery.net/embed/…"
          className={`${fieldClass} mt-1 font-mono text-xs`}
          disabled={busy}
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onPickUpload}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-60"
        >
          <Video className="h-3.5 w-3.5" aria-hidden />
          {uploadPct != null ? `Uploading ${uploadPct}%` : "Upload to Bunny"}
        </button>
        {bunnyLink.trim() ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBunnyLink("");
              setBunnyTitle("");
            }}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-stone-500 hover:text-red-600"
          >
            Clear video
          </button>
        ) : null}
      </div>
      {resolvedPreview ? (
        <p className="mt-1.5 truncate text-[10px] text-[#014421]">
          Linked
          {bunnyTitle.trim() ? ` · ${bunnyTitle.trim()}` : ` · ${resolvedPreview}`}
        </p>
      ) : bunnyLink.trim() ? (
        <p className="mt-1.5 text-[10px] font-medium text-amber-700">Not a recognised Bunny id / URL yet</p>
      ) : null}
    </div>
  );
}

function DrillListPicker({
  selected,
  onChange,
  busy,
}: {
  selected: CadetDrillRef[];
  onChange: (next: CadetDrillRef[]) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CadetDrillRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || catalog.length > 0) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setListError(null);
      const res = await fetchCadetDrillCatalog(createClient());
      if (cancelled) return;
      setCatalog(res.items);
      if (res.error && res.items.length === 0) setListError(res.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, catalog.length]);

  const selectedIds = useMemo(() => new Set(selected.map((d) => d.id)), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 80);
    return catalog
      .filter((d) => `${d.title} ${d.category} ${d.drill_id}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [catalog, query]);

  const toggle = (drill: CadetDrillRef) => {
    if (selectedIds.has(drill.id)) {
      onChange(selected.filter((d) => d.id !== drill.id));
      return;
    }
    onChange([...selected, drill]);
  };

  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold text-stone-700">Drills (optional)</p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
        Add drills from the Drill Library for this week&apos;s module.
      </p>

      {selected.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {selected.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 ring-1 ring-stone-200"
            >
              <Target className="h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">{d.title}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange(selected.filter((x) => x.id !== d.id))}
                className="rounded p-1 text-stone-400 hover:text-red-600"
                aria-label={`Remove ${d.title}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-60"
      >
        <Target className="h-3.5 w-3.5" aria-hidden />
        {open ? "Hide drill list" : "Browse drills"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drills…"
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-xs text-stone-900 outline-none focus:border-[#014421]"
              disabled={busy}
            />
          </div>
          {listError && <p className="px-1 text-[11px] font-medium text-amber-800">{listError}</p>}
          {loading ? (
            <p className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-stone-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading drills…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-stone-500">
              {query.trim() ? "No drills match that search." : "No drills found."}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {filtered.map((drill) => {
                const on = selectedIds.has(drill.id);
                return (
                  <li key={drill.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(drill)}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ${
                        on
                          ? "bg-[#014421] text-white"
                          : "bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      <Target
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${on ? "text-white/80" : "text-[#014421]"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-snug">{drill.title}</span>
                        <span className={`mt-0.5 block text-[10px] ${on ? "text-white/60" : "text-stone-400"}`}>
                          {[drill.category, drill.drill_id].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className={`text-[10px] font-bold ${on ? "text-white/80" : "text-stone-400"}`}>
                        {on ? "Added" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleForm({
  mode,
  defaultWeek,
  defaultSubject = "",
  defaultNotes = "",
  defaultBunnyVideoId = "",
  defaultBunnyVideoTitle = "",
  defaultDrillRefs = [],
  defaultIsTest = false,
  defaultTestStandard = "",
  defaultTestMaxScore = null,
  defaultTestPassMark = null,
  defaultTestGradeMarks = null,
  defaultTestScoreType = "makes",
  defaultTestSkillId = "",
  defaultGatesHoleGroup = null,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  defaultWeek: number;
  defaultSubject?: string;
  defaultNotes?: string;
  defaultBunnyVideoId?: string;
  defaultBunnyVideoTitle?: string;
  defaultDrillRefs?: CadetDrillRef[];
  defaultIsTest?: boolean;
  defaultTestStandard?: string;
  defaultTestMaxScore?: number | null;
  defaultTestPassMark?: number | null;
  defaultTestGradeMarks?: CadetTestGradeMark[] | null;
  defaultTestScoreType?: CadetTestScoreType | null;
  defaultTestSkillId?: string;
  defaultGatesHoleGroup?: CadetHoleGroup | null;
  onCancel: () => void;
  onSubmit: (values: {
    weekNumber: number;
    subject: string;
    moduleNotes: string;
    bunnyVideoId: string | null;
    bunnyVideoTitle: string | null;
    drillRefs: CadetDrillRef[];
    isTest: boolean;
    testStandard: string | null;
    testMaxScore: number | null;
    testPassMark: number | null;
    testGradeMarks: CadetTestGradeMark[] | null;
    testScoreType: CadetTestScoreType | null;
    testSkillId: string | null;
    gatesHoleGroup: CadetHoleGroup | null;
  }) => Promise<string | null>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const skillOptions = useMemo(() => listCadetSkillOptions(), []);
  const [weekNumber, setWeekNumber] = useState(String(defaultWeek));
  const [subject, setSubject] = useState(defaultSubject);
  const [moduleNotes, setModuleNotes] = useState(defaultNotes);
  const [bunnyLink, setBunnyLink] = useState(defaultBunnyVideoId);
  const [bunnyTitle, setBunnyTitle] = useState(defaultBunnyVideoTitle);
  const [drillRefs, setDrillRefs] = useState<CadetDrillRef[]>(defaultDrillRefs);
  const [isTest, setIsTest] = useState(defaultIsTest);
  const [testStandard, setTestStandard] = useState(defaultTestStandard);
  const [testScoreType, setTestScoreType] = useState<CadetTestScoreType>(
    defaultTestScoreType || "makes",
  );
  const [testMaxScore, setTestMaxScore] = useState(
    defaultTestMaxScore != null ? String(defaultTestMaxScore) : "",
  );
  const [testGradeMarks, setTestGradeMarks] = useState<CadetTestGradeMark[]>(
    defaultTestGradeMarks?.length
      ? defaultTestGradeMarks
      : defaultCadetTestGradeMarks(defaultTestMaxScore, defaultTestScoreType || "makes"),
  );
  const [testSkillId, setTestSkillId] = useState(defaultTestSkillId);
  const [gatesHoleGroup, setGatesHoleGroup] = useState<string>(
    defaultGatesHoleGroup != null ? String(defaultGatesHoleGroup) : "",
  );
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolvedPreview = resolveCadetBunnyVideoId(bunnyLink);

  const field =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]";

  const uploadFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setUploadPct(0);
    try {
      const title = subject.trim() || file.name.replace(/\.[^.]+$/, "") || "Cadet module";
      const displayTitle = `Cadet · ${title}`;
      const { videoId } = await uploadCoachingVideo(file, {
        title: displayTitle,
        kind: "cadet",
        onProgress: (p) => setUploadPct(p),
      });
      setBunnyLink(videoId);
      setBunnyTitle(displayTitle);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  return (
    <div
      className={`space-y-2 px-4 py-3 ${mode === "create" ? "border-b border-stone-100 bg-stone-50/80" : "rounded-xl border border-[#014421]/20 bg-white"}`}
    >
      <p className="text-xs font-semibold text-stone-700">
        {mode === "create" ? "New module" : "Edit module"}
      </p>
      <div className="grid grid-cols-[88px_1fr] gap-2">
        <label className="block text-[11px] font-medium text-stone-500">
          Week
          <input
            type="number"
            min={1}
            max={20}
            value={weekNumber}
            onChange={(e) => setWeekNumber(e.target.value)}
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
        <label className="block text-[11px] font-medium text-stone-500">
          Subject / module
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Putting start line"
            maxLength={120}
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
      </div>
      <label className="block text-[11px] font-medium text-stone-500">
        Learning notes (optional)
        <textarea
          value={moduleNotes}
          onChange={(e) => setModuleNotes(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Outcomes, drills, combine to run, coaching cues…"
          className={`${field} mt-1 resize-y`}
          disabled={busy}
        />
      </label>

      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(e) => setIsTest(e.target.checked)}
            disabled={busy}
            className="rounded border-stone-300 text-[#014421] focus:ring-[#014421]"
          />
          <span className="text-[11px] font-semibold text-stone-700">This module has a test</span>
        </label>
        {isTest ? (
          <div className="mt-2 space-y-2">
            <label className="block text-[11px] font-medium text-stone-500">
              Grading guidelines
              <input
                value={testStandard}
                onChange={(e) => setTestStandard(e.target.value)}
                placeholder="e.g. Make 6/8 from 3–6 ft, start line solid"
                maxLength={400}
                className={`${field} mt-1`}
                disabled={busy}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-medium text-stone-500">
                Scoring
                <select
                  value={testScoreType}
                  onChange={(e) => {
                    const next = e.target.value as CadetTestScoreType;
                    setTestScoreType(next);
                    if (next !== "completion") {
                      const maxN = testMaxScore.trim() === "" ? 10 : Number(testMaxScore);
                      setTestGradeMarks(
                        defaultCadetTestGradeMarks(Number.isFinite(maxN) ? maxN : 10, next),
                      );
                    }
                  }}
                  className={`${field} mt-1`}
                  disabled={busy}
                >
                  {CADET_TEST_SCORE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {cadetTestScoreTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              {testScoreType !== "completion" ? (
                <label className="block text-[11px] font-medium text-stone-500">
                  {testScoreType === "makes" ? "Out of" : "Max (optional)"}
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={testMaxScore}
                    onChange={(e) => {
                      setTestMaxScore(e.target.value);
                      const maxN = e.target.value.trim() === "" ? 10 : Number(e.target.value);
                      setTestGradeMarks(
                        defaultCadetTestGradeMarks(
                          Number.isFinite(maxN) ? maxN : 10,
                          testScoreType,
                        ),
                      );
                    }}
                    placeholder="e.g. 8"
                    className={`${field} mt-1`}
                    disabled={busy}
                  />
                </label>
              ) : (
                <div />
              )}
            </div>
            {testScoreType !== "completion" ? (
              <CadetGradeMarksEditor
                bands={testGradeMarks}
                onChange={setTestGradeMarks}
                scoreType={testScoreType}
                busy={busy}
                fieldClass={field}
              />
            ) : null}
            <label className="block text-[11px] font-medium text-stone-500">
              Gates move to
              <select
                value={gatesHoleGroup}
                onChange={(e) => setGatesHoleGroup(e.target.value)}
                className={`${field} mt-1`}
                disabled={busy}
              >
                <option value="">Any / current</option>
                {CADET_HOLE_GROUPS.filter((g) => g !== 3).map((g) => (
                  <option key={g} value={g}>
                    {cadetHoleGroupLabel(g)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-medium text-stone-500">
              Linked skill (optional)
              <select
                value={testSkillId}
                onChange={(e) => setTestSkillId(e.target.value)}
                className={`${field} mt-1`}
                disabled={busy}
              >
                <option value="">None</option>
                {skillOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.domainLabel} · {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <DrillListPicker selected={drillRefs} onChange={setDrillRefs} busy={busy} />

      <BunnyVideoPicker
        bunnyLink={bunnyLink}
        setBunnyLink={setBunnyLink}
        bunnyTitle={bunnyTitle}
        setBunnyTitle={setBunnyTitle}
        resolvedPreview={resolvedPreview}
        busy={busy}
        uploadPct={uploadPct}
        onPickUpload={() => fileRef.current?.click()}
        fieldClass={field}
      />
      <input
        ref={fileRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void uploadFile(f);
        }}
      />

      {err && <p className="text-xs font-medium text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              const week = Number(weekNumber);
              const videoId = bunnyLink.trim() ? bunnyLink.trim() : null;
              let title = bunnyTitle.trim() || null;
              const resolvedId = videoId ? resolveCadetBunnyVideoId(videoId) : null;
              if (resolvedId && !title) {
                title = await fetchCadetBunnyVideoTitle(resolvedId);
              }
              const gatesNum = gatesHoleGroup ? Number(gatesHoleGroup) : null;
              const maxNum =
                testScoreType === "completion" || testMaxScore.trim() === ""
                  ? null
                  : Number(testMaxScore);
              const fiveHole = testGradeMarks.find((b) => b.id === "5");
              const message = await onSubmit({
                weekNumber: week,
                subject,
                moduleNotes,
                bunnyVideoId: videoId,
                bunnyVideoTitle: title,
                drillRefs,
                isTest,
                testStandard: isTest ? testStandard.trim() || null : null,
                testMaxScore: isTest ? maxNum : null,
                testPassMark: isTest ? (fiveHole?.mark ?? defaultTestPassMark) : null,
                testGradeMarks:
                  isTest && testScoreType !== "completion" ? testGradeMarks : null,
                testScoreType: isTest ? testScoreType : null,
                testSkillId: isTest ? testSkillId.trim() || null : null,
                gatesHoleGroup:
                  isTest && gatesNum != null && CADET_HOLE_GROUPS.includes(gatesNum as CadetHoleGroup)
                    ? (gatesNum as CadetHoleGroup)
                    : null,
              });
              setBusy(false);
              if (message) setErr(message);
            })();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {mode === "create" ? "Add to plan" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-xl px-3 py-2.5 text-xs font-semibold text-stone-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
