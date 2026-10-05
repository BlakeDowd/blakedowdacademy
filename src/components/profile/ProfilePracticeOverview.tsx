"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flame,
  PlayCircle,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import { fetchDrillsCatalogRows } from "@/lib/fetchDrillsCatalog";
import { fetchMyLibraryCompletions, type LibraryCompletionRow } from "@/lib/libraryCompletions";
import {
  fetchAllDrillRecords,
  formatDrillScore,
  summarizeDrillProgress,
  type DrillRecord,
} from "@/lib/drillPersonalBests";
import {
  PRACTICE_AREAS,
  buildPracticeActivity,
  formatMinutes,
  itemsInRange,
  localDayKey,
  minutesByArea,
  practiceStreakDays,
  summarizePractice,
  type DrillCatalogEntry,
  type PracticeActivityItem,
  type PracticeActivityKind,
  type PracticeRange,
} from "@/lib/practiceActivity";
import { buildGoalPracticePlan } from "@/lib/practiceVsGoalsModel";
import type { PlayerGoalRow } from "@/types/playerGoals";

const CARD = "rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6";

const RANGE_OPTIONS: { id: PracticeRange; label: string }[] = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All time" },
];

const KIND_STYLE: Record<PracticeActivityKind, { label: string; plural: string; icon: typeof Check; badge: string }> = {
  drill: { label: "Drill", plural: "Drills", icon: Check, badge: "bg-[#014421]/10 text-[#014421]" },
  video: { label: "Video", plural: "Videos", icon: PlayCircle, badge: "bg-red-50 text-red-600" },
  practice: { label: "Practice", plural: "Practice", icon: Clock, badge: "bg-orange-50 text-orange-600" },
  combine: { label: "Combine", plural: "Combines", icon: Target, badge: "bg-sky-50 text-sky-700" },
};

const FEED_PAGE = 12;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthStats = {
  month: number;
  minutes: number;
  activities: number;
  drills: number;
  videos: number;
  activeDays: number;
};

function statsForMonth(items: readonly PracticeActivityItem[], year: number, month: number): MonthStats {
  const stats: MonthStats = { month, minutes: 0, activities: 0, drills: 0, videos: 0, activeDays: 0 };
  const days = new Set<string>();
  for (const i of items) {
    const d = new Date(i.at);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    stats.minutes += i.minutes;
    stats.activities += 1;
    if (i.kind === "drill") stats.drills += 1;
    if (i.kind === "video") stats.videos += 1;
    days.add(localDayKey(d));
  }
  stats.activeDays = days.size;
  return stats;
}

function formatHoursShort(minutes: number): string {
  const h = minutes / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1).replace(/\.0$/, "");
}

function ComparisonLine({
  label,
  current,
  previous,
  metric,
}: {
  label: string;
  current: MonthStats;
  previous: MonthStats;
  metric: "time" | "activities";
}) {
  const diff = metric === "time" ? current.minutes - previous.minutes : current.activities - previous.activities;
  const prevText = metric === "time" ? formatMinutes(previous.minutes) : `${previous.activities}`;
  const diffText =
    metric === "time"
      ? formatMinutes(Math.abs(diff))
      : `${Math.abs(diff)} activit${Math.abs(diff) === 1 ? "y" : "ies"}`;
  return (
    <p className="flex items-center justify-between gap-2">
      <span>
        {label} <span className="text-stone-400">({prevText})</span>
      </span>
      <span
        className={`flex items-center gap-0.5 font-semibold ${
          diff > 0 ? "text-green-700" : diff < 0 ? "text-red-600" : "text-stone-500"
        }`}
      >
        {diff > 0 ? (
          <TrendingUp className="h-3 w-3" aria-hidden />
        ) : diff < 0 ? (
          <TrendingDown className="h-3 w-3" aria-hidden />
        ) : null}
        {diff === 0 ? "Same" : `${diff > 0 ? "+" : "−"}${diffText}`}
      </span>
    </p>
  );
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayHeading(key: string): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === localDayKey(today)) return "Today";
  if (key === localDayKey(yesterday)) return "Yesterday";
  return parseDayKey(key).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function shortDate(at: string): string {
  const d = new Date(at);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

function lastActiveLabel(items: readonly PracticeActivityItem[]): string | null {
  if (items.length === 0) return null;
  const heading = dayHeading(localDayKey(items[0].at));
  return heading === "Today" || heading === "Yesterday" ? heading.toLowerCase() : heading;
}

function AreaChip({ area }: { area: string }) {
  return (
    <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
      {area}
    </span>
  );
}

export function ProfilePracticeOverview({ playerGoalRow }: { playerGoalRow: PlayerGoalRow | null }) {
  const { user } = useAuth();
  const { practiceSessions, practiceLogs } = useStats();
  const userId = user?.id ?? null;

  const [range, setRange] = useState<PracticeRange>("week");
  const [feedFilter, setFeedFilter] = useState<PracticeActivityKind | "all">("all");
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE);
  const [showAllDrills, setShowAllDrills] = useState(false);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());
  const [chartMetric, setChartMetric] = useState<"time" | "activities">("time");
  const [chartMonth, setChartMonth] = useState<number | null>(null);
  const [lessons, setLessons] = useState<LibraryCompletionRow[]>([]);
  const [catalog, setCatalog] = useState<Map<string, DrillCatalogEntry>>(new Map());
  const [records, setRecords] = useState<DrillRecord[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const [lessonRows, catalogRows, recordRows] = await Promise.all([
        fetchMyLibraryCompletions(userId),
        fetchDrillsCatalogRows(),
        fetchAllDrillRecords(createClient(), userId).catch(() => [] as DrillRecord[]),
      ]);
      if (cancelled) return;
      const map = new Map<string, DrillCatalogEntry>();
      for (const row of catalogRows) {
        const entry = {
          title: String(row.drill_name || row.title || "").trim(),
          category: String(row.category || "").trim(),
        };
        if (!entry.title) continue;
        if (row.id != null) map.set(String(row.id), entry);
        if (row.drill_id != null) map.set(String(row.drill_id), entry);
      }
      setLessons(lessonRows);
      setCatalog(map);
      setRecords(recordRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const allItems = useMemo(
    () =>
      userId
        ? buildPracticeActivity({
            userId,
            practiceSessions,
            practiceLogs,
            libraryCompletions: lessons,
            drillCatalog: catalog,
          })
        : [],
    [userId, practiceSessions, practiceLogs, lessons, catalog],
  );
  const rangeItems = useMemo(() => itemsInRange(allItems, range), [allItems, range]);
  const summary = useMemo(() => summarizePractice(rangeItems), [rangeItems]);
  const areaMinutes = useMemo(() => minutesByArea(rangeItems), [rangeItems]);
  const streak = useMemo(() => practiceStreakDays(allItems), [allItems]);
  const goalPlan = useMemo(() => buildGoalPracticePlan(playerGoalRow), [playerGoalRow]);
  const goalWeeks = range === "week" ? 1 : range === "month" ? 30 / 7 : 0;
  const goalMinutes = goalPlan && goalWeeks ? goalPlan.weeklyHours * 60 * goalWeeks : 0;

  const areaRows = useMemo(() => {
    const rows = PRACTICE_AREAS.map((area) => ({
      area,
      minutes: areaMinutes[area],
      goal: goalPlan && goalWeeks ? (goalPlan.hours[area] ?? 0) * 60 * goalWeeks : 0,
    })).filter((r) => r.minutes > 0 || r.goal > 0);
    rows.sort((a, b) => b.minutes - a.minutes || b.goal - a.goal);
    return rows;
  }, [areaMinutes, goalPlan, goalWeeks]);
  const areaScale = Math.max(1, ...areaRows.map((r) => Math.max(r.minutes, r.goal)));

  const feedCounts = useMemo(() => {
    const c: Record<PracticeActivityKind, number> = { drill: 0, video: 0, practice: 0, combine: 0 };
    for (const i of allItems) c[i.kind] += 1;
    return c;
  }, [allItems]);
  const feedItems = useMemo(
    () => (feedFilter === "all" ? allItems : allItems.filter((i) => i.kind === feedFilter)),
    [allItems, feedFilter],
  );
  const feedGroups = useMemo(() => {
    const groups: { key: string; items: (PracticeActivityItem & { repeats: number })[] }[] = [];
    for (const item of feedItems.slice(0, feedLimit)) {
      const key = localDayKey(item.at);
      let group = groups[groups.length - 1];
      if (group?.key !== key) {
        group = { key, items: [] };
        groups.push(group);
      }
      const prev = group.items[group.items.length - 1];
      if (prev && prev.kind === item.kind && prev.title === item.title) {
        prev.repeats += 1;
        prev.minutes += item.minutes;
      } else {
        group.items.push({ ...item, repeats: 1 });
      }
    }
    return groups;
  }, [feedItems, feedLimit]);

  const yearBounds = useMemo(() => {
    const max = new Date().getFullYear();
    let min = max;
    for (const i of allItems) min = Math.min(min, new Date(i.at).getFullYear());
    return { min, max };
  }, [allItems]);

  const monthly = useMemo(
    () => Array.from({ length: 12 }, (_, m) => statsForMonth(allItems, chartYear, m)),
    [allItems, chartYear],
  );

  const now = new Date();
  const isCurrentYear = chartYear === now.getFullYear();
  const metricValue = (m: MonthStats) => (chartMetric === "time" ? m.minutes : m.activities);
  const chartMax = Math.max(1, ...monthly.map(metricValue));
  const bestMonth = monthly.reduce<MonthStats | null>(
    (best, m) => (metricValue(m) > 0 && (!best || metricValue(m) > metricValue(best)) ? m : best),
    null,
  );
  const selectedMonth = chartMonth ?? (isCurrentYear ? now.getMonth() : (bestMonth?.month ?? 11));
  const selected = monthly[selectedMonth];
  const prevMonthStats = selectedMonth > 0 ? monthly[selectedMonth - 1] : statsForMonth(allItems, chartYear - 1, 11);
  const lastYearStats = statsForMonth(allItems, chartYear - 1, selectedMonth);
  const yearTotals = monthly.reduce(
    (acc, m) => ({ minutes: acc.minutes + m.minutes, activities: acc.activities + m.activities }),
    { minutes: 0, activities: 0 },
  );

  const drillRows = useMemo(() => {
    const byKey = new Map<string, { key: string; title: string; area: string | null; count: number; lastAt: string }>();
    for (const i of allItems) {
      if (i.kind !== "drill" || !i.refId) continue;
      const row = byKey.get(i.refId);
      if (row) row.count += 1;
      else byKey.set(i.refId, { key: i.refId, title: i.title, area: i.area, count: 1, lastAt: i.at });
    }
    for (const r of records) {
      if (byKey.has(r.drillKey)) continue;
      const entry = catalog.get(r.drillKey);
      byKey.set(r.drillKey, {
        key: r.drillKey,
        title: entry?.title || "Drill",
        area: entry?.category || null,
        count: 0,
        lastAt: r.logs[0]?.created_at ?? "",
      });
    }
    const recordByKey = new Map(records.map((r) => [r.drillKey, r]));
    return [...byKey.values()]
      .map((row) => {
        const record = recordByKey.get(row.key);
        const progress = record ? summarizeDrillProgress(record.logs, record.lowerIsBetter) : null;
        const first = record?.logs[record.logs.length - 1]?.score;
        const gain =
          record && progress && first != null && record.logs.length > 1
            ? record.lowerIsBetter
              ? first - progress.best
              : progress.best - first
            : null;
        return { ...row, record, progress, gain };
      })
      .sort((a, b) => b.count - a.count || (b.progress?.count ?? 0) - (a.progress?.count ?? 0));
  }, [allItems, records, catalog]);

  if (!userId) return null;

  const hasAnything = allItems.length > 0 || records.length > 0;
  const lastActive = lastActiveLabel(allItems);
  const goalPct = goalMinutes > 0 ? Math.min(100, Math.round((summary.minutes / goalMinutes) * 100)) : 0;

  return (
    <div className="space-y-4">
      <section className={CARD} aria-labelledby="practice-overview-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="practice-overview-heading" className="text-base font-semibold tracking-tight text-stone-900">
            Your practice
          </h2>
          <div className="flex rounded-full bg-stone-100 p-0.5" role="tablist" aria-label="Time range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={range === opt.id}
                onClick={() => setRange(opt.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  range === opt.id ? "bg-white text-[#014421] shadow-sm" : "text-stone-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-[#014421] to-[#0b6634] p-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Time practised</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{formatMinutes(summary.minutes)}</p>
          {goalMinutes > 0 ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className={`h-full rounded-full ${goalPct >= 100 ? "bg-[#FFA500]" : "bg-white"}`}
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-white/80">
                {goalPct}% of your {formatMinutes(goalMinutes)} {range === "week" ? "weekly" : "monthly"} goal
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-white/70">
              {summary.activeDays} active day{summary.activeDays === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              { kind: "drill", value: summary.drills },
              { kind: "video", value: summary.videos },
              { kind: "combine", value: summary.combines },
            ] as const
          ).map(({ kind, value }) => {
            const style = KIND_STYLE[kind];
            const Icon = style.icon;
            return (
              <div key={kind} className="rounded-2xl bg-stone-50 p-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${style.badge}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <p className="mt-2 text-xl font-bold tabular-nums text-stone-900">{value}</p>
                <p className="text-[11px] font-medium text-stone-500">
                  {kind === "drill" ? "Drills done" : kind === "video" ? "Videos watched" : "Combine tests"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-orange-50 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <Flame className={`h-4 w-4 ${streak > 0 ? "text-[#FFA500]" : "text-stone-300"}`} aria-hidden />
            {streak > 0 ? `${streak}-day streak` : "No streak yet"}
          </span>
          <span className="text-xs text-stone-500">
            {lastActive ? `Last active ${lastActive}` : "Log a session to start one"}
          </span>
        </div>
      </section>

      {!hasAnything ? (
        <section className={`${CARD} text-center`}>
          <p className="text-sm font-semibold text-stone-900">Nothing logged yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-stone-500">
            Drills you complete, lessons you watch and practice you log will all show up here.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/practice" className="rounded-xl bg-[#014421] px-4 py-2 text-sm font-semibold text-white">
              Start practising
            </Link>
            <Link href="/library" className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700">
              Watch a lesson
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className={CARD} aria-labelledby="practice-monthly-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                id="practice-monthly-heading"
                className="flex items-center gap-2 text-base font-semibold text-stone-900"
              >
                <CalendarDays className="h-4 w-4 text-[#014421]" aria-hidden />
                Month by month
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setChartYear((y) => y - 1);
                    setChartMonth(null);
                  }}
                  disabled={chartYear <= yearBounds.min}
                  aria-label="Previous year"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-10 text-center text-sm font-bold tabular-nums text-stone-900">{chartYear}</span>
                <button
                  type="button"
                  onClick={() => {
                    setChartYear((y) => y + 1);
                    setChartMonth(null);
                  }}
                  disabled={chartYear >= yearBounds.max}
                  aria-label="Next year"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex rounded-full bg-stone-100 p-0.5" role="tablist" aria-label="Chart measure">
                {(
                  [
                    { id: "time", label: "Hours" },
                    { id: "activities", label: "Activities" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={chartMetric === opt.id}
                    onClick={() => setChartMetric(opt.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      chartMetric === opt.id ? "bg-white text-[#014421] shadow-sm" : "text-stone-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-stone-500">
                {chartYear} total{" "}
                <span className="font-semibold text-stone-900">
                  {chartMetric === "time" ? formatMinutes(yearTotals.minutes) : yearTotals.activities}
                </span>
              </span>
            </div>

            <div className="grid h-36 grid-cols-12 items-end gap-1">
              {monthly.map((m) => {
                const value = metricValue(m);
                const future = isCurrentYear && m.month > now.getMonth();
                const active = m.month === selectedMonth;
                return (
                  <button
                    key={m.month}
                    type="button"
                    disabled={future}
                    onClick={() => setChartMonth(m.month)}
                    aria-pressed={active}
                    aria-label={`${MONTH_NAMES[m.month]}: ${chartMetric === "time" ? formatMinutes(m.minutes) : `${m.activities} activities`}`}
                    className="group flex h-full min-w-0 flex-col items-center justify-end"
                  >
                    {value > 0 && (
                      <span
                        className={`mb-0.5 text-[9px] font-semibold tabular-nums ${active ? "text-orange-600" : "text-stone-500"}`}
                      >
                        {chartMetric === "time" ? formatHoursShort(m.minutes) : m.activities}
                      </span>
                    )}
                    <span
                      className={`w-full rounded-t-md transition-colors ${
                        value === 0
                          ? future
                            ? "bg-transparent"
                            : "bg-stone-100"
                          : active
                            ? "bg-[#FFA500]"
                            : "bg-[#014421] group-hover:bg-[#014421]/80"
                      } ${active && value === 0 ? "ring-1 ring-[#FFA500]" : ""}`}
                      style={{ height: value > 0 ? `${Math.max(6, (value / chartMax) * 100)}%` : "4px" }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-1 grid grid-cols-12 gap-1">
              {MONTH_NAMES.map((name, i) => (
                <span
                  key={name}
                  className={`text-center text-[9px] font-medium ${i === selectedMonth ? "font-bold text-stone-900" : "text-stone-400"}`}
                >
                  {name.slice(0, 1)}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-stone-50 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900">
                  {MONTH_NAMES[selectedMonth]} {chartYear}
                </p>
                {bestMonth && bestMonth.month === selectedMonth && (
                  <span className="rounded-full bg-[#FFA500]/15 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                    Best month
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Time", value: formatMinutes(selected.minutes) },
                  { label: "Drills", value: selected.drills },
                  { label: "Videos", value: selected.videos },
                  { label: "Days", value: selected.activeDays },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-xl bg-white px-1 py-2">
                    <p className="text-sm font-bold tabular-nums text-stone-900">{tile.value}</p>
                    <p className="text-[10px] text-stone-500">{tile.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-stone-500">
                <ComparisonLine
                  label={`vs ${MONTH_NAMES[selectedMonth === 0 ? 11 : selectedMonth - 1]}`}
                  current={selected}
                  previous={prevMonthStats}
                  metric={chartMetric}
                />
                <ComparisonLine
                  label={`vs ${MONTH_NAMES[selectedMonth].slice(0, 3)} ${chartYear - 1}`}
                  current={selected}
                  previous={lastYearStats}
                  metric={chartMetric}
                />
              </div>
            </div>
          </section>

          <section className={CARD} aria-labelledby="practice-areas-heading">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 id="practice-areas-heading" className="text-base font-semibold text-stone-900">
                Where your time goes
              </h3>
              <span className="text-xs text-stone-500">{RANGE_OPTIONS.find((o) => o.id === range)?.label}</span>
            </div>
            {areaRows.length === 0 ? (
              <p className="text-sm text-stone-500">No timed practice in this period.</p>
            ) : (
              <ul className="space-y-3">
                {areaRows.map((row) => (
                  <li key={row.area}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-stone-800">{row.area}</span>
                      <span className="tabular-nums text-stone-500">
                        <span className="font-semibold text-stone-900">{formatMinutes(row.minutes)}</span>
                        {row.goal > 0 ? ` / ${formatMinutes(row.goal)}` : ""}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-stone-100">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          row.goal > 0 && row.minutes >= row.goal ? "bg-[#FFA500]" : "bg-[#014421]"
                        }`}
                        style={{ width: `${(row.minutes / areaScale) * 100}%` }}
                      />
                      {row.goal > 0 && (
                        <span
                          className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-stone-400"
                          style={{ left: `calc(${(row.goal / areaScale) * 100}% - 1px)` }}
                          aria-hidden
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {goalMinutes > 0 && areaRows.length > 0 && (
              <p className="mt-3 text-[11px] text-stone-400">Grey marks show your goal for each area.</p>
            )}
          </section>

          <section className={CARD} aria-labelledby="practice-feed-heading">
            <h3 id="practice-feed-heading" className="mb-3 text-base font-semibold text-stone-900">
              Activity
            </h3>
            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
              {(["all", "drill", "video", "practice", "combine"] as const).map((k) => {
                const count = k === "all" ? allItems.length : feedCounts[k];
                if (k !== "all" && count === 0) return null;
                const active = feedFilter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setFeedFilter(k);
                      setFeedLimit(FEED_PAGE);
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {k === "all" ? "All" : KIND_STYLE[k].plural}
                    <span className={`ml-1 tabular-nums ${active ? "text-white/70" : "text-stone-400"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {feedGroups.length === 0 ? (
              <p className="text-sm text-stone-500">Nothing here yet.</p>
            ) : (
              <ul className="space-y-2">
                {feedGroups.flatMap((group) =>
                  group.items.map((item) => {
                    const style = KIND_STYLE[item.kind];
                    const Icon = style.icon;
                    const body = (
                      <>
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.badge}`}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-stone-900">{item.title}</span>
                            {item.repeats > 1 && (
                              <span className="shrink-0 rounded-full bg-white px-1.5 text-[10px] font-bold tabular-nums text-stone-600 ring-1 ring-stone-200">
                                ×{item.repeats}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                            <span>{style.label}</span>
                            {item.area && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{item.area}</span>
                              </>
                            )}
                            {item.minutes > 0 && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{formatMinutes(item.minutes)}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-500">
                          {shortDate(item.at)}
                        </span>
                      </>
                    );
                    return (
                      <li key={item.id}>
                        {item.kind === "video" && item.refId ? (
                          <Link
                            href={`/library?drill=${encodeURIComponent(item.refId)}`}
                            className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2.5 transition-colors hover:bg-stone-100"
                          >
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2.5">{body}</div>
                        )}
                      </li>
                    );
                  }),
                )}
              </ul>
            )}

            {(feedItems.length > feedLimit || feedLimit > FEED_PAGE) && (
              <div className="mt-4 flex gap-2">
                {feedLimit > FEED_PAGE && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedLimit(FEED_PAGE);
                      document
                        .getElementById("practice-feed-heading")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-200"
                  >
                    Show less
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {feedItems.length > feedLimit && (
                  <button
                    type="button"
                    onClick={() => setFeedLimit((n) => n + FEED_PAGE)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-200"
                  >
                    Show more
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            )}
          </section>

          {drillRows.length > 0 && (
            <section className={CARD} aria-labelledby="practice-drills-heading">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3
                  id="practice-drills-heading"
                  className="flex items-center gap-2 text-base font-semibold text-stone-900"
                >
                  <Trophy className="h-4 w-4 text-[#FFA500]" aria-hidden />
                  Your drills
                </h3>
                <span className="text-xs text-stone-500">
                  {drillRows.length} drill{drillRows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-2">
                {(showAllDrills ? drillRows : drillRows.slice(0, 6)).map((row) => (
                  <li key={row.key} className="rounded-2xl bg-stone-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {row.area && <AreaChip area={row.area} />}
                        <span className="truncate text-sm font-medium text-stone-900">{row.title}</span>
                      </div>
                      {row.count > 0 && (
                        <span className="shrink-0 rounded-full bg-[#014421] px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                          {row.count}×
                        </span>
                      )}
                    </div>
                    {row.record && row.progress && (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-stone-500">
                        <span>
                          Best{" "}
                          <span className="font-semibold text-stone-900">
                            {formatDrillScore(row.progress.best, row.record.unit)}
                          </span>
                        </span>
                        <span>
                          {row.progress.count} score{row.progress.count === 1 ? "" : "s"}
                        </span>
                        {row.gain != null && row.gain !== 0 && (
                          <span
                            className={`flex items-center gap-0.5 font-semibold ${
                              row.gain > 0 ? "text-green-700" : "text-red-600"
                            }`}
                          >
                            {row.gain > 0 ? (
                              <TrendingUp className="h-3 w-3" aria-hidden />
                            ) : (
                              <TrendingDown className="h-3 w-3" aria-hidden />
                            )}
                            {row.gain > 0 ? "+" : "−"}
                            {Math.round(Math.abs(row.gain) * 100) / 100} since first
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {drillRows.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllDrills((v) => !v)}
                  className="mt-3 w-full text-center text-xs font-semibold text-[#014421] hover:underline"
                >
                  {showAllDrills ? "Show fewer" : `Show all ${drillRows.length}`}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
