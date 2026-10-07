import type { SupabaseClient } from "@supabase/supabase-js";
import { CoachingSetupError, createPost } from "@/lib/coachingFeed";

export type AssignmentKind = "drill" | "lesson";

/** Something a coach can assign: a practice drill or a library lesson (module video or tool). */
export type AssignableItem = {
  kind: AssignmentKind;
  itemId: string;
  title: string;
  /** Category for drills, module name for lessons. */
  group: string;
  description: string;
  goal: string;
};

export type CoachingAssignment = {
  id: string;
  student_id: string;
  coach_id: string;
  kind: AssignmentKind;
  item_id: string;
  title: string;
  note: string | null;
  post_id: string | null;
  created_at: string;
  completed_at: string | null;
  completed_auto: boolean;
};

const COLUMNS = "id, student_id, coach_id, kind, item_id, title, note, post_id, created_at, completed_at, completed_auto";

const SETUP_MESSAGE =
  "Assigned drills need one database step: run supabase/migrations/20261007130000_coaching_assignments.sql in Supabase.";

function rethrow(error: { message?: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42P01" || /coaching_assignments/.test(error.message ?? "")) {
    throw new CoachingSetupError(SETUP_MESSAGE);
  }
  throw new Error(error.message || "Something went wrong");
}

/** Where the player goes to do it. Drills open in the practice page's Drill Library (with "add to a day"). */
export function assignmentHref(a: Pick<CoachingAssignment, "kind" | "item_id">): string {
  return a.kind === "lesson"
    ? `/library?drill=${encodeURIComponent(a.item_id)}`
    : `/practice?plan=library&drill=${encodeURIComponent(a.item_id)}`;
}

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/** Every drill and library lesson, drills first. Catalog rows override the built-in list. */
export async function fetchAssignableItems(): Promise<AssignableItem[]> {
  const [{ OFFICIAL_DRILLS, DESCRIPTION_BY_DRILL_ID }, { LIBRARY_MODULES }, { fetchDrillsCatalogRows }] =
    await Promise.all([
      import("@/data/official_drills"),
      import("@/lib/bunnyStream"),
      import("@/lib/fetchDrillsCatalog"),
    ]);
  const rows = await fetchDrillsCatalogRows().catch(() => [] as Record<string, unknown>[]);

  // Same merge as the practice Drill Library: a catalog row replaces the built-in drill with the same
  // code, id or name, so the key here is the one the player logs against.
  const lower = (v: unknown) => text(v).toLowerCase();
  const drillRows = rows.filter((r) => lower(r.module_name) !== "swing drills" && text(r.drill_name ?? r.title));
  const officialBy = new Map<string, (typeof OFFICIAL_DRILLS)[number]>();
  for (const o of OFFICIAL_DRILLS) {
    for (const k of [`code:${lower(o.drill_id)}`, `id:${o.id}`, `name:${lower(o.drill_name ?? o.title)}`]) {
      if (!k.endsWith(":") && !officialBy.has(k)) officialBy.set(k, o);
    }
  }
  const usedOfficial = new Set<string>();
  const drills = new Map<string, AssignableItem>();
  const addDrill = (key: string, item: Omit<AssignableItem, "kind" | "itemId">) => {
    if (!key || !item.title || drills.has(key.toLowerCase())) return;
    drills.set(key.toLowerCase(), { kind: "drill", itemId: key, ...item });
  };
  for (const r of drillRows) {
    const key = text(r.drill_id) || text(r.id);
    const title = text(r.drill_name ?? r.title);
    const official =
      officialBy.get(`code:${lower(r.drill_id)}`) ?? officialBy.get(`name:${title.toLowerCase()}`) ?? officialBy.get(`id:${text(r.id)}`);
    if (official) usedOfficial.add(official.id);
    addDrill(key, {
      title,
      group: text(official?.category) || text(r.category),
      description:
        text(r.description) || text(official?.description) || DESCRIPTION_BY_DRILL_ID[key] || DESCRIPTION_BY_DRILL_ID[text(r.id)] || "",
      goal: text(r.goal_reps) || text(r.goal) || text(official?.goal),
    });
  }
  for (const d of OFFICIAL_DRILLS) {
    if (usedOfficial.has(d.id)) continue;
    const key = text(d.drill_id) || d.id;
    addDrill(key, {
      title: text(d.drill_name ?? d.title),
      group: text(d.category),
      description: text(d.description) || DESCRIPTION_BY_DRILL_ID[key] || "",
      goal: text(d.goal),
    });
  }

  const lessons = new Map<string, AssignableItem>();
  for (const mod of LIBRARY_MODULES) {
    for (const tool of mod.tools ?? []) {
      lessons.set(tool.id, {
        kind: "lesson",
        itemId: tool.id,
        title: tool.label,
        group: mod.name,
        description: tool.description,
        goal: "",
      });
    }
    for (const v of mod.videos) {
      lessons.set(v.libraryDrillId, {
        kind: "lesson",
        itemId: v.libraryDrillId,
        title: v.label,
        group: mod.name,
        description: v.description ?? "",
        goal: "",
      });
    }
  }
  const lessonTitles = new Set([...lessons.values()].map((l) => l.title.toLowerCase()));

  for (const r of rows) {
    const title = text(r.drill_name ?? r.title);
    if (!title) continue;
    if (text(r.module_name).toLowerCase() === "swing drills") {
      const id = text(r.id);
      if (!lessons.has(id) && !lessonTitles.has(title.toLowerCase())) {
        lessons.set(id, {
          kind: "lesson",
          itemId: id,
          title,
          group: "Swing Drills",
          description: text(r.description),
          goal: "",
        });
      }
    }
  }

  const byTitle = (a: AssignableItem, b: AssignableItem) => a.title.localeCompare(b.title);
  return [...[...drills.values()].sort(byTitle), ...[...lessons.values()].sort(byTitle)];
}

export async function fetchAssignments(supabase: SupabaseClient, studentId: string): Promise<CoachingAssignment[]> {
  const { data, error } = await supabase
    .from("coaching_assignments")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  rethrow(error);
  return (data ?? []) as CoachingAssignment[];
}

/** Everything this coach has assigned, across all their players. */
export async function fetchCoachAssignments(supabase: SupabaseClient, coachId: string): Promise<CoachingAssignment[]> {
  const { data, error } = await supabase
    .from("coaching_assignments")
    .select(COLUMNS)
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(5000);
  rethrow(error);
  return (data ?? []) as CoachingAssignment[];
}

/** Assigns the same items to several players (one feed post each). Reports who it failed for. */
export async function assignToPlayers(
  supabase: SupabaseClient,
  input: { players: { id: string; name: string }[]; coachId: string; items: AssignableItem[]; note: string },
): Promise<{ created: CoachingAssignment[]; failed: { id: string; name: string }[]; error: string | null }> {
  const results = await Promise.allSettled(
    input.players.map((p) =>
      createAssignments(supabase, { studentId: p.id, coachId: input.coachId, items: input.items, note: input.note }),
    ),
  );
  const created: CoachingAssignment[] = [];
  const failed: { id: string; name: string }[] = [];
  let error: string | null = null;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") created.push(...r.value);
    else {
      failed.push(input.players[i]);
      error ??= r.reason instanceof Error ? r.reason.message : "Couldn't assign.";
    }
  });
  return { created, failed, error };
}

/** Assigns the items and posts one message in the player's feed so they're notified. */
export async function createAssignments(
  supabase: SupabaseClient,
  input: { studentId: string; coachId: string; items: AssignableItem[]; note: string },
): Promise<CoachingAssignment[]> {
  const note = input.note.trim();
  const list = input.items.map((i) => `• ${i.title}`).join("\n");
  const post = await createPost(supabase, {
    studentId: input.studentId,
    authorId: input.coachId,
    body: `📋 Assigned ${input.items.length === 1 ? "a drill" : `${input.items.length} drills`}:\n${list}${
      note ? `\n\n${note}` : ""
    }\n\nYou'll find ${input.items.length === 1 ? "it" : "them"} under "Assigned by your coach".`,
  });
  const { data, error } = await supabase
    .from("coaching_assignments")
    .insert(
      input.items.map((i) => ({
        student_id: input.studentId,
        coach_id: input.coachId,
        kind: i.kind,
        item_id: i.itemId,
        title: i.title.slice(0, 200),
        note: note || null,
        post_id: post.id,
      })),
    )
    .select(COLUMNS);
  if (error) {
    await supabase.from("coaching_posts").delete().eq("id", post.id);
    rethrow(error);
  }
  return (data ?? []) as CoachingAssignment[];
}

export async function setAssignmentDone(
  supabase: SupabaseClient,
  id: string,
  done: boolean,
): Promise<{ completed_at: string | null }> {
  const completed_at = done ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("coaching_assignments")
    .update({ completed_at, completed_auto: false })
    .eq("id", id);
  rethrow(error);
  return { completed_at };
}

export async function deleteAssignment(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("coaching_assignments").delete().eq("id", id);
  rethrow(error);
}
