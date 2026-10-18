"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Flag, Flame, HandFist, PartyPopper, Sparkles, Trophy, Users } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { postSummary } from "@/components/community/CommunityPostCard";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import {
  countPendingCommunity,
  fetchCommunityFeed,
  isCommunityCoach,
  loadPeople,
  setKnuckle,
  timeAgo,
  type CommunityFeed,
  type CommunityPerson,
  type CommunityPost,
} from "@/lib/community";
import {
  challengeState,
  fetchChallengeBoard,
  fetchChallenges,
  formatChallengeValue,
  type BoardRow,
  type Challenge,
} from "@/lib/communityChallenges";

const ROUNDS_SHOWN = 3;
const ACTIVITY_SHOWN = 3;
const DAY = 86_400_000;

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const timeOf = (v: unknown) => {
  const t = new Date(str(v)).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Midnight six days ago, so the window always covers the last 7 days including today. */
function weekStartMs(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
}

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{children}</h3>
      {href && (
        <Link href={href} className="text-xs font-semibold text-[#FFA500] hover:underline">
          See all
        </Link>
      )}
    </div>
  );
}

function KnuckleButton({ post, me, onToggle }: { post: CommunityPost; me: string; onToggle: (p: CommunityPost) => void }) {
  const on = post.knuckles.includes(me);
  return (
    <button
      type="button"
      onClick={() => onToggle(post)}
      aria-pressed={on}
      aria-label={on ? "Remove knuckles" : "Give knuckles"}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold transition-colors ${
        on ? "bg-[#FFA500]/15 text-orange-700" : "bg-gray-50 text-gray-400 hover:text-orange-600"
      }`}
    >
      <HandFist className="h-3.5 w-3.5" aria-hidden />
      {post.knuckles.length > 0 ? post.knuckles.length : ""}
    </button>
  );
}

/** Home page Community: this week's numbers, challenge of the week, latest rounds and what people are up to. */
export function HomeCommunityCard() {
  const { user } = useAuth();
  const me = user?.id ?? "";
  const isCoach = isCommunityCoach(user);
  const { communityRounds, practiceSessions, drillSessions } = useStats();

  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [feedMissing, setFeedMissing] = useState(false);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [daysLeft, setDaysLeft] = useState(0);
  const [pending, setPending] = useState(0);
  const [people, setPeople] = useState<Map<string, CommunityPerson>>(new Map());

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void Promise.all([fetchCommunityFeed(40), fetchChallenges()]).then(async ([f, c]) => {
      const live = c.challenges.find((x) => challengeState(x) === "live");
      const b = live ? await fetchChallengeBoard(live) : { rows: [] };
      if (cancelled) return;
      setFeed(f.feed);
      setFeedMissing(Boolean(f.error));
      setChallenges(c.challenges);
      setBoard(b.rows);
      setDaysLeft(
        live ? Math.max(0, Math.ceil((new Date(`${live.endsOn}T23:59:59`).getTime() - Date.now()) / DAY)) : 0,
      );
    });
    if (isCoach) void countPendingCommunity().then((n) => !cancelled && setPending(n));
    return () => {
      cancelled = true;
    };
  }, [me, isCoach]);

  const live = challenges.find((c) => challengeState(c) === "live") ?? null;
  const upcoming = challenges.filter((c) => challengeState(c) === "upcoming").sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null;
  const lastDrawn = challenges.find((c) => c.winnerId) ?? null;

  const week = useMemo(() => {
    const from = weekStartMs();
    const minutes = new Map<string, number>();
    for (const p of (practiceSessions ?? []) as unknown as Row[]) {
      if (timeOf(p.created_at ?? p.practice_date) < from) continue;
      const uid = str(p.user_id);
      if (uid) minutes.set(uid, (minutes.get(uid) ?? 0) + (num(p.duration_minutes) ?? 0));
    }
    const roundsThisWeek = ((communityRounds ?? []) as unknown as Row[]).filter(
      (r) => timeOf(r.date || r.created_at) >= from,
    );
    const drillsThisWeek = ((drillSessions ?? []) as unknown as Row[]).filter((d) => timeOf(d.first_logged_at ?? d.day) >= from);
    const active = new Set<string>([
      ...[...minutes.entries()].filter(([, m]) => m > 0).map(([id]) => id),
      ...roundsThisWeek.map((r) => str(r.user_id)),
      ...drillsThisWeek.map((d) => str(d.user_id)),
    ]);
    active.delete("");
    const totalMinutes = [...minutes.values()].reduce((a, b) => a + b, 0);
    const topPractice = [...minutes.entries()]
      .filter(([, m]) => m > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      hours: Math.round(totalMinutes / 6) / 10,
      rounds: roundsThisWeek.length,
      drills: drillsThisWeek.length,
      players: active.size,
      topPractice,
    };
  }, [practiceSessions, communityRounds, drillSessions]);

  const latestRounds = useMemo(
    () =>
      ((communityRounds ?? []) as unknown as Row[])
        .filter((r) => num(r.score) != null && r.user_id)
        .sort((a, b) => timeOf(b.date) - timeOf(a.date) || timeOf(b.created_at) - timeOf(a.created_at))
        .slice(0, ROUNDS_SHOWN),
    [communityRounds],
  );

  const roundPosts = useMemo(() => {
    const map = new Map<string, CommunityPost>();
    for (const p of feed?.posts ?? []) if (p.kind === "round" && p.status === "approved") map.set(str(p.meta.round_id), p);
    return map;
  }, [feed]);

  const activity = (feed?.posts ?? [])
    .filter((p) => p.status === "approved" && p.kind !== "round" && p.kind !== "challenge")
    .slice(0, ACTIVITY_SHOWN);

  const idsKey = [
    ...latestRounds.map((r) => str(r.user_id)),
    ...week.topPractice.map(([id]) => id),
    ...board.slice(0, 3).map((r) => r.userId),
    lastDrawn?.winnerId ?? "",
  ]
    .filter(Boolean)
    .sort()
    .join(",");
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void loadPeople(idsKey.split(",")).then((map) => !cancelled && setPeople(map));
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const person = (id: string) => people.get(id) ?? feed?.people.get(id);
  const firstName = (id: string) => (id === me ? "You" : (person(id)?.name.split(" ")[0] ?? "Golfer"));

  const toggleKnuckle = async (post: CommunityPost) => {
    const on = !post.knuckles.includes(me);
    const next = { ...post, knuckles: on ? [...post.knuckles, me] : post.knuckles.filter((id) => id !== me) };
    const swap = (p: CommunityPost) => setFeed((f) => (f ? { ...f, posts: f.posts.map((x) => (x.id === p.id ? p : x)) } : f));
    swap(next);
    if (await setKnuckle(post.id, me, on)) swap(post);
  };

  const myRank = board.findIndex((r) => r.userId === me);

  return (
    <div className="mb-6 w-full px-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Users className="h-4 w-4 text-[#014421]" aria-hidden />
            Community
          </h2>
          <Link href="/community" className="flex items-center gap-1.5 text-sm font-semibold text-[#FFA500] hover:underline">
            {isCoach && pending > 0 && (
              <span className="rounded-full bg-[#FFA500] px-2 py-0.5 text-[11px] font-bold text-white">{pending} to approve</span>
            )}
            Open
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {/* This week across the academy */}
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {[
            { label: "Practice", value: `${week.hours}h` },
            { label: "Rounds", value: week.rounds },
            { label: "Drills", value: week.drills },
            { label: "Players", value: week.players },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-stone-50 px-1 py-2">
              <p className="text-base font-bold tabular-nums text-[#014421]">{s.value}</p>
              <p className="text-[10px] font-medium text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-gray-400">The academy · last 7 days</p>

        {/* Challenge of the week */}
        <SectionTitle href={live ? "/community?tab=challenges" : undefined}>Challenge of the week</SectionTitle>
        {live ? (
          <Link href="/community?tab=challenges" className="block rounded-xl bg-[#014421] p-3 text-white">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{live.title}</p>
                {live.description && <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{live.description}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                <Clock className="h-3 w-3" aria-hidden />
                {daysLeft === 0 ? "Last day" : `${daysLeft}d left`}
              </span>
            </div>
            {board.length > 0 ? (
              <ol className="mt-2.5 space-y-1">
                {board.slice(0, 3).map((r, i) => (
                  <li key={r.userId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                    <ProfileAvatar picture={person(r.userId)?.picture} name={person(r.userId)?.name} size={22} />
                    <span className="min-w-0 flex-1 truncate font-medium">{firstName(r.userId)}</span>
                    <span className="font-bold tabular-nums text-[#FFC966]">{formatChallengeValue(live, r.value, r.done)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-white/75">No scores yet. Get in early!</p>
            )}
            {myRank >= 3 && <p className="mt-1.5 text-xs font-semibold text-[#FFC966]">You&apos;re #{myRank + 1}</p>}
            <p className="mt-2 border-t border-white/15 pt-1.5 text-[11px] text-white/70">
              Winner drawn at random from everyone who takes part.
            </p>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#014421]/25 bg-[#014421]/[0.03] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
              <Sparkles className="h-5 w-5 text-[#014421]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">{upcoming ? upcoming.title : "Coming soon"}</p>
              <p className="text-xs text-gray-500">
                {upcoming
                  ? `Starts ${new Date(`${upcoming.startsOn}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}`
                  : "A new challenge is on its way. Keep practising!"}
              </p>
            </div>
            {isCoach && !upcoming && (
              <Link href="/community?tab=challenges" className="shrink-0 rounded-lg bg-[#014421] px-2.5 py-1.5 text-xs font-bold text-white">
                Set one
              </Link>
            )}
          </div>
        )}
        {lastDrawn?.winnerId && (
          <Link
            href="/community?tab=challenges"
            className="mt-2 flex items-center gap-2 rounded-xl bg-[#FFA500]/10 px-3 py-2 text-xs text-orange-900"
          >
            <PartyPopper className="h-4 w-4 shrink-0 text-[#FFA500]" aria-hidden />
            <ProfileAvatar picture={person(lastDrawn.winnerId)?.picture} name={person(lastDrawn.winnerId)?.name} size={22} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold">{lastDrawn.winnerId === me ? "You" : (person(lastDrawn.winnerId)?.name ?? "Golfer")}</span>{" "}
              won {lastDrawn.title}
            </span>
          </Link>
        )}

        {/* Latest rounds */}
        <SectionTitle href="/community">Latest rounds</SectionTitle>
        {latestRounds.length === 0 ? (
          <p className="text-sm text-gray-500">No rounds shared yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {latestRounds.map((r) => {
              const uid = str(r.user_id);
              const score = num(r.score);
              const handicap = num(r.handicap);
              const nett = score != null && handicap != null ? Math.round(score - handicap) : null;
              const post = roundPosts.get(str(r.id));
              return (
                <li key={str(r.id) || `${uid}-${str(r.created_at)}`} className="flex items-center gap-3 py-2">
                  <ProfileAvatar picture={person(uid)?.picture} name={person(uid)?.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{person(uid)?.name ?? "Golfer"}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-gray-400">
                      <Flag className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{str(r.course) || "Round"}</span>
                      <span className="shrink-0">· {timeAgo(str(r.date || r.created_at))}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold leading-none tabular-nums text-[#FFA500]">{score}</p>
                    {nett != null && <p className="text-[10px] text-gray-400">Nett {nett}</p>}
                  </div>
                  {post && me && <KnuckleButton post={post} me={me} onToggle={(p) => void toggleKnuckle(p)} />}
                </li>
              );
            })}
          </ul>
        )}

        {/* Most practice this week */}
        {week.topPractice.length > 0 && (
          <>
            <SectionTitle>Putting in the hours</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5">
              {week.topPractice.map(([uid, minutes], i) => (
                <div key={uid} className="flex flex-col items-center rounded-xl bg-stone-50 px-1 py-2 text-center">
                  <div className="relative">
                    <ProfileAvatar picture={person(uid)?.picture} name={person(uid)?.name} size={36} />
                    {i === 0 && (
                      <Flame className="absolute -right-1.5 -top-1.5 h-4 w-4 fill-[#FFA500] text-[#FFA500]" aria-hidden />
                    )}
                  </div>
                  <p className="mt-1 w-full truncate text-xs font-semibold text-gray-800">{firstName(uid)}</p>
                  <p className="text-[11px] font-bold tabular-nums text-[#014421]">{Math.round(minutes / 6) / 10}h</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Wins and posts */}
        {!feedMissing && activity.length > 0 && (
          <>
            <SectionTitle href="/community">Wins & posts</SectionTitle>
            <ul className="divide-y divide-gray-100">
              {activity.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <ProfileAvatar picture={person(p.authorId)?.picture} name={person(p.authorId)?.name} size={30} />
                  <Link href="/community" className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">
                      <span className="font-semibold">{firstName(p.authorId)}</span>
                      {p.kind === "post" ? ": " : " "}
                      <span className="text-gray-600">{postSummary(p)}</span>
                    </p>
                    <p className="text-[11px] text-gray-400">{timeAgo(p.createdAt)}</p>
                  </Link>
                  {me && <KnuckleButton post={p} me={me} onToggle={(x) => void toggleKnuckle(x)} />}
                </li>
              ))}
            </ul>
          </>
        )}

        <Link
          href="/community"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-2.5 text-sm font-bold text-white"
        >
          <Trophy className="h-4 w-4 text-[#FFC966]" aria-hidden />
          Open the community
        </Link>
      </section>
    </div>
  );
}
