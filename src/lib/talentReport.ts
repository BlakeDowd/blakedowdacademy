import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultHandicapFromStats, type RoundStatRow } from "@/lib/roundStatsGoalInsight";
import {
  recentCombineAverages,
  scorePracticeHandicap,
  type BenchmarkOverrides,
  type CombineHandicap,
  type PracticeHandicap,
} from "@/lib/practiceHandicap";
import { GAME_AREAS, type GameArea } from "@/lib/practiceHandicapBenchmarks";
import { practiceSessionMinutesFromRow } from "@/lib/practiceSessionDuration";
import { listUserCombineCompletionEvents } from "@/lib/combineCompletionDetection";
import { LESSON_PRACTICE_TYPE } from "@/lib/coachLessons";
import {
  MOBILITY_AREAS,
  mobilityScreenConfig,
  mobilityTest,
  parseMobilityChecks,
  type MobilityArea,
} from "@/lib/mobilityScreenConfig";
import { createClient } from "@/lib/supabase/client";
import {
  ageFromDob,
  ageGroup,
  fetchTalentProfiles,
  type AgeGroup,
  type GroupMember,
  type Squad,
  type TalentProfile,
} from "@/lib/playerGroups";

export type Row = { user_id?: unknown } & Record<string, unknown>;

/** Everything the talent reports need about one group member. */
export type TalentPlayer = {
  id: string;
  name: string;
  age: number | null;
  dob: string | null;
  ageGroup: AgeGroup;
  squad: Squad | null;
  notes: string | null;
  startedOn: string | null;
  streak: number;
  lastActive: string | null;
  goalHandicap: number | null;
  initialHandicap: number | null;
  practice: Row[];
  logs: Row[];
  rounds: Row[];
  roundStats: Row[];
};

export const toNumber = (v: unknown): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const timeOf = (v: unknown): number => {
  const t = typeof v === "string" ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
};

export const rowTime = (r: Row) => timeOf(r.completed_at ?? r.created_at);

const ROUND_COLUMNS = "id, handicap, created_at, date, score, holes, course_name";
/** Added by 20261013160000_round_event_tiers.sql; rounds still load without them before it's run. */
const ROUND_EVENT_COLUMNS = "event_tier, event_name, course_rating, slope_rating, event_set_by";

/** Loads each member's practice, combines, rounds and profile. One query set per player keeps each under row limits. */
export async function loadTalentPlayers(
  supabase: SupabaseClient,
  members: GroupMember[],
  talent: Map<string, TalentProfile>,
): Promise<TalentPlayer[]> {
  const ids = members.map((m) => m.player_id);
  if (ids.length === 0) return [];
  const [profilesRes, goalsRes] = await Promise.all([
    supabase.from("profiles").select('id, full_name, "currentStreak", last_login_date, initial_handicap').in("id", ids),
    supabase.from("player_goals").select("user_id, current_handicap").in("user_id", ids),
  ]);
  const profiles = new Map(((profilesRes.data ?? []) as Row[]).map((p) => [String(p.id), p]));
  const goals = new Map(((goalsRes.data ?? []) as Row[]).map((g) => [String(g.user_id), g]));

  return Promise.all(
    members.map(async (m) => {
      const id = m.player_id;
      const roundsQuery = (columns: string) =>
        supabase.from("rounds").select(columns).eq("user_id", id).order("created_at", { ascending: false }).limit(300);
      const [practiceRes, logsRes, roundsRes, statsRes] = await Promise.all([
        supabase.from("practice").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1000),
        supabase.from("practice_logs").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(900),
        roundsQuery(`${ROUND_COLUMNS}, ${ROUND_EVENT_COLUMNS}`).then((res) => (res.error ? roundsQuery(ROUND_COLUMNS) : res)),
        supabase
          .from("round_stats")
          .select("handicap_index, played_at")
          .eq("user_id", id)
          .order("played_at", { ascending: false })
          .limit(300),
      ]);
      const profile = profiles.get(id);
      const t = talent.get(id);
      const age = ageFromDob(t?.date_of_birth);
      return {
        id,
        name: String(profile?.full_name || "Unknown player"),
        age,
        dob: t?.date_of_birth ?? null,
        ageGroup: ageGroup(age),
        squad: m.squad ?? null,
        notes: t?.notes ?? null,
        startedOn: m.started_on,
        streak: toNumber(profile?.currentStreak) ?? 0,
        lastActive: typeof profile?.last_login_date === "string" ? profile.last_login_date : null,
        goalHandicap: toNumber(goals.get(id)?.current_handicap),
        initialHandicap: toNumber(profile?.initial_handicap),
        practice: (practiceRes.data ?? []) as Row[],
        logs: (logsRes.data ?? []) as Row[],
        rounds: (roundsRes.data ?? []) as unknown as Row[],
        roundStats: (statsRes.data ?? []) as Row[],
      };
    }),
  );
}

const COHORT_TTL_MS = 5 * 60_000;
const cohortCache = new Map<string, { at: number; pending: Promise<TalentPlayer[]> }>();

export const cohortKey = (members: GroupMember[]) =>
  members
    .map((m) => `${m.player_id}:${m.started_on ?? ""}`)
    .sort()
    .join(",");

/** Reverses `cohortKey` (group ids aren't needed to load a cohort). */
export const membersFromKey = (key: string): GroupMember[] =>
  key
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [player_id, started] = part.split(":");
      return { group_id: "", player_id, started_on: started || null };
    });

/** Squads change without reloading anyone's data, so apply the latest ones from the group store. */
export function withSquads(players: TalentPlayer[], members: GroupMember[], groupIds: Set<string>): TalentPlayer[] {
  const squads = new Map<string, Squad | null>();
  for (const m of members) {
    if (groupIds.has(m.group_id) && !squads.get(m.player_id)) squads.set(m.player_id, m.squad ?? null);
  }
  return players.map((p) => ({ ...p, squad: squads.get(p.id) ?? null }));
}

/** Talent data for a set of players, shared between the group report and player cards for the session. */
export function loadTalentCohort(members: GroupMember[]): Promise<TalentPlayer[]> {
  const key = cohortKey(members);
  const cached = cohortCache.get(key);
  if (cached && Date.now() - cached.at < COHORT_TTL_MS) return cached.pending;
  const pending = (async () => {
    const talent = await fetchTalentProfiles(members.map((m) => m.player_id));
    return loadTalentPlayers(createClient(), members, talent);
  })();
  cohortCache.set(key, { at: Date.now(), pending });
  pending.catch(() => cohortCache.delete(key));
  return pending;
}

/** Call after a date of birth changes so ages are reloaded. */
export function clearTalentCohortCache() {
  cohortCache.clear();
}

/** Playing handicap as it stood at `atMs` (now when omitted), from the latest rounds before then. */
export function playingHandicapAt(p: TalentPlayer, atMs?: number): number | null {
  const cutoff = atMs ?? Infinity;
  const latest = <T extends Row>(rows: T[], at: (r: T) => number) =>
    rows
      .filter((r) => at(r) <= cutoff)
      .sort((a, b) => at(b) - at(a))
      .slice(0, 5);
  const stats = latest(p.roundStats, (r) => timeOf(r.played_at));
  const rounds = latest(p.rounds, (r) => timeOf(r.created_at ?? r.date));
  const fromRounds = defaultHandicapFromStats(
    stats as RoundStatRow[],
    rounds as { handicap?: number | null; created_at?: string | null }[],
  );
  if (fromRounds != null || atMs != null) return fromRounds;
  return p.goalHandicap ?? p.initialHandicap;
}

/** Practice handicap from the combines done up to `atMs` (now when omitted). */
export function practiceHandicapAt(p: TalentPlayer, overrides: BenchmarkOverrides, atMs?: number): PracticeHandicap {
  const before = (rows: Row[]) => (atMs == null ? rows : rows.filter((r) => timeOf(r.created_at) <= atMs));
  return scorePracticeHandicap(recentCombineAverages(p.id, before(p.practice), before(p.logs)), overrides);
}

export type ProgressPeriod = "3m" | "6m" | "12m" | "start";

export function periodStartMs(period: ProgressPeriod, startedOn: string | null): number | null {
  if (period === "start") {
    const t = startedOn ? new Date(`${startedOn}T00:00:00`).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  }
  const d = new Date();
  d.setMonth(d.getMonth() - (period === "3m" ? 3 : period === "6m" ? 6 : 12));
  return d.getTime();
}

export type CompareRow = {
  player: TalentPlayer;
  playing: number | null;
  practice: PracticeHandicap;
};

export function buildCompareRows(players: TalentPlayer[], overrides: BenchmarkOverrides): CompareRow[] {
  return players.map((player) => ({
    player,
    playing: playingHandicapAt(player),
    practice: practiceHandicapAt(player, overrides),
  }));
}

export function areaHandicap(practice: PracticeHandicap, area: GameArea): number | null {
  return practice.areas.find((a) => a.area === area)?.handicap ?? null;
}

export type ProgressRow = {
  player: TalentPlayer;
  playingNow: number | null;
  playingThen: number | null;
  practiceNow: number | null;
  practiceThen: number | null;
  /** Shots improved (positive = better); null when there's nothing to compare. */
  playingGain: number | null;
  practiceGain: number | null;
};

export function buildProgressRows(
  rows: CompareRow[],
  overrides: BenchmarkOverrides,
  period: ProgressPeriod,
): ProgressRow[] {
  return rows.map(({ player, playing, practice }) => {
    const since = periodStartMs(period, player.startedOn);
    const playingThen = since == null ? null : playingHandicapAt(player, since);
    const practiceThen = since == null ? null : practiceHandicapAt(player, overrides, since).overall;
    const gain = (then: number | null, now: number | null) => (then != null && now != null ? then - now : null);
    return {
      player,
      playingNow: playing,
      playingThen,
      practiceNow: practice.overall,
      practiceThen,
      playingGain: gain(playingThen, playing),
      practiceGain: gain(practiceThen, practice.overall),
    };
  });
}

export type CommitmentPeriod = "30d" | "90d" | "start";

export type CommitmentRow = {
  player: TalentPlayer;
  hours: number;
  activeDays: number;
  combines: number;
  lessons: number;
  rounds: number;
};

export function buildCommitmentRows(players: TalentPlayer[], period: CommitmentPeriod): CommitmentRow[] {
  return players.map((player) => {
    let from: number;
    if (period === "start") {
      from = periodStartMs("start", player.startedOn) ?? -Infinity;
    } else {
      from = Date.now() - (period === "30d" ? 30 : 90) * 86_400_000;
    }
    const practice = player.practice.filter((r) => rowTime(r) >= from);
    const days = new Set(
      practice.map((r) => {
        const d = new Date(rowTime(r));
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );
    const combines = listUserCombineCompletionEvents({
      userId: player.id,
      practiceSessions: player.practice,
      practiceLogs: player.logs,
    }).filter((e) => timeOf(e.at) >= from && e.label !== mobilityScreenConfig.testName);
    return {
      player,
      hours: practice.reduce(
        (sum, r) => sum + practiceSessionMinutesFromRow(r as Parameters<typeof practiceSessionMinutesFromRow>[0]) / 60,
        0,
      ),
      activeDays: days.size,
      combines: combines.length,
      lessons: practice.filter((r) => r.type === LESSON_PRACTICE_TYPE).length,
      rounds: player.rounds.filter((r) => timeOf(r.created_at ?? r.date) >= from).length,
    };
  });
}

export type RankingEntry = { player: TalentPlayer; combine: CombineHandicap };
export type CombineRanking = { id: string; label: string; area: GameArea; entries: RankingEntry[] };

/** Each combine's results across the group, best level first (the average of each player's last 3 attempts). */
export function buildCombineRankings(rows: CompareRow[]): CombineRanking[] {
  const byId = new Map<string, CombineRanking>();
  for (const { player, practice } of rows) {
    for (const area of practice.areas) {
      for (const combine of area.combines) {
        const ranking = byId.get(combine.id) ?? { id: combine.id, label: combine.label, area: area.area, entries: [] };
        ranking.entries.push({ player, combine });
        byId.set(combine.id, ranking);
      }
    }
  }
  const areaOrder = new Map(GAME_AREAS.map((a, i) => [a.id, i]));
  return [...byId.values()]
    .map((r) => ({ ...r, entries: r.entries.sort((a, b) => a.combine.handicap - b.combine.handicap) }))
    .sort((a, b) => (areaOrder.get(a.area)! - areaOrder.get(b.area)!) || b.entries.length - a.entries.length);
}

export type MobilityRow = {
  player: TalentPlayer;
  latest: { at: string; pct: number; change: number | null; pain: number; areas: Map<MobilityArea, number> } | null;
};

/** Each player's latest mobility screen: overall %, change on the one before, pain flags and % passed per area. */
export function buildMobilityRows(players: TalentPlayer[]): MobilityRow[] {
  return players.map((player) => {
    const screens = player.logs
      .filter((r) => r.log_type === mobilityScreenConfig.practiceLogType && toNumber(r.score) != null)
      .sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at));
    const last = screens[0];
    if (!last) return { player, latest: null };
    const pct = Math.round(toNumber(last.score)!);
    const prev = screens[1] ? Math.round(toNumber(screens[1].score)!) : null;
    const checks = parseMobilityChecks(last.strike_data) ?? [];
    const areas = new Map<MobilityArea, number>();
    for (const area of MOBILITY_AREAS) {
      const inArea = checks.filter((c) => mobilityTest(c.test)?.area === area);
      if (inArea.length) {
        areas.set(area, Math.round((inArea.filter((c) => c.result === "pass").length / inArea.length) * 100));
      }
    }
    return {
      player,
      latest: {
        at: String(last.created_at),
        pct,
        change: prev == null ? null : pct - prev,
        pain: checks.filter((c) => c.result === "pain").length,
        areas,
      },
    };
  });
}
