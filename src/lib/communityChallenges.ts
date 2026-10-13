import { createClient } from "@/lib/supabase/client";
import { communityError, loadPeople, type CommunityPerson, type ReviewStatus } from "@/lib/community";

export type ChallengeMetric = "practice_hours" | "rounds" | "low_gross" | "low_nett" | "drills" | "combines" | "lessons";

/** Auto-scored challenges, worked out from what players log in the app. */
export const CHALLENGE_METRICS: { id: ChallengeMetric; label: string; unit: string; lowerIsBetter: boolean }[] = [
  { id: "practice_hours", label: "Most practice hours", unit: "h", lowerIsBetter: false },
  { id: "rounds", label: "Most rounds played", unit: "rounds", lowerIsBetter: false },
  { id: "low_gross", label: "Lowest gross (18 holes)", unit: "gross", lowerIsBetter: true },
  { id: "low_nett", label: "Lowest nett (18 holes)", unit: "nett", lowerIsBetter: true },
  { id: "drills", label: "Most drills completed", unit: "drills", lowerIsBetter: false },
  { id: "combines", label: "Most combines completed", unit: "combines", lowerIsBetter: false },
  { id: "lessons", label: "Most Library lessons", unit: "lessons", lowerIsBetter: false },
];

export const challengeMetric = (id: unknown) => CHALLENGE_METRICS.find((m) => m.id === id) ?? null;

export type Challenge = {
  id: string;
  title: string;
  description: string;
  mode: "auto" | "manual";
  metric: ChallengeMetric | null;
  unit: string;
  lowerIsBetter: boolean;
  startsOn: string;
  endsOn: string;
  resultsPostedAt: string | null;
};

export type ChallengeEntry = {
  challengeId: string;
  userId: string;
  score: number | null;
  done: boolean;
  note: string;
  status: ReviewStatus;
};

export type BoardRow = { userId: string; value: number | null; done: boolean };

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toChallenge(r: Row): Challenge {
  const metric = challengeMetric(r.metric);
  return {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    mode: r.mode === "manual" ? "manual" : "auto",
    metric: metric?.id ?? null,
    unit: str(r.unit) || metric?.unit || "",
    lowerIsBetter: metric ? metric.lowerIsBetter : r.lower_is_better === true,
    startsOn: str(r.starts_on),
    endsOn: str(r.ends_on),
    resultsPostedAt: r.results_posted_at ? str(r.results_posted_at) : null,
  };
}

function toEntry(r: Row): ChallengeEntry {
  return {
    challengeId: str(r.challenge_id),
    userId: str(r.user_id),
    score: num(r.score),
    done: r.done === true,
    note: str(r.note),
    status: (str(r.status) || "pending") as ReviewStatus,
  };
}

/** Today in Sydney as YYYY-MM-DD, matching how challenge dates are stored. */
export function sydneyToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

export function challengeState(c: Challenge, today = sydneyToday()): "upcoming" | "live" | "finished" {
  if (today < c.startsOn) return "upcoming";
  if (today > c.endsOn) return "finished";
  return "live";
}

export async function fetchChallenges(): Promise<{ challenges: Challenge[]; error: string | null }> {
  const { data, error } = await createClient()
    .from("community_challenges")
    .select("*")
    .order("ends_on", { ascending: false })
    .limit(30);
  if (error) return { challenges: [], error: communityError(error) };
  return { challenges: ((data ?? []) as Row[]).map(toChallenge), error: null };
}

export type NewChallenge = {
  title: string;
  description: string;
  mode: "auto" | "manual";
  metric: ChallengeMetric | null;
  unit: string;
  lowerIsBetter: boolean;
  startsOn: string;
  endsOn: string;
};

export async function createChallenge(c: NewChallenge): Promise<string | null> {
  const metric = c.mode === "auto" ? challengeMetric(c.metric) : null;
  const { error } = await createClient()
    .from("community_challenges")
    .insert({
      title: c.title.trim(),
      description: c.description.trim() || null,
      mode: c.mode,
      metric: metric?.id ?? null,
      unit: c.mode === "manual" ? c.unit.trim() || null : null,
      lower_is_better: metric ? metric.lowerIsBetter : c.lowerIsBetter,
      starts_on: c.startsOn,
      ends_on: c.endsOn,
    });
  return communityError(error);
}

export async function deleteChallenge(id: string): Promise<string | null> {
  const { error } = await createClient().from("community_challenges").delete().eq("id", id);
  return communityError(error);
}

/** Ranked leaderboard, best first. Manual challenges only include coach-approved entries. */
export async function fetchChallengeBoard(c: Challenge): Promise<{ rows: BoardRow[]; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("community_challenge_board", { p_challenge: c.id });
  if (error) return { rows: [], error: communityError(error) };
  let rows: BoardRow[] = ((data ?? []) as Row[]).map((r) => ({ userId: str(r.player_id), value: num(r.value), done: false }));

  if (c.mode === "manual") {
    const { data: entries } = await supabase
      .from("community_challenge_entries")
      .select("user_id, done")
      .eq("challenge_id", c.id)
      .eq("status", "approved");
    const done = new Set(((entries ?? []) as Row[]).filter((e) => e.done === true).map((e) => str(e.user_id)));
    rows = rows.map((r) => ({ ...r, done: done.has(r.userId) }));
  }

  rows.sort((a, b) => {
    if (a.value == null && b.value == null) return Number(b.done) - Number(a.done);
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return c.lowerIsBetter ? a.value - b.value : b.value - a.value;
  });
  return { rows, error: null };
}

export function formatChallengeValue(c: Challenge, value: number | null, done = false): string {
  if (value == null) return done ? "Done" : "–";
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (c.metric === "practice_hours") return `${shown}h`;
  return c.unit ? `${shown} ${c.unit}` : shown;
}

export async function fetchMyEntry(challengeId: string, userId: string): Promise<ChallengeEntry | null> {
  const { data } = await createClient()
    .from("community_challenge_entries")
    .select("*")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? toEntry(data as Row) : null;
}

export async function submitChallengeEntry(
  challengeId: string,
  userId: string,
  entry: { score: number | null; done: boolean; note: string },
): Promise<{ entry: ChallengeEntry | null; error: string | null }> {
  const { data, error } = await createClient()
    .from("community_challenge_entries")
    .upsert(
      {
        challenge_id: challengeId,
        user_id: userId,
        score: entry.score,
        done: entry.done,
        note: entry.note.trim() || null,
      },
      { onConflict: "challenge_id,user_id" },
    )
    .select("*")
    .single();
  if (error) return { entry: null, error: communityError(error) };
  return { entry: toEntry(data as Row), error: null };
}

export type PendingEntry = ChallengeEntry & { challengeTitle: string; unit: string };

export async function fetchPendingEntries(): Promise<{ entries: PendingEntry[]; people: Map<string, CommunityPerson> }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("community_challenge_entries")
    .select("*, community_challenges(title, unit)")
    .eq("status", "pending")
    .order("updated_at", { ascending: true });
  const entries = ((data ?? []) as Row[]).map((r) => {
    const ch = (r.community_challenges ?? {}) as Row;
    return { ...toEntry(r), challengeTitle: str(ch.title), unit: str(ch.unit) };
  });
  return { entries, people: await loadPeople(entries.map((e) => e.userId)) };
}

export async function reviewChallengeEntry(
  challengeId: string,
  userId: string,
  status: "approved" | "rejected",
): Promise<string | null> {
  const { error } = await createClient()
    .from("community_challenge_entries")
    .update({ status })
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);
  return communityError(error);
}

/** Posts the top three to the feed and marks the challenge as announced. */
export async function postChallengeResults(c: Challenge, rows: BoardRow[]): Promise<string | null> {
  const podium = rows
    .filter((r) => r.value != null || r.done)
    .slice(0, 3)
    .map((r) => ({ user_id: r.userId, display: formatChallengeValue(c, r.value, r.done) }));
  if (podium.length === 0) return "No results to post yet.";
  const supabase = createClient();
  const { error } = await supabase.from("community_posts").insert({
    kind: "challenge_result",
    meta: { challenge_id: c.id, title: c.title, podium },
  });
  if (error) return communityError(error);
  await supabase.from("community_challenges").update({ results_posted_at: new Date().toISOString() }).eq("id", c.id);
  return null;
}
