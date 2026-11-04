import type { SupabaseClient } from "@supabase/supabase-js";
import { bunnyVideoIdFromLink } from "@/lib/bunnyStream";
import {
  CADET_HOLE_GROUPS,
  cadetHoleGroupLabel,
  isCadetHoleGroup,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";

export const CADET_TERMS = [1, 2, 3] as const;
export type CadetTerm = (typeof CADET_TERMS)[number];

/** Snapshot of a Drill Library item attached to a curriculum module. */
export type CadetDrillRef = {
  id: string;
  drill_id: string;
  title: string;
  category: string;
};

export type CadetCurriculumWeek = {
  id: string;
  program_year: number;
  term: CadetTerm;
  week_number: number;
  subject: string;
  module_notes: string | null;
  bunny_video_id: string | null;
  bunny_video_title: string | null;
  drill_refs: CadetDrillRef[];
  is_test: boolean;
  test_standard: string | null;
  test_max_score: number | null;
  /** Numeric pass threshold for auto-grading attempts. */
  test_pass_mark: number | null;
  /** 3/5/7/10-hole marks for skill ranking. */
  test_grade_marks: CadetTestGradeMark[];
  test_score_type: CadetTestScoreType | null;
  test_skill_id: string | null;
  gates_hole_group: CadetHoleGroup | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Coach scoring style for a module test (mirrors drill scoring ideas). */
export const CADET_TEST_SCORE_TYPES = ["makes", "count", "streak", "strokes", "completion"] as const;
export type CadetTestScoreType = (typeof CADET_TEST_SCORE_TYPES)[number];

export function isCadetTestScoreType(v: string): v is CadetTestScoreType {
  return (CADET_TEST_SCORE_TYPES as readonly string[]).includes(v);
}

export function cadetTestScoreTypeLabel(t: CadetTestScoreType | null | undefined): string {
  switch (t) {
    case "makes":
      return "Out of";
    case "count":
      return "Count";
    case "streak":
      return "Streak";
    case "strokes":
      return "Lower is better";
    case "completion":
      return "Just done";
    default:
      return "Score";
  }
}

export const CADET_MODULE_STATUSES = ["done", "needs_work"] as const;
export type CadetModuleStatus = (typeof CADET_MODULE_STATUSES)[number];

export const CADET_TEST_OUTCOMES = ["pass", "needs_practice"] as const;
export type CadetTestOutcome = (typeof CADET_TEST_OUTCOMES)[number];

/** Cadet skill grades — pathway hole groups. */
export const CADET_TEST_GRADE_IDS = ["3", "5", "7", "10"] as const;
export type CadetTestGradeId = (typeof CADET_TEST_GRADE_IDS)[number];

/** Map older colour-belt ids if any rows still carry them. */
const LEGACY_CADET_TEST_GRADE_IDS: Record<string, CadetTestGradeId> = {
  white: "3",
  yellow: "5",
  blue: "7",
  red: "10",
};

export type CadetTestGradeMark = {
  id: CadetTestGradeId;
  label: string;
  /** Threshold to earn this grade. */
  mark: number;
};

export function isCadetTestGradeId(v: string): v is CadetTestGradeId {
  return (CADET_TEST_GRADE_IDS as readonly string[]).includes(v);
}

export function normalizeCadetTestGradeId(raw: string | null | undefined): CadetTestGradeId | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  if (isCadetTestGradeId(key)) return key;
  return LEGACY_CADET_TEST_GRADE_IDS[key] ?? null;
}

export function cadetTestGradeLabel(id: CadetTestGradeId | null | undefined): string {
  if (!id) return "—";
  const n = Number(id);
  if (n === 3 || n === 5 || n === 7 || n === 10) return cadetHoleGroupLabel(n);
  return "—";
}

export function cadetTestGradeRank(id: CadetTestGradeId | null | undefined): number {
  if (!id) return 0;
  const i = CADET_TEST_GRADE_IDS.indexOf(id);
  return i < 0 ? 0 : i + 1;
}

/** Sensible starting marks from max score / scoring type. */
export function defaultCadetTestGradeMarks(
  maxScore?: number | null,
  scoreType?: CadetTestScoreType | null,
): CadetTestGradeMark[] {
  const max = maxScore != null && maxScore > 0 ? maxScore : 10;
  if (scoreType === "strokes") {
    // Lower is better — mark is a ceiling for that grade.
    const ceilings = [
      Math.max(1, Math.ceil(max * 0.85)),
      Math.max(1, Math.ceil(max * 0.65)),
      Math.max(1, Math.ceil(max * 0.45)),
      Math.max(1, Math.ceil(max * 0.3)),
    ];
    return CADET_TEST_GRADE_IDS.map((id, i) => ({
      id,
      label: cadetTestGradeLabel(id),
      mark: ceilings[i]!,
    }));
  }
  const floors = [
    Math.max(0, Math.floor(max * 0.4)),
    Math.max(0, Math.floor(max * 0.6)),
    Math.max(0, Math.floor(max * 0.8)),
    Math.max(0, Math.floor(max * 0.9)),
  ];
  return CADET_TEST_GRADE_IDS.map((id, i) => ({
    id,
    label: cadetTestGradeLabel(id),
    mark: floors[i]!,
  }));
}

export function parseCadetTestGradeMarks(raw: unknown): CadetTestGradeMark[] {
  if (!Array.isArray(raw)) return [];
  const out: CadetTestGradeMark[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = normalizeCadetTestGradeId(String(r.id || ""));
    if (!id) continue;
    const mark = Number(r.mark);
    if (!Number.isFinite(mark) || mark < 0 || mark > 500) continue;
    out.push({
      id,
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : cadetTestGradeLabel(id),
      mark,
    });
  }
  // Keep canonical order 3 → 5 → 7 → 10.
  out.sort((a, b) => cadetTestGradeRank(a.id) - cadetTestGradeRank(b.id));
  return out;
}

export function normalizeCadetTestGradeMarks(
  bands: CadetTestGradeMark[] | null | undefined,
  scoreType?: CadetTestScoreType | null,
): CadetTestGradeMark[] | { error: string } {
  if (!bands?.length) return [];
  const parsed = parseCadetTestGradeMarks(bands);
  if (parsed.length === 0) return { error: "Add at least one grade mark." };
  if (parsed.length !== CADET_TEST_GRADE_IDS.length) {
    return { error: "Set marks for 3, 5, 7, and 10-hole." };
  }
  // Higher-is-better: marks must non-decrease 3→10.
  // Strokes: marks must non-increase 3→10 (tighter ceilings).
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1]!.mark;
    const cur = parsed[i]!.mark;
    if (scoreType === "strokes") {
      if (cur > prev) {
        return { error: "For lower-is-better, better grades need equal or lower marks." };
      }
    } else if (cur < prev) {
      return { error: "Grade marks must go up 3 → 5 → 7 → 10-hole." };
    }
  }
  return parsed.map((b) => ({ ...b, label: cadetTestGradeLabel(b.id) }));
}

/**
 * Rank a score into 3/5/7/10-hole from the test's marks.
 * Below 3-hole → null grade.
 */
export function rankCadetTestGrade(
  score: number,
  opts: {
    scoreType?: CadetTestScoreType | null;
    bands?: CadetTestGradeMark[] | null;
  },
): CadetTestGradeId | null {
  const bands = opts.bands?.length ? parseCadetTestGradeMarks(opts.bands) : [];
  if (!bands.length || !Number.isFinite(score) || score < 0) return null;
  const type = opts.scoreType || "makes";
  if (type === "completion") return "5";

  if (type === "strokes") {
    // Highest grade (10-hole) whose ceiling is still >= score.
    let best: CadetTestGradeId | null = null;
    for (const b of bands) {
      if (score <= b.mark) best = b.id;
    }
    return best;
  }

  // Higher is better — highest band where score meets the floor.
  let best: CadetTestGradeId | null = null;
  for (const b of bands) {
    if (score >= b.mark) best = b.id;
  }
  return best;
}

/** 5-hole+ counts as Pass for pathway when no separate pass mark is set. */
export function outcomeFromCadetTestGrade(grade: CadetTestGradeId | null): CadetTestOutcome {
  return cadetTestGradeRank(grade) >= cadetTestGradeRank("5") ? "pass" : "needs_practice";
}

export type CadetModuleCompletion = {
  id: string;
  curriculum_week_id: string;
  player_id: string;
  status: CadetModuleStatus;
  notes: string | null;
  updated_at: string;
  created_at: string;
  player_name?: string | null;
};

export type CadetModuleTestResult = {
  id: string;
  curriculum_week_id: string;
  player_id: string;
  program_year: number;
  term: CadetTerm;
  score: number;
  max_score: number | null;
  /** Tries / balls within this logged attempt (optional). */
  attempts: number | null;
  /** 3 / 5 / 7 / 10-hole from grade marks. */
  grade: CadetTestGradeId | null;
  outcome: CadetTestOutcome;
  notes: string | null;
  updated_at: string;
  created_at: string;
  player_name?: string | null;
};

export type CadetMoveUpGap = {
  kind: "module" | "test" | "on_course" | "scorecard";
  moduleId: string;
  subject: string;
  detail: string;
};

export type CadetMoveUpReadiness = {
  currentGroup: CadetHoleGroup | null;
  nextGroup: CadetHoleGroup | null;
  /** Next pathway step — hole group or Junior Member. */
  nextStep: CadetHoleGroup | "junior_member" | null;
  ready: boolean;
  atTop: boolean;
  isJuniorMember: boolean;
  modulesDone: number;
  modulesTotal: number;
  testsPassed: number;
  testsTotal: number;
  gaps: CadetMoveUpGap[];
  /** Curriculum modules + skill tests only (ignores on-course). */
  skillsReady: boolean;
  onCourseReady: boolean;
};

export type CadetLevelUpRecommendation = {
  id: string;
  source: "level_up" | "on_course" | "skill_test" | "module" | "scorecard";
  tone: "go" | "practise" | "info";
  title: string;
  detail: string;
};

export const CADET_CURRICULUM_MIGRATION_HINT =
  "Cadet year plan needs a database update. Run the cadet curriculum SQL migrations in Supabase (weeks, bunny_video, drill_refs), then reload.";

export const CADET_COMPLETIONS_MIGRATION_HINT =
  "Module tick-off needs a database update. Run supabase/migrations/20261104100000_cadet_module_completions.sql in Supabase, then reload.";

export const CADET_TESTS_MIGRATION_HINT =
  "Module tests need a database update. Run supabase/migrations/20261104120000_cadet_module_tests.sql (and 20261104170000_cadet_test_attempts_scoring.sql for attempts) in Supabase, then reload.";

function isMissingRelation(message: string): boolean {
  return /cadet_curriculum_weeks|bunny_video_id|bunny_video_title|drill_refs|cadet_module_completions|cadet_module_test_results|is_test|test_standard|test_pass_mark|test_grade_marks|test_score_type|gates_hole_group|schema cache|does not exist/i.test(
    message,
  );
}

export function normalizeCadetBunnyTitle(raw: string | null | undefined): string | null {
  const title = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!title) return null;
  return title.slice(0, 200);
}

/** Resolve a Bunny title for storage when the coach didn't pick one from the library. */
export async function fetchCadetBunnyVideoTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/bunny/video?videoId=${encodeURIComponent(videoId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { title?: string };
    return normalizeCadetBunnyTitle(body.title);
  } catch {
    return null;
  }
}

export function cadetModuleStatusLabel(status: CadetModuleStatus): string {
  return status === "done" ? "Done" : "Needs work";
}

export function isCadetModuleStatus(v: string): v is CadetModuleStatus {
  return (CADET_MODULE_STATUSES as readonly string[]).includes(v);
}

export function isCadetTestOutcome(v: string): v is CadetTestOutcome {
  return (CADET_TEST_OUTCOMES as readonly string[]).includes(v);
}

export function cadetTestOutcomeLabel(outcome: CadetTestOutcome): string {
  return outcome === "pass" ? "Pass" : "Needs practice";
}

export function formatCadetTestScore(
  score: number,
  maxScore: number | null | undefined,
  attempts?: number | null,
): string {
  let base: string;
  if (maxScore != null && maxScore > 0) {
    const s = Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, "");
    base = `${s}/${maxScore}`;
  } else {
    base = Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, "");
  }
  if (attempts != null && attempts > 0) return `${base} · ${attempts} att`;
  return base;
}

function formatCadetMarkNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Short label for the configured pass mark, e.g. "Pass ≥6/8" or "Pass ≤3". */
export function formatCadetTestPassMark(
  scoreType: CadetTestScoreType | null | undefined,
  passMark: number | null | undefined,
  maxScore?: number | null,
): string | null {
  if (passMark == null || !Number.isFinite(passMark)) return null;
  const mark = formatCadetMarkNumber(passMark);
  const type = scoreType || "makes";
  if (type === "completion") return "Pass when completed";
  if (type === "strokes") {
    return maxScore != null && maxScore > 0 ? `Pass ≤${mark}/${maxScore}` : `Pass ≤${mark}`;
  }
  if (type === "makes" && maxScore != null && maxScore > 0) {
    return `Pass ≥${mark}/${maxScore}`;
  }
  return `Pass ≥${mark}`;
}

/**
 * Suggest Pass / Needs practice from pass mark and/or grade bands.
 * Returns null when neither is set (coach must grade manually), except completion → pass.
 */
export function suggestCadetTestOutcome(
  score: number,
  opts: {
    scoreType?: CadetTestScoreType | null;
    passMark?: number | null;
    gradeMarks?: CadetTestGradeMark[] | null;
  },
): CadetTestOutcome | null {
  const type = opts.scoreType || "makes";
  if (type === "completion") return "pass";
  if (!Number.isFinite(score) || score < 0) return null;

  const mark = opts.passMark;
  if (mark != null && Number.isFinite(mark)) {
    if (type === "strokes") return score <= mark ? "pass" : "needs_practice";
    return score >= mark ? "pass" : "needs_practice";
  }

  const bands = opts.gradeMarks?.length ? parseCadetTestGradeMarks(opts.gradeMarks) : [];
  if (bands.length) {
    return outcomeFromCadetTestGrade(rankCadetTestGrade(score, { scoreType: type, bands }));
  }
  return null;
}

/** One-line summary of grade marks, e.g. "3≥4 5≥6 7≥8 10≥9". */
export function formatCadetTestGradeMarksSummary(
  bands: CadetTestGradeMark[] | null | undefined,
  scoreType?: CadetTestScoreType | null,
): string | null {
  const parsed = bands?.length ? parseCadetTestGradeMarks(bands) : [];
  if (!parsed.length) return null;
  const op = scoreType === "strokes" ? "≤" : "≥";
  return parsed.map((b) => `${b.id}${op}${formatCadetMarkNumber(b.mark)}`).join(" ");
}

/** Next hole group on 3 → 5 → 7 → 10, or null at 10-hole. */
export function nextCadetHoleGroup(current: CadetHoleGroup): CadetHoleGroup | null {
  const idx = CADET_HOLE_GROUPS.indexOf(current);
  if (idx < 0 || idx >= CADET_HOLE_GROUPS.length - 1) return null;
  return CADET_HOLE_GROUPS[idx + 1]!;
}

/** Next pathway step including Junior Member above 10-hole. */
export function nextCadetProgressionStep(
  current: CadetHoleGroup | null,
  isJuniorMember: boolean,
): CadetHoleGroup | "junior_member" | null {
  if (isJuniorMember || current == null) return null;
  const nextHole = nextCadetHoleGroup(current);
  if (nextHole) return nextHole;
  if (current === 10) return "junior_member";
  return null;
}

export function cadetProgressionStepLabel(step: CadetHoleGroup | "junior_member"): string {
  return step === "junior_member" ? "Junior Member" : cadetHoleGroupLabel(step);
}

export function isCadetTerm(n: number): n is CadetTerm {
  return (CADET_TERMS as readonly number[]).includes(n);
}

export type CadetModuleTestFields = {
  isTest: boolean;
  testStandard?: string | null;
  testMaxScore?: number | null;
  testPassMark?: number | null;
  testGradeMarks?: CadetTestGradeMark[] | null;
  testScoreType?: CadetTestScoreType | null;
  testSkillId?: string | null;
  gatesHoleGroup?: CadetHoleGroup | null;
};

function normalizeTestFields(input: CadetModuleTestFields): {
  is_test: boolean;
  test_standard: string | null;
  test_max_score: number | null;
  test_pass_mark: number | null;
  test_grade_marks: CadetTestGradeMark[] | null;
  test_score_type: CadetTestScoreType | null;
  test_skill_id: string | null;
  gates_hole_group: CadetHoleGroup | null;
} | { error: string } {
  if (!input.isTest) {
    return {
      is_test: false,
      test_standard: null,
      test_max_score: null,
      test_pass_mark: null,
      test_grade_marks: null,
      test_score_type: null,
      test_skill_id: null,
      gates_hole_group: null,
    };
  }
  const standard = String(input.testStandard ?? "").trim();
  if (!standard) return { error: "Add grading guidelines for the test." };
  if (standard.length > 400) return { error: "Grading guidelines are too long." };

  let max: number | null = null;
  if (input.testMaxScore != null && String(input.testMaxScore).trim() !== "") {
    max = Number(input.testMaxScore);
    if (!Number.isFinite(max) || max < 1 || max > 200) {
      return { error: "Max score must be 1–200." };
    }
  }

  let scoreType: CadetTestScoreType | null = input.testScoreType ?? "makes";
  if (scoreType && !isCadetTestScoreType(scoreType)) {
    return { error: "Pick a valid scoring type." };
  }
  if (scoreType === "makes" && max == null) {
    return { error: "Out-of scoring needs a max score (e.g. 10)." };
  }
  if (scoreType === "completion") {
    max = null;
  }

  let passMark: number | null = null;
  if (scoreType !== "completion" && input.testPassMark != null && String(input.testPassMark).trim() !== "") {
    passMark = Number(input.testPassMark);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 500) {
      return { error: "Pass mark must be 0–500." };
    }
    if (max != null && scoreType !== "strokes" && passMark > max) {
      return { error: "Pass mark can’t be higher than the max score." };
    }
  }

  let gradeMarks: CadetTestGradeMark[] | null = null;
  if (scoreType !== "completion") {
    const rawBands =
      input.testGradeMarks != null && input.testGradeMarks.length > 0
        ? input.testGradeMarks
        : defaultCadetTestGradeMarks(max, scoreType);
    const normalized = normalizeCadetTestGradeMarks(rawBands, scoreType);
    if ("error" in normalized) return { error: normalized.error };
    gradeMarks = normalized.length ? normalized : null;
    // Default pathway pass mark to 5-hole band if coach didn't set one.
    if (passMark == null && gradeMarks) {
      const fiveHole = gradeMarks.find((b) => b.id === "5");
      if (fiveHole) passMark = fiveHole.mark;
    }
  }

  const skillId = String(input.testSkillId ?? "").trim() || null;
  let gates: CadetHoleGroup | null = null;
  if (input.gatesHoleGroup != null) {
    if (!isCadetHoleGroup(input.gatesHoleGroup)) {
      return { error: "Gates hole group must be 3, 5, 7, or 10." };
    }
    gates = input.gatesHoleGroup;
  }

  return {
    is_test: true,
    test_standard: standard,
    test_max_score: max,
    test_pass_mark: passMark,
    test_grade_marks: gradeMarks,
    test_score_type: scoreType,
    test_skill_id: skillId,
    gates_hole_group: gates,
  };
}

/** Normalize a pasted Bunny id / embed URL for storage. */
export function resolveCadetBunnyVideoId(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  return bunnyVideoIdFromLink(trimmed);
}

export function parseCadetDrillRefs(raw: unknown): CadetDrillRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CadetDrillRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const drillId = String(r.drill_id || id).trim();
    const title = String(r.title || "").trim();
    if (!id || !title) continue;
    out.push({
      id,
      drill_id: drillId || id,
      title,
      category: String(r.category || "").trim() || "Drill",
    });
  }
  return out;
}

export function cadetDrillLibraryHref(ref: CadetDrillRef): string {
  const key = encodeURIComponent(ref.drill_id || ref.id);
  return `/practice?plan=library&drill=${key}`;
}

/** Coach Curriculum tab deep-link for a student's progress profile. */
export function cadetCurriculumProfileHref(playerId: string, opts?: { year?: number; term?: CadetTerm }): string {
  const params = new URLSearchParams({ tab: "curriculum", player: playerId });
  if (opts?.year != null) params.set("year", String(opts.year));
  if (opts?.term != null) params.set("term", String(opts.term));
  return `/dashboard/coach/cadet?${params.toString()}`;
}

/** Rough 3-term academy calendar (Australia/Sydney feel) for a given year. */
export function cadetThreeTermWindows(year: number): {
  term: CadetTerm;
  label: string;
  start: string;
  end: string;
}[] {
  return [
    { term: 1, label: "Term 1", start: `${year}-01-27`, end: `${year}-04-30` },
    { term: 2, label: "Term 2", start: `${year}-05-01`, end: `${year}-08-15` },
    { term: 3, label: "Term 3", start: `${year}-08-16`, end: `${year}-12-15` },
  ];
}

export function currentCadetProgramYear(at: Date = new Date()): number {
  return at.getFullYear();
}

export function currentCadetTerm(at: Date = new Date()): CadetTerm {
  const y = at.getFullYear();
  const iso = `${y}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  for (const w of cadetThreeTermWindows(y)) {
    if (iso >= w.start && iso <= w.end) return w.term;
  }
  const m = at.getMonth() + 1;
  if (m <= 4) return 1;
  if (m <= 8) return 2;
  return 3;
}

function mapCurriculumRow(row: Record<string, unknown>): CadetCurriculumWeek {
  const gatesRaw = row.gates_hole_group;
  const gatesNum = gatesRaw == null ? null : Number(gatesRaw);
  return {
    id: String(row.id),
    program_year: Number(row.program_year),
    term: Number(row.term) as CadetTerm,
    week_number: Number(row.week_number),
    subject: String(row.subject || ""),
    module_notes: typeof row.module_notes === "string" ? row.module_notes : null,
    bunny_video_id: typeof row.bunny_video_id === "string" ? row.bunny_video_id : null,
    bunny_video_title:
      typeof row.bunny_video_title === "string" ? row.bunny_video_title : null,
    drill_refs: parseCadetDrillRefs(row.drill_refs),
    is_test: Boolean(row.is_test),
    test_standard: typeof row.test_standard === "string" ? row.test_standard : null,
    test_max_score:
      row.test_max_score == null || row.test_max_score === ""
        ? null
        : Number(row.test_max_score),
    test_pass_mark:
      row.test_pass_mark == null || row.test_pass_mark === ""
        ? null
        : Number(row.test_pass_mark),
    test_grade_marks: parseCadetTestGradeMarks(row.test_grade_marks),
    test_score_type:
      typeof row.test_score_type === "string" && isCadetTestScoreType(row.test_score_type)
        ? row.test_score_type
        : null,
    test_skill_id: typeof row.test_skill_id === "string" ? row.test_skill_id : null,
    gates_hole_group: gatesNum != null && isCadetHoleGroup(gatesNum) ? gatesNum : null,
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

const CURRICULUM_SELECT =
  "id, program_year, term, week_number, subject, module_notes, bunny_video_id, bunny_video_title, drill_refs, is_test, test_standard, test_max_score, test_pass_mark, test_grade_marks, test_score_type, test_skill_id, gates_hole_group, sort_order, created_at, updated_at";

export async function fetchCadetCurriculum(
  client: SupabaseClient,
  opts: { year: number; term?: CadetTerm },
): Promise<{ rows: CadetCurriculumWeek[]; error: string | null; available: boolean }> {
  let q = client
    .from("cadet_curriculum_weeks")
    .select(CURRICULUM_SELECT)
    .eq("program_year", opts.year)
    .order("term", { ascending: true })
    .order("week_number", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (opts.term != null) q = q.eq("term", opts.term);

  const { data, error } = await q;

  if (error) {
    const msg = error.message || "Couldn't load the year plan.";
    if (/test_grade_marks|test_pass_mark/i.test(msg)) {
      const selectWithoutPass =
        "id, program_year, term, week_number, subject, module_notes, bunny_video_id, bunny_video_title, drill_refs, is_test, test_standard, test_max_score, test_score_type, test_skill_id, gates_hole_group, sort_order, created_at, updated_at";
      let q2 = client
        .from("cadet_curriculum_weeks")
        .select(selectWithoutPass)
        .eq("program_year", opts.year)
        .order("term", { ascending: true })
        .order("week_number", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (opts.term != null) q2 = q2.eq("term", opts.term);
      const retry = await q2;
      if (retry.error) {
        const m2 = retry.error.message || msg;
        if (isMissingRelation(m2)) {
          return { rows: [], error: CADET_CURRICULUM_MIGRATION_HINT, available: false };
        }
        return { rows: [], error: m2, available: true };
      }
      return {
        rows: ((retry.data as Record<string, unknown>[]) || []).map(mapCurriculumRow),
        error: null,
        available: true,
      };
    }
    if (isMissingRelation(msg)) {
      return { rows: [], error: CADET_CURRICULUM_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: ((data as Record<string, unknown>[]) || []).map(mapCurriculumRow),
    error: null,
    available: true,
  };
}

export async function insertCadetCurriculumWeek(
  client: SupabaseClient,
  input: {
    year: number;
    term: CadetTerm;
    weekNumber: number;
    subject: string;
    moduleNotes?: string;
    bunnyVideoId?: string | null;
    bunnyVideoTitle?: string | null;
    drillRefs?: CadetDrillRef[];
  } & Partial<CadetModuleTestFields>,
): Promise<{ error: string | null }> {
  const subject = input.subject.trim();
  if (!subject) return { error: "Add a subject / module title." };
  if (input.weekNumber < 1 || input.weekNumber > 20) return { error: "Week must be 1–20." };

  const bunnyId =
    input.bunnyVideoId === undefined ? null : resolveCadetBunnyVideoId(input.bunnyVideoId);
  if (input.bunnyVideoId?.trim() && !bunnyId) {
    return { error: "Bunny link must be a video ID or mediadelivery embed URL." };
  }

  const testFields = normalizeTestFields({
    isTest: Boolean(input.isTest),
    testStandard: input.testStandard,
    testMaxScore: input.testMaxScore,
    testPassMark: input.testPassMark,
    testGradeMarks: input.testGradeMarks,
    testScoreType: input.testScoreType,
    testSkillId: input.testSkillId,
    gatesHoleGroup: input.gatesHoleGroup,
  });
  if ("error" in testFields) return { error: testFields.error };

  const { error } = await client.from("cadet_curriculum_weeks").insert({
    program_year: input.year,
    term: input.term,
    week_number: input.weekNumber,
    subject,
    module_notes: input.moduleNotes?.trim() || null,
    bunny_video_id: bunnyId,
    bunny_video_title: bunnyId ? normalizeCadetBunnyTitle(input.bunnyVideoTitle) : null,
    drill_refs: input.drillRefs ?? [],
    ...testFields,
    sort_order: 0,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const msg = error.message || "Couldn't save.";
    return { error: isMissingRelation(msg) ? CADET_CURRICULUM_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function updateCadetCurriculumWeek(
  client: SupabaseClient,
  id: string,
  patch: {
    subject?: string;
    moduleNotes?: string | null;
    weekNumber?: number;
    bunnyVideoId?: string | null;
    bunnyVideoTitle?: string | null;
    drillRefs?: CadetDrillRef[];
  } & Partial<CadetModuleTestFields>,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.subject != null) {
    const subject = patch.subject.trim();
    if (!subject) return { error: "Subject can't be empty." };
    row.subject = subject;
  }
  if (patch.moduleNotes !== undefined) {
    row.module_notes = patch.moduleNotes?.trim() || null;
  }
  if (patch.weekNumber != null) {
    if (patch.weekNumber < 1 || patch.weekNumber > 20) return { error: "Week must be 1–20." };
    row.week_number = patch.weekNumber;
  }
  if (patch.bunnyVideoId !== undefined) {
    const raw = patch.bunnyVideoId;
    if (raw == null || String(raw).trim() === "") {
      row.bunny_video_id = null;
      row.bunny_video_title = null;
    } else {
      const bunnyId = resolveCadetBunnyVideoId(raw);
      if (!bunnyId) return { error: "Bunny link must be a video ID or mediadelivery embed URL." };
      row.bunny_video_id = bunnyId;
      row.bunny_video_title = normalizeCadetBunnyTitle(patch.bunnyVideoTitle);
    }
  } else if (patch.bunnyVideoTitle !== undefined) {
    row.bunny_video_title = normalizeCadetBunnyTitle(patch.bunnyVideoTitle);
  }
  if (patch.drillRefs !== undefined) {
    row.drill_refs = patch.drillRefs;
  }
  if (patch.isTest !== undefined) {
    const testFields = normalizeTestFields({
      isTest: patch.isTest,
      testStandard: patch.testStandard,
      testMaxScore: patch.testMaxScore,
      testPassMark: patch.testPassMark,
      testGradeMarks: patch.testGradeMarks,
      testScoreType: patch.testScoreType,
      testSkillId: patch.testSkillId,
      gatesHoleGroup: patch.gatesHoleGroup,
    });
    if ("error" in testFields) return { error: testFields.error };
    Object.assign(row, testFields);
  }

  const { error } = await client.from("cadet_curriculum_weeks").update(row).eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't update.";
    return { error: isMissingRelation(msg) ? CADET_CURRICULUM_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function deleteCadetCurriculumWeek(
  client: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await client.from("cadet_curriculum_weeks").delete().eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't delete.";
    return { error: isMissingRelation(msg) ? CADET_CURRICULUM_MIGRATION_HINT : msg };
  }
  return { error: null };
}

/** Group rows by week for display. */
export function groupCurriculumByWeek(
  rows: CadetCurriculumWeek[],
): { week: number; modules: CadetCurriculumWeek[] }[] {
  const map = new Map<number, CadetCurriculumWeek[]>();
  for (const row of rows) {
    const list = map.get(row.week_number) ?? [];
    list.push(row);
    map.set(row.week_number, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, modules]) => ({ week, modules }));
}

function mapCompletionRow(row: Record<string, unknown>): CadetModuleCompletion {
  const profiles = row.profiles as { full_name?: string | null } | null | undefined;
  const statusRaw = String(row.status || "");
  return {
    id: String(row.id),
    curriculum_week_id: String(row.curriculum_week_id),
    player_id: String(row.player_id),
    status: isCadetModuleStatus(statusRaw) ? statusRaw : "needs_work",
    notes: typeof row.notes === "string" ? row.notes : null,
    updated_at: String(row.updated_at || ""),
    created_at: String(row.created_at || ""),
    player_name: profiles?.full_name ?? null,
  };
}

export async function fetchCadetModuleCompletions(
  client: SupabaseClient,
  curriculumWeekIds: string[],
): Promise<{ rows: CadetModuleCompletion[]; error: string | null; available: boolean }> {
  if (!curriculumWeekIds.length) return { rows: [], error: null, available: true };

  const { data, error } = await client
    .from("cadet_module_completions")
    .select(
      "id, curriculum_week_id, player_id, status, notes, updated_at, created_at, profiles(full_name)",
    )
    .in("curriculum_week_id", curriculumWeekIds)
    .order("updated_at", { ascending: false });

  if (error) {
    const msg = error.message || "Couldn't load module tick-offs.";
    if (isMissingRelation(msg)) {
      return { rows: [], error: CADET_COMPLETIONS_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: ((data as Record<string, unknown>[]) || []).map(mapCompletionRow),
    error: null,
    available: true,
  };
}

export async function upsertCadetModuleCompletion(
  client: SupabaseClient,
  input: {
    curriculumWeekId: string;
    playerId: string;
    status: CadetModuleStatus;
    notes?: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await client.from("cadet_module_completions").upsert(
    {
      curriculum_week_id: input.curriculumWeekId,
      player_id: input.playerId,
      status: input.status,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "curriculum_week_id,player_id" },
  );
  if (error) {
    const msg = error.message || "Couldn't save tick-off.";
    return { error: isMissingRelation(msg) ? CADET_COMPLETIONS_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function clearCadetModuleCompletion(
  client: SupabaseClient,
  input: { curriculumWeekId: string; playerId: string },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("cadet_module_completions")
    .delete()
    .eq("curriculum_week_id", input.curriculumWeekId)
    .eq("player_id", input.playerId);
  if (error) {
    const msg = error.message || "Couldn't clear tick-off.";
    return { error: isMissingRelation(msg) ? CADET_COMPLETIONS_MIGRATION_HINT : msg };
  }
  return { error: null };
}

function mapTestResultRow(row: Record<string, unknown>): CadetModuleTestResult {
  const profiles = row.profiles as { full_name?: string | null } | null | undefined;
  const outcomeRaw = String(row.outcome || "");
  return {
    id: String(row.id),
    curriculum_week_id: String(row.curriculum_week_id),
    player_id: String(row.player_id),
    program_year: Number(row.program_year),
    term: Number(row.term) as CadetTerm,
    score: Number(row.score),
    max_score: row.max_score == null ? null : Number(row.max_score),
    attempts: row.attempts == null ? null : Number(row.attempts),
    grade: normalizeCadetTestGradeId(typeof row.grade === "string" ? row.grade : null),
    outcome: isCadetTestOutcome(outcomeRaw) ? outcomeRaw : "needs_practice",
    notes: typeof row.notes === "string" ? row.notes : null,
    updated_at: String(row.updated_at || ""),
    created_at: String(row.created_at || ""),
    player_name: profiles?.full_name ?? null,
  };
}

/** Latest attempt per player (for status chips). */
export function latestCadetTestByPlayer(
  results: CadetModuleTestResult[],
): Map<string, CadetModuleTestResult> {
  const m = new Map<string, CadetModuleTestResult>();
  const sorted = [...results].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const r of sorted) {
    if (!m.has(r.player_id)) m.set(r.player_id, r);
  }
  return m;
}

/** Best attempt for move-up: any pass wins; among equals prefer higher grade, then latest. */
export function bestCadetTestByPlayer(
  results: CadetModuleTestResult[],
): Map<string, CadetModuleTestResult> {
  const m = new Map<string, CadetModuleTestResult>();
  for (const r of results) {
    const cur = m.get(r.player_id);
    if (!cur) {
      m.set(r.player_id, r);
      continue;
    }
    if (cur.outcome !== "pass" && r.outcome === "pass") {
      m.set(r.player_id, r);
      continue;
    }
    if (cur.outcome === r.outcome) {
      const gradeDiff = cadetTestGradeRank(r.grade) - cadetTestGradeRank(cur.grade);
      if (gradeDiff > 0 || (gradeDiff === 0 && r.created_at > cur.created_at)) {
        m.set(r.player_id, r);
      }
    }
  }
  return m;
}

export async function fetchCadetModuleTestResults(
  client: SupabaseClient,
  opts: {
    curriculumWeekIds?: string[];
    playerId?: string;
    year?: number;
    term?: CadetTerm;
  },
): Promise<{ rows: CadetModuleTestResult[]; error: string | null; available: boolean }> {
  const selectFull =
    "id, curriculum_week_id, player_id, program_year, term, score, max_score, attempts, grade, outcome, notes, updated_at, created_at, profiles(full_name)";
  const selectWithAttempts =
    "id, curriculum_week_id, player_id, program_year, term, score, max_score, attempts, outcome, notes, updated_at, created_at, profiles(full_name)";
  const selectBasic =
    "id, curriculum_week_id, player_id, program_year, term, score, max_score, outcome, notes, updated_at, created_at, profiles(full_name)";

  let q = client
    .from("cadet_module_test_results")
    .select(selectFull)
    .order("created_at", { ascending: false });

  if (opts.curriculumWeekIds?.length) {
    q = q.in("curriculum_week_id", opts.curriculumWeekIds);
  }
  if (opts.playerId) q = q.eq("player_id", opts.playerId);
  if (opts.year != null) q = q.eq("program_year", opts.year);
  if (opts.term != null) q = q.eq("term", opts.term);

  const { data, error } = await q;
  if (error) {
    const msg = error.message || "Couldn't load test results.";
    if (/grade/i.test(msg)) {
      let qGrade = client
        .from("cadet_module_test_results")
        .select(selectWithAttempts)
        .order("created_at", { ascending: false });
      if (opts.curriculumWeekIds?.length) qGrade = qGrade.in("curriculum_week_id", opts.curriculumWeekIds);
      if (opts.playerId) qGrade = qGrade.eq("player_id", opts.playerId);
      if (opts.year != null) qGrade = qGrade.eq("program_year", opts.year);
      if (opts.term != null) qGrade = qGrade.eq("term", opts.term);
      const retryGrade = await qGrade;
      if (!retryGrade.error) {
        return {
          rows: ((retryGrade.data as Record<string, unknown>[]) || []).map(mapTestResultRow),
          error: null,
          available: true,
        };
      }
    }
    if (/attempts/i.test(msg)) {
      let q2 = client
        .from("cadet_module_test_results")
        .select(selectBasic)
        .order("created_at", { ascending: false });
      if (opts.curriculumWeekIds?.length) q2 = q2.in("curriculum_week_id", opts.curriculumWeekIds);
      if (opts.playerId) q2 = q2.eq("player_id", opts.playerId);
      if (opts.year != null) q2 = q2.eq("program_year", opts.year);
      if (opts.term != null) q2 = q2.eq("term", opts.term);
      const retry = await q2;
      if (retry.error) {
        const m2 = retry.error.message || msg;
        if (isMissingRelation(m2)) {
          return { rows: [], error: CADET_TESTS_MIGRATION_HINT, available: false };
        }
        return { rows: [], error: m2, available: true };
      }
      return {
        rows: ((retry.data as Record<string, unknown>[]) || []).map(mapTestResultRow),
        error: null,
        available: true,
      };
    }
    if (isMissingRelation(msg)) {
      return { rows: [], error: CADET_TESTS_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: ((data as Record<string, unknown>[]) || []).map(mapTestResultRow),
    error: null,
    available: true,
  };
}

/** Append a new attempt (does not overwrite prior logs). */
export async function insertCadetModuleTestAttempt(
  client: SupabaseClient,
  input: {
    curriculumWeekId: string;
    playerId: string;
    year: number;
    term: CadetTerm;
    score: number;
    maxScore?: number | null;
    attempts?: number | null;
    grade?: CadetTestGradeId | null;
    outcome: CadetTestOutcome;
    notes?: string;
  },
): Promise<{ error: string | null }> {
  if (!Number.isFinite(input.score) || input.score < 0) {
    return { error: "Enter a valid score." };
  }
  let maxScore: number | null = null;
  if (input.maxScore != null && String(input.maxScore).trim() !== "") {
    maxScore = Number(input.maxScore);
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 200) {
      return { error: "Max score must be 1–200." };
    }
  }
  let attempts: number | null = null;
  if (input.attempts != null && String(input.attempts).trim() !== "") {
    attempts = Number(input.attempts);
    if (!Number.isFinite(attempts) || attempts < 1 || attempts > 500) {
      return { error: "Attempts must be 1–500." };
    }
  }
  const grade = normalizeCadetTestGradeId(input.grade ?? null);

  const payload: Record<string, unknown> = {
    curriculum_week_id: input.curriculumWeekId,
    player_id: input.playerId,
    program_year: input.year,
    term: input.term,
    score: input.score,
    max_score: maxScore,
    outcome: input.outcome,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (attempts != null) payload.attempts = attempts;
  if (grade) payload.grade = grade;

  const { error } = await client.from("cadet_module_test_results").insert(payload);
  if (error) {
    const msg = error.message || "Couldn't save test attempt.";
    if (/grade/i.test(msg) && grade) {
      delete payload.grade;
      const retryGrade = await client.from("cadet_module_test_results").insert(payload);
      if (!retryGrade.error) return { error: null };
    }
    // Column may be missing before attempts migration — retry without it.
    if (/attempts/i.test(msg) && attempts != null) {
      delete payload.attempts;
      delete payload.grade;
      const retry = await client.from("cadet_module_test_results").insert(payload);
      if (retry.error) {
        const m2 = retry.error.message || msg;
        return { error: isMissingRelation(m2) ? CADET_TESTS_MIGRATION_HINT : m2 };
      }
      return { error: null };
    }
    return { error: isMissingRelation(msg) ? CADET_TESTS_MIGRATION_HINT : msg };
  }
  return { error: null };
}

/** @deprecated Prefer insertCadetModuleTestAttempt — kept as alias for callers. */
export async function upsertCadetModuleTestResult(
  client: SupabaseClient,
  input: {
    curriculumWeekId: string;
    playerId: string;
    year: number;
    term: CadetTerm;
    score: number;
    maxScore?: number | null;
    attempts?: number | null;
    outcome: CadetTestOutcome;
    notes?: string;
  },
): Promise<{ error: string | null }> {
  return insertCadetModuleTestAttempt(client, input);
}

export async function clearCadetModuleTestResult(
  client: SupabaseClient,
  input: {
    curriculumWeekId: string;
    playerId: string;
    year: number;
    term: CadetTerm;
  },
): Promise<{ error: string | null }> {
  const { error } = await client
    .from("cadet_module_test_results")
    .delete()
    .eq("curriculum_week_id", input.curriculumWeekId)
    .eq("player_id", input.playerId)
    .eq("program_year", input.year)
    .eq("term", input.term);
  if (error) {
    const msg = error.message || "Couldn't clear test result.";
    return { error: isMissingRelation(msg) ? CADET_TESTS_MIGRATION_HINT : msg };
  }
  return { error: null };
}

/**
 * Move-up readiness for the current term:
 * modules Done + skill tests Pass + on-course scoring ready.
 * Tests with gates_hole_group only count when they gate the student's next step (or are untagged).
 */
export function computeCadetMoveUpReadiness(input: {
  modules: CadetCurriculumWeek[];
  completions: CadetModuleCompletion[];
  testResults: CadetModuleTestResult[];
  currentGroup: CadetHoleGroup | null;
  playerId: string;
  isJuniorMember?: boolean;
  onCourseReady?: boolean;
  onCourseDetail?: string;
  scorecardReady?: boolean;
  scorecardDetail?: string;
}): CadetMoveUpReadiness {
  const { modules, completions, testResults, currentGroup, playerId } = input;
  const isJuniorMember = Boolean(input.isJuniorMember);
  const nextStep = nextCadetProgressionStep(currentGroup, isJuniorMember);
  const nextGroup =
    nextStep != null && nextStep !== "junior_member" ? nextStep : null;
  const atTop = isJuniorMember;
  const onCourseReady = Boolean(input.onCourseReady);
  const scorecardGate = input.scorecardReady !== undefined;
  const scorecardReady = scorecardGate ? Boolean(input.scorecardReady) : true;

  const doneByModule = new Map<string, CadetModuleStatus>();
  for (const c of completions) {
    if (c.player_id !== playerId) continue;
    doneByModule.set(c.curriculum_week_id, c.status);
  }

  const playerResults = testResults.filter((r) => r.player_id === playerId);
  // Best attempt per module for this player (any pass counts as ready).
  const byWeek = new Map<string, CadetModuleTestResult[]>();
  for (const r of playerResults) {
    const list = byWeek.get(r.curriculum_week_id) ?? [];
    list.push(r);
    byWeek.set(r.curriculum_week_id, list);
  }
  const resultByModule = new Map<string, CadetModuleTestResult>();
  for (const [weekId, list] of byWeek) {
    const best = bestCadetTestByPlayer(list).get(playerId);
    if (best) resultByModule.set(weekId, best);
  }

  const gaps: CadetMoveUpGap[] = [];
  let modulesDone = 0;
  for (const mod of modules) {
    const status = doneByModule.get(mod.id);
    if (status === "done") {
      modulesDone += 1;
    } else {
      gaps.push({
        kind: "module",
        moduleId: mod.id,
        subject: mod.subject,
        detail: status === "needs_work" ? "Needs work" : "Not marked done",
      });
    }
  }

  const relevantTests = modules.filter((m) => {
    if (!m.is_test) return false;
    if (m.gates_hole_group == null) return true;
    // Junior Member unlock uses 10-hole gated tests (or untagged).
    if (nextStep === "junior_member") return m.gates_hole_group === 10;
    if (!nextGroup) return true;
    return m.gates_hole_group === nextGroup;
  });

  let testsPassed = 0;
  for (const mod of relevantTests) {
    const result = resultByModule.get(mod.id);
    if (result?.outcome === "pass") {
      testsPassed += 1;
    } else {
      gaps.push({
        kind: "test",
        moduleId: mod.id,
        subject: mod.subject,
        detail: result
          ? `${cadetTestOutcomeLabel(result.outcome)} · ${formatCadetTestScore(result.score, result.max_score, result.attempts)}`
          : "No test result yet",
      });
    }
  }

  if (!onCourseReady) {
    gaps.push({
      kind: "on_course",
      moduleId: "on_course",
      subject: "On-course scoring",
      detail: input.onCourseDetail || "Need more / better on-course scores this term",
    });
  }

  if (scorecardGate && !scorecardReady) {
    gaps.push({
      kind: "scorecard",
      moduleId: "scorecard",
      subject: "Scorecard stats",
      detail: input.scorecardDetail || "Need stronger hole stats (putts / chips / bunker / <30m)",
    });
  }

  const skillGaps = gaps.filter((g) => g.kind !== "on_course" && g.kind !== "scorecard");
  const skillsReady = modules.length > 0 && skillGaps.length === 0;
  const ready =
    Boolean(currentGroup) &&
    !atTop &&
    nextStep != null &&
    modules.length > 0 &&
    gaps.length === 0;

  return {
    currentGroup,
    nextGroup,
    nextStep,
    ready,
    atTop,
    isJuniorMember,
    modulesDone,
    modulesTotal: modules.length,
    testsPassed,
    testsTotal: relevantTests.length,
    gaps,
    skillsReady,
    onCourseReady,
  };
}

/** Coach-facing level-up recommendations from on-course scores + skill testing. */
export function buildCadetLevelUpRecommendations(input: {
  readiness: CadetMoveUpReadiness;
  onCourseDetail: string;
  scorecardDetail?: string | null;
  practiceDetails?: string[];
  playerName?: string | null;
}): CadetLevelUpRecommendation[] {
  const { readiness, onCourseDetail } = input;
  const out: CadetLevelUpRecommendation[] = [];
  const nextLabel = readiness.nextStep
    ? cadetProgressionStepLabel(readiness.nextStep)
    : null;

  if (readiness.atTop) {
    out.push({
      id: "top",
      source: "level_up",
      tone: "info",
      title: "Junior Member · top of the pathway",
      detail: "Keep logging rounds and retesting skills to stay sharp.",
    });
    return out;
  }

  if (!readiness.currentGroup) {
    out.push({
      id: "enrol",
      source: "level_up",
      tone: "practise",
      title: "Set a starting hole group",
      detail: "Enrol on 3, 5, 7, or 10 before level-up recommendations apply.",
    });
    return out;
  }

  if (readiness.ready && nextLabel) {
    out.push({
      id: "level-up-go",
      source: "level_up",
      tone: "go",
      title: `Recommend move to ${nextLabel}`,
      detail: "On-course scoring and skill tests both look ready for this term.",
    });
  } else if (nextLabel) {
    out.push({
      id: "level-up-hold",
      source: "level_up",
      tone: "practise",
      title: `Not ready for ${nextLabel} yet`,
      detail: "Clear the items below — on-course scores and skill testing both count.",
    });
  }

  if (readiness.onCourseReady) {
    out.push({
      id: "on-course-ok",
      source: "on_course",
      tone: "go",
      title: "On-course scoring",
      detail: onCourseDetail,
    });
  } else {
    out.push({
      id: "on-course-action",
      source: "on_course",
      tone: "practise",
      title: "On-course scoring — practise / log more",
      detail: onCourseDetail,
    });
  }

  if (input.scorecardDetail) {
    const scReady = !readiness.gaps.some((g) => g.kind === "scorecard");
    out.push({
      id: scReady ? "scorecard-ok" : "scorecard-action",
      source: "scorecard",
      tone: scReady ? "go" : "practise",
      title: scReady ? "Scorecard stats" : "Scorecard — practise these areas",
      detail:
        input.practiceDetails?.length && !scReady
          ? `${input.scorecardDetail} · Focus: ${input.practiceDetails.join(" · ")}`
          : input.scorecardDetail,
    });
  }

  if (readiness.testsTotal === 0) {
    out.push({
      id: "tests-none",
      source: "skill_test",
      tone: "info",
      title: "Skill testing",
      detail: "No gated tests on this term’s plan yet — add tests on Year plan modules.",
    });
  } else if (readiness.testsPassed === readiness.testsTotal) {
    out.push({
      id: "tests-ok",
      source: "skill_test",
      tone: "go",
      title: "Skill testing",
      detail: `Passed ${readiness.testsPassed}/${readiness.testsTotal} required tests this term.`,
    });
  } else {
    const testGaps = readiness.gaps.filter((g) => g.kind === "test");
    out.push({
      id: "tests-action",
      source: "skill_test",
      tone: "practise",
      title: "Skill testing — practise these",
      detail: testGaps.length
        ? testGaps.map((g) => `${g.subject} (${g.detail})`).join(" · ")
        : `Passed ${readiness.testsPassed}/${readiness.testsTotal} tests.`,
    });
  }

  const moduleGaps = readiness.gaps.filter((g) => g.kind === "module");
  if (moduleGaps.length) {
    out.push({
      id: "modules-action",
      source: "module",
      tone: "practise",
      title: "Modules still open",
      detail: moduleGaps.map((g) => `${g.subject} · ${g.detail}`).join(" · "),
    });
  }

  return out;
}

/**
 * Find a comparable prior-term result for improvement tracking.
 * Prefers same skill id, then same subject (modules differ by term id).
 */
export function priorTermTestResult(
  results: CadetModuleTestResult[],
  moduleLookup: Map<string, Pick<CadetCurriculumWeek, "subject" | "test_skill_id">>,
  opts: {
    playerId: string;
    year: number;
    term: CadetTerm;
    subject: string;
    skillId: string | null;
  },
): CadetModuleTestResult | null {
  const subjectKey = opts.subject.trim().toLowerCase();
  const skillKey = opts.skillId?.trim() || null;

  const prior = results.filter((r) => {
    if (r.player_id !== opts.playerId) return false;
    if (
      !(
        r.program_year < opts.year ||
        (r.program_year === opts.year && r.term < opts.term)
      )
    ) {
      return false;
    }
    const mod = moduleLookup.get(r.curriculum_week_id);
    if (!mod) return false;
    if (skillKey && mod.test_skill_id === skillKey) return true;
    return mod.subject.trim().toLowerCase() === subjectKey;
  });
  if (prior.length === 0) return null;

  // Prefer most recent prior term/year, then best attempt within that window.
  prior.sort((a, b) => {
    if (a.program_year !== b.program_year) return b.program_year - a.program_year;
    if (a.term !== b.term) return b.term - a.term;
    return b.created_at.localeCompare(a.created_at);
  });
  const topYear = prior[0]!.program_year;
  const topTerm = prior[0]!.term;
  const sameWindow = prior.filter((r) => r.program_year === topYear && r.term === topTerm);
  return bestCadetTestByPlayer(sameWindow).get(opts.playerId) ?? sameWindow[0]!;
}

export type CadetDrillCatalogItem = CadetDrillRef;

/** Load drills for the cadet picker (DB first, official catalog fallback). */
export async function fetchCadetDrillCatalog(
  client: SupabaseClient,
): Promise<{ items: CadetDrillCatalogItem[]; error: string | null }> {
  const { data, error } = await client
    .from("drills")
    .select("id, drill_id, drill_name, title, category")
    .order("drill_name", { ascending: true });

  if (!error && data?.length) {
    const items: CadetDrillCatalogItem[] = [];
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const id = String(r.id || "").trim();
      const title = String(r.drill_name || r.title || "").trim();
      if (!id || !title) continue;
      const code = String(r.drill_id || "").trim();
      items.push({
        id,
        drill_id: code || id,
        title,
        category: String(r.category || "").trim() || "Drill",
      });
    }
    items.sort((a, b) => a.title.localeCompare(b.title));
    return { items, error: null };
  }

  try {
    const res = await fetch("/api/drills/catalog", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { drills?: Record<string, unknown>[] };
    const drills = Array.isArray(body.drills) ? body.drills : [];
    const items: CadetDrillCatalogItem[] = [];
    for (const r of drills) {
      const id = String(r.id || "").trim();
      const title = String(r.drill_name || r.title || "").trim();
      if (!id || !title) continue;
      const code = String(r.drill_id || "").trim();
      items.push({
        id,
        drill_id: code || id,
        title,
        category: String(r.category || "").trim() || "Drill",
      });
    }
    items.sort((a, b) => a.title.localeCompare(b.title));
    if (items.length) return { items, error: null };
  } catch {
    /* fall through */
  }

  return {
    items: [],
    error: error?.message || "Couldn't load the drill list.",
  };
}
