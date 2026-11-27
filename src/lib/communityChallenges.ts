import { createClient } from "@/lib/supabase/client";
import { communityError, loadPeople, type CommunityPerson, type ReviewStatus } from "@/lib/community";

export type ChallengeMetric = "practice_hours" | "rounds" | "low_gross" | "low_nett" | "drills" | "combines" | "lessons";

/** Auto-scored challenges, worked out from what players log in the app. */
export const CHALLENGE_METRICS: {
  id: ChallengeMetric;
  label: string;
  shortLabel: string;
  unit: string;
  lowerIsBetter: boolean;
}[] = [
  { id: "combines", label: "Most combines completed", shortLabel: "Combines", unit: "combines", lowerIsBetter: false },
  { id: "drills", label: "Most drills completed", shortLabel: "Drills", unit: "drills", lowerIsBetter: false },
  { id: "practice_hours", label: "Most practice hours (self-logged)", shortLabel: "Practice hours", unit: "h", lowerIsBetter: false },
  { id: "rounds", label: "Most rounds played", shortLabel: "Rounds", unit: "rounds", lowerIsBetter: false },
  { id: "low_gross", label: "Lowest gross (18 holes)", shortLabel: "Low gross", unit: "gross", lowerIsBetter: true },
  { id: "low_nett", label: "Lowest nett (18 holes)", shortLabel: "Low nett", unit: "nett", lowerIsBetter: true },
  { id: "lessons", label: "Most Library lessons", shortLabel: "Lessons", unit: "lessons", lowerIsBetter: false },
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
  winnerId: string | null;
  winnerDrawnAt: string | null;
  entrantCount: number | null;
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
    winnerId: r.winner_id ? str(r.winner_id) : null,
    winnerDrawnAt: r.winner_drawn_at ? str(r.winner_drawn_at) : null,
    entrantCount: num(r.entrant_count),
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

/** Next Mon–Sun in Sydney (skips to the following Monday if today is already Monday). */
export function nextWeekRange(today = sydneyToday()): { startsOn: string; endsOn: string } {
  const d = new Date(`${today}T12:00:00`);
  const day = d.getDay(); // 0 Sun … 1 Mon
  const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const startsOn = `${y}-${m}-${dd}`;
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const ey = end.getFullYear();
  const em = String(end.getMonth() + 1).padStart(2, "0");
  const ed = String(end.getDate()).padStart(2, "0");
  return { startsOn, endsOn: `${ey}-${em}-${ed}` };
}

export function challengeState(c: Challenge, today = sydneyToday()): "upcoming" | "live" | "finished" {
  if (today < c.startsOn) return "upcoming";
  if (today > c.endsOn) return "finished";
  return "live";
}

/** How long the home/community winner announcement stays up after the draw. */
export const WINNER_ANNOUNCE_MS = 7 * 86_400_000;

export function winnerAnnounceDismissKey(c: Pick<Challenge, "id" | "winnerDrawnAt">): string {
  return `challengeWinnerAnnounceDismissed:${c.id}:${c.winnerDrawnAt ?? ""}`;
}

/** True while the draw is within the 7-day announcement window. */
export function isWinnerAnnounceActive(c: Challenge, now = Date.now()): boolean {
  if (!c.winnerId || !c.winnerDrawnAt) return false;
  const drawn = Date.parse(c.winnerDrawnAt);
  if (!Number.isFinite(drawn)) return false;
  return now - drawn < WINNER_ANNOUNCE_MS && now >= drawn;
}

/** Most recent drawn challenge still inside the 7-day announcement window. */
export function latestActiveWinnerAnnouncement(challenges: Challenge[], now = Date.now()): Challenge | null {
  let best: Challenge | null = null;
  let bestAt = 0;
  for (const c of challenges) {
    if (!isWinnerAnnounceActive(c, now) || !c.winnerDrawnAt) continue;
    const at = Date.parse(c.winnerDrawnAt);
    if (!Number.isFinite(at)) continue;
    if (!best || at > bestAt) {
      best = c;
      bestAt = at;
    }
  }
  return best;
}

/** Whole days left in the announcement window (1–7), or 0 when expired. */
export function winnerAnnounceDaysLeft(c: Challenge, now = Date.now()): number {
  if (!c.winnerDrawnAt) return 0;
  const drawn = Date.parse(c.winnerDrawnAt);
  if (!Number.isFinite(drawn)) return 0;
  const leftMs = drawn + WINNER_ANNOUNCE_MS - now;
  if (leftMs <= 0) return 0;
  return Math.max(1, Math.ceil(leftMs / 86_400_000));
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

const DRAW_ERRORS: Record<string, string> = {
  already_drawn: "A winner has already been drawn for this challenge.",
  not_finished: "You can draw a winner once the challenge has finished.",
  no_entrants: "Nobody took part, so there's no one to draw.",
  coach_only: "Only coaches can draw a winner.",
};

/**
 * Draws a random winner from everyone on the leaderboard, records it and posts it (with the top three) to the feed.
 * The draw happens in the database so it can only be done once.
 */
export async function drawChallengeWinner(
  c: Challenge,
  rows: BoardRow[],
): Promise<{ winnerId: string | null; error: string | null }> {
  const podium = rows
    .filter((r) => r.value != null || r.done)
    .slice(0, 3)
    .map((r) => ({ user_id: r.userId, display: formatChallengeValue(c, r.value, r.done) }));
  const { data, error } = await createClient().rpc("community_draw_winner", { p_challenge: c.id, p_podium: podium });
  if (error) {
    const known = Object.keys(DRAW_ERRORS).find((k) => error.message?.includes(k));
    if (known) return { winnerId: null, error: DRAW_ERRORS[known] };
    if (error.code === "PGRST202" || /community_draw_winner/.test(error.message ?? "")) {
      return { winnerId: null, error: "Run supabase/migrations/20261013200000_challenge_draw.sql in Supabase first." };
    }
    return { winnerId: null, error: communityError(error) };
  }
  return { winnerId: data ? str(data) : null, error: null };
}
