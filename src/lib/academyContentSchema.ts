/**
 * Academy / Library content model — how to structure future videos & lessons
 * =============================================================================
 *
 * The Library UI builds a hierarchy: **Course → Module → Chapter → Lesson**.
 * Your `drills` table rows are mapped to lessons in `library/page.tsx`. Use these
 * columns (add via Supabase migration when missing) so content stays consistent:
 *
 * | Column           | Purpose |
 * |------------------|---------|
 * | id               | Stable UUID/string — never change once published (progress keys). |
 * | drill_name       | Lesson title shown in lists and player. |
 * | module_name      | Top bucket, e.g. "Putting", "Wedges", "Course Management". |
 * | chapter_name     | Section inside module, e.g. "Green reading", "Lag putting". |
 * | category         | Filters: Driving, Short Game, Putting, Irons, Mental, … |
 * | sort_order       | Integer sort within a chapter (1, 2, 3…). |
 * | type             | `video` | `text` | `pdf` | `quiz` | `drill` |
 * | video_url        | YouTube embed or watch URL (app normalizes to embed). |
 * | description      | Short learner-facing summary under the title. |
 * | duration         | Display string, e.g. "8:42". |
 * | xp_value         | XP granted when learner marks lesson complete (Library flow). |
 *
 * **Workflow we recommend**
 * 1. Plan modules/chapters in a spreadsheet → same names you will use in DB.
 * 2. Upload videos (YouTube unlisted is fine) → paste canonical watch or embed URL into `video_url`.
 * 3. Insert one drills row per lesson with `sort_order` gaps (e.g. 10, 20) so you can insert later rows.
 * 4. Optional later: add `difficulty`, `instructor`, `published_at`, `thumbnail_url` — extend the mapper in
 *    `library/page.tsx` when those columns exist.
 *
 * **Single-course vs multi-course**
 * Today the app uses one logical course (`COURSE_TITLE` in library). For multiple courses later,
 * add `course_id` / `course_slug` on drills and filter in `fetchDrillsCatalog` or a dedicated query.
 */

/** Row shape you can extend in Supabase; Library maps unknown keys safely. */
export interface AcademyDrillRow {
  id: string;
  drill_name?: string | null;
  title?: string | null;
  module_name?: string | null;
  chapter_name?: string | null;
  category?: string | null;
  sort_order?: number | null;
  estimated_minutes?: number | null;
  type?: string | null;
  video_url?: string | null;
  source?: string | null;
  youtube_link?: string | null;
  description?: string | null;
  duration?: string | null;
  xp_value?: number | null;
  xp?: number | null;
}

export const ACADEMY_DRILL_SORT_FALLBACK = "estimated_minutes";
