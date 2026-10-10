"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Loader2, RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CoachingSpaceSummary } from "@/lib/coachingFeed";
import {
  describeUsage,
  featureOf,
  fetchDrillTitles,
  fetchUsageEvents,
  isScreenView,
  itemOf,
  TOOL_LABELS,
  toolKeyOf,
  type DrillTitles,
  type ToolKey,
  type UsageEvent,
} from "@/lib/appUsage";
import { Avatar, timeAgo, useProfileNames } from "@/components/coaching/coachingUi";

const DAY_MS = 86400000;
const TREND_WEEKS = 8;
const FEED_PAGE = 30;

type Range = 7 | 30;

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <h3 className="text-sm font-bold text-stone-900">{title}</h3>
      {note && <p className="mt-0.5 text-[11px] text-stone-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BarList({ rows, empty }: { rows: { label: string; count: number; players: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-stone-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-stone-800">{r.label}</span>
            <span className="shrink-0 tabular-nums text-stone-500">
              <span className="font-semibold text-stone-900">{r.count}</span> · {r.players}{" "}
              {r.players === 1 ? "player" : "players"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-[#014421]" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type ToolRow = { key: ToolKey; label: string; uses: number; players: number; opens: number };

function ToolList({ rows }: { rows: ToolRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.uses));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-stone-800">{r.label}</span>
            <span className="shrink-0 tabular-nums text-stone-500">
              <span className="font-semibold text-stone-900">{r.uses}</span> {r.uses === 1 ? "use" : "uses"} ·{" "}
              {r.players} {r.players === 1 ? "player" : "players"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-[#014421]" style={{ width: `${(r.uses / max) * 100}%` }} />
          </div>
          {r.opens > 0 && (
            <p className="mt-0.5 text-[10px] text-stone-400">
              Page opened {r.opens} {r.opens === 1 ? "time" : "times"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function tally(events: UsageEvent[], keyOf: (e: UsageEvent) => string | null, limit = 12) {
  const map = new Map<string, { count: number; players: Set<string> }>();
  for (const e of events) {
    const key = keyOf(e);
    if (!key) continue;
    const row = map.get(key) ?? { count: 0, players: new Set<string>() };
    row.count += 1;
    row.players.add(e.user_id);
    map.set(key, row);
  }
  return [...map.entries()]
    .map(([label, r]) => ({ label, count: r.count, players: r.players.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function CoachingUsage({
  viewerId,
  spaces,
  onOpenSpace,
}: {
  viewerId: string;
  spaces: CoachingSpaceSummary[];
  onOpenSpace: (studentId: string, name: string) => void;
}) {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [drills, setDrills] = useState<DrillTitles>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(7);
  const [player, setPlayer] = useState<string | null>(null);
  const [showScreens, setShowScreens] = useState(false);
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE);
  const [showInactive, setShowInactive] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - TREND_WEEKS * 7 * DAY_MS);
      const [list, titles] = await Promise.all([fetchUsageEvents(createClient(), since), fetchDrillTitles()]);
      setDrills(titles);
      setEvents(list.filter((e) => e.user_id !== viewerId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load app usage.");
    } finally {
      setLoading(false);
    }
  }, [viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const spaceNames = useMemo(() => new Map(spaces.map((s) => [s.studentId, s.name] as const)), [spaces]);
  const names = useProfileNames(events.map((e) => e.user_id));
  const nameOf = useCallback(
    (id: string) => spaceNames.get(id) ?? names.get(id) ?? "Golfer",
    [spaceNames, names],
  );

  const inRange = useMemo(() => {
    const cutoff = Date.now() - range * DAY_MS;
    return events.filter((e) => Date.parse(e.at) >= cutoff);
  }, [events, range]);
  const actions = useMemo(() => inRange.filter((e) => !isScreenView(e)), [inRange]);
  const screens = useMemo(() => inRange.filter(isScreenView), [inRange]);
  const tools = useMemo<ToolRow[]>(
    () =>
      (Object.keys(TOOL_LABELS) as ToolKey[]).map((key) => {
        const uses = actions.filter((e) => toolKeyOf(e) === key);
        return {
          key,
          label: TOOL_LABELS[key],
          uses: uses.length,
          players: new Set(uses.map((e) => e.user_id)).size,
          opens: screens.filter((e) => e.detail === key).length,
        };
      }),
    [actions, screens],
  );
  const firstToolUseAt = useMemo(
    () => events.reduce<string | null>((min, e) => (toolKeyOf(e) && (!min || e.at < min) ? e.at : min), null),
    [events],
  );
  const activeIds = useMemo(() => new Set(inRange.map((e) => e.user_id)), [inRange]);
  const practiceMinutes = useMemo(
    () => actions.reduce((sum, e) => sum + (e.source === "practice" ? e.minutes : 0), 0),
    [actions],
  );

  const weekly = useMemo(() => {
    const buckets = Array.from({ length: TREND_WEEKS }, () => new Set<string>());
    const now = Date.now();
    for (const e of events) {
      const i = Math.floor((now - Date.parse(e.at)) / (7 * DAY_MS));
      if (i >= 0 && i < TREND_WEEKS) buckets[TREND_WEEKS - 1 - i].add(e.user_id);
    }
    return buckets.map((b) => b.size);
  }, [events]);
  const weeklyMax = Math.max(1, ...weekly);

  const features = useMemo(() => tally(actions, featureOf), [actions]);
  const topItems = useMemo(
    () =>
      tally(
        actions.filter(
          (e) =>
            (e.source === "practice" && featureOf(e) !== "Practice sessions") ||
            e.source === "skills_log" ||
            e.source === "drill_score",
        ),
        (e) => itemOf(e, drills),
        10,
      ),
    [actions, drills],
  );
  const topScreens = useMemo(() => tally(screens, (e) => itemOf(e, drills), 12), [screens, drills]);
  const firstScreenAt = useMemo(
    () => events.reduce<string | null>((min, e) => (isScreenView(e) && (!min || e.at < min) ? e.at : min), null),
    [events],
  );

  const players = useMemo(() => {
    const map = new Map<string, { last: string; count: number; features: Map<string, number> }>();
    for (const e of inRange) {
      const row = map.get(e.user_id) ?? { last: e.at, count: 0, features: new Map<string, number>() };
      if (e.at > row.last) row.last = e.at;
      if (!isScreenView(e)) {
        row.count += 1;
        const f = featureOf(e);
        row.features.set(f, (row.features.get(f) ?? 0) + 1);
      }
      map.set(e.user_id, row);
    }
    return [...map.entries()]
      .map(([id, r]) => ({
        id,
        last: r.last,
        count: r.count,
        top: [...r.features.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [inRange]);
  const inactive = useMemo(
    () => spaces.filter((s) => !s.space?.pending && !activeIds.has(s.studentId) && s.studentId !== viewerId),
    [spaces, activeIds, viewerId],
  );

  const feed = useMemo(
    () =>
      inRange.filter((e) => (showScreens || !isScreenView(e)) && (!player || e.user_id === player)),
    [inRange, showScreens, player],
  );

  const pickPlayer = (id: string) => {
    setPlayer(id);
    setFeedLimit(FEED_PAGE);
    requestAnimationFrame(() => feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl bg-white py-10 text-sm text-stone-500 shadow-sm ring-1 ring-stone-200">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading app usage…
      </div>
    );
  }
  if (error) {
    return <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>;
  }

  const totalPlayers = spaces.filter((s) => !s.space?.pending).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-stone-100 p-1" role="radiogroup" aria-label="Time range">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                range === r ? "bg-[#014421] text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded-full p-2 text-stone-500 hover:bg-stone-200 disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Active players", value: totalPlayers ? `${activeIds.size}/${totalPlayers}` : String(activeIds.size) },
          { label: "Actions", value: String(actions.length) },
          { label: "Practice hrs", value: String(Math.round((practiceMinutes / 60) * 10) / 10) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white px-2 py-3 shadow-sm ring-1 ring-stone-200">
            <p className="text-lg font-bold tabular-nums text-[#014421]">{s.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{s.label}</p>
          </div>
        ))}
      </div>

      <Card title="Weekly active players" note={`Players who did anything in the app, last ${TREND_WEEKS} weeks`}>
        <div className="flex h-24 items-end gap-1.5">
          {weekly.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold tabular-nums text-stone-600">{n}</span>
              <div
                className={`w-full rounded-t-md ${i === weekly.length - 1 ? "bg-[#FFA500]" : "bg-[#014421]"}`}
                style={{ height: `${Math.max(4, (n / weeklyMax) * 64)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-stone-400">
          <span>{TREND_WEEKS} weeks ago</span>
          <span>This week</span>
        </div>
      </Card>

      <Card title="What's getting used" note="Times each feature was used, and by how many players">
        <BarList rows={features} empty="No activity in this period." />
      </Card>

      <Card
        title="Tools"
        note={
          firstToolUseAt
            ? `Uses = pressed Play, once per player per 30 min. Counted since ${new Date(firstToolUseAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
            : "Uses = pressed Play, once per player per 30 min. Starts counting once players have this update"
        }
      >
        <ToolList rows={tools} />
      </Card>

      <Card title="Top drills & tests">
        <BarList rows={topItems} empty="No drills or tests logged in this period." />
      </Card>

      <Card
        title="Screens opened"
        note={
          firstScreenAt
            ? `Counted since ${new Date(firstScreenAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, once per player per 30 min`
            : "Starts counting once players open the app with this update"
        }
      >
        <BarList rows={topScreens} empty="No screens recorded yet." />
      </Card>

      <Card title="Players" note="Most recently active first. Tap a player to see what they've done.">
        {players.length === 0 ? (
          <p className="text-xs text-stone-500">No one has been active in this period.</p>
        ) : (
          <ul className="-mx-1 divide-y divide-stone-100">
            {players.map((p) => {
              const name = nameOf(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pickPlayer(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-stone-50 ${
                      player === p.id ? "bg-[#014421]/5" : ""
                    }`}
                  >
                    <Avatar name={name} userId={p.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-stone-900">{name}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {p.count} {p.count === 1 ? "action" : "actions"}
                        {p.top ? ` · mostly ${p.top.toLowerCase()}` : " · browsing only"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(p.last, true)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {inactive.length > 0 && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800"
              aria-expanded={showInactive}
            >
              {showInactive ? "Hide" : "Show"} {inactive.length} not active in the last {range} days
            </button>
            {showInactive && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {inactive.map((s) => (
                  <li key={s.studentId}>
                    <button
                      type="button"
                      onClick={() => onOpenSpace(s.studentId, s.name)}
                      className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-200"
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div ref={feedRef} className="scroll-mt-4">
        <Card title="Recent activity">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {player && (
              <button
                type="button"
                onClick={() => setPlayer(null)}
                className="inline-flex items-center gap-1 rounded-full bg-[#014421] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {nameOf(player)}
                <X className="h-3 w-3" aria-label="Show everyone" />
              </button>
            )}
            <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-stone-600">
              <input
                type="checkbox"
                checked={showScreens}
                onChange={(e) => setShowScreens(e.target.checked)}
                className="accent-[#014421]"
              />
              Include screens opened
            </label>
          </div>
          {feed.length === 0 ? (
            <div className="py-6 text-center">
              <Activity className="mx-auto h-7 w-7 text-stone-300" aria-hidden />
              <p className="mt-2 text-xs text-stone-500">Nothing in this period.</p>
            </div>
          ) : (
            <ul className="-mx-1 divide-y divide-stone-100">
              {feed.slice(0, feedLimit).map((e, i) => {
                const name = nameOf(e.user_id);
                return (
                  <li key={`${e.user_id}-${e.source}-${e.at}-${i}`} className="flex items-start gap-3 px-1 py-2">
                    <Avatar name={name} userId={e.user_id} size="sm" />
                    <span className="min-w-0 flex-1 text-xs leading-snug text-stone-700">
                      <span className="font-semibold text-stone-900">{name}</span> {describeUsage(e, drills)}
                      <span className="mt-0.5 block text-[11px] text-stone-400">{timeAgo(e.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {feed.length > feedLimit && (
            <button
              type="button"
              onClick={() => setFeedLimit((n) => n + FEED_PAGE)}
              className="mt-2 w-full rounded-xl bg-stone-100 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200"
            >
              Show more
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
