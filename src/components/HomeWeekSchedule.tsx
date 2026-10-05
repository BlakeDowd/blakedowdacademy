"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { OFFICIAL_DRILLS } from "@/data/official_drills";
import { COMBINE_TEST_CARDS } from "@/lib/combineTestsCatalog";
import { fetchDrillsCatalogRows } from "@/lib/fetchDrillsCatalog";
import { WeekDayStrip } from "@/components/WeekDayStrip";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_VISIBLE_DRILLS = 4;

type WeekDrill = {
  key: string;
  ids: string[];
  title: string;
  minutes: number;
  completed: boolean;
  logId?: string;
};

type WeekDays = WeekDrill[][];

type StoredPlanDrill = {
  id?: string;
  drill_id?: string;
  title?: string;
  estimatedMinutes?: number;
  completed?: boolean;
  practiceLogId?: string;
};

type StoredPlan = Record<string, { date?: string; drills?: (StoredPlanDrill | null)[] } | undefined>;

type CatalogEntry = { title: string; minutes: number };

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayIndexOf(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 6 : dow - 1;
}

function currentWeek() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayIndexOf(today));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday, todayIndex: dayIndexOf(today) };
}

function emptyWeek(): WeekDays {
  return Array.from({ length: 7 }, () => []);
}

/** Same localStorage plan the practice page writes; days outside this week are ignored. */
function readStoredPlan(weekStart: string, weekEnd: string): WeekDays {
  const days = emptyWeek();
  if (typeof window === "undefined") return days;
  try {
    const raw = localStorage.getItem("weeklyPracticePlans");
    if (!raw) return days;
    const plan = JSON.parse(raw) as StoredPlan;
    for (let i = 0; i < 7; i++) {
      const day = plan[i];
      if (!day?.drills?.length || !day.date || day.date < weekStart || day.date > weekEnd) continue;
      days[i] = day.drills
        .filter((d): d is StoredPlanDrill => !!d)
        .map((d, idx) => ({
          key: `${d.id ?? d.drill_id ?? "drill"}-${idx}`,
          ids: [d.id, d.drill_id].filter(Boolean).map(String),
          title: d.title || "Practice",
          minutes: Number(d.estimatedMinutes) || 0,
          completed: !!d.completed,
          logId: d.practiceLogId,
        }));
    }
  } catch {
    /* corrupt plan — show empty week */
  }
  return days;
}

function addCatalogRow(map: Map<string, CatalogEntry>, row: Record<string, unknown>) {
  const title = String(row.drill_name ?? row.title ?? "").trim();
  if (!title) return;
  const minutes = Number(row.estimated_minutes ?? row.estimatedMinutes) || 0;
  for (const key of [row.id, row.drill_id]) {
    if (key != null && String(key).trim()) map.set(String(key).trim(), { title, minutes });
  }
}

function baseCatalog(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  OFFICIAL_DRILLS.forEach((d) => addCatalogRow(map, d as unknown as Record<string, unknown>));
  COMBINE_TEST_CARDS.forEach((card) =>
    map.set(`combine:${card.id}`, { title: card.label, minutes: 20 }),
  );
  return map;
}

export function HomeWeekSchedule() {
  const router = useRouter();
  const { user } = useAuth();
  const week = useMemo(() => currentWeek(), []);
  const weekStart = toLocalDateString(week.monday);
  const weekEnd = toLocalDateString(week.sunday);

  const [days, setDays] = useState<WeekDays>(emptyWeek);
  const [selectedDay, setSelectedDay] = useState(week.todayIndex);

  const load = useCallback(async () => {
    setDays(readStoredPlan(weekStart, weekEnd));
    if (!user?.id) return;
    const merged = readStoredPlan(weekStart, weekEnd);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const [plannedRes, practiceRes] = await Promise.all([
        supabase
          .from("user_drills")
          .select("*")
          .eq("user_id", user.id)
          .gte("selected_date", weekStart)
          .lte("selected_date", weekEnd),
        supabase
          .from("practice")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_at", week.monday.toISOString())
          .lte("completed_at", week.sunday.toISOString()),
      ]);
      const planned = (plannedRes.data ?? []) as Record<string, unknown>[];
      const practice = (practiceRes.data ?? []) as Record<string, unknown>[];

      const catalog = baseCatalog();
      const unknownIds = [...planned, ...practice]
        .map((r) => (r.drill_id != null ? String(r.drill_id) : ""))
        .filter((id) => id && !catalog.has(id));
      if (unknownIds.length > 0) {
        (await fetchDrillsCatalogRows()).forEach((row) => addCatalogRow(catalog, row));
      }

      const hasDrill = (dayIdx: number, id: string) =>
        merged[dayIdx].some((d) => d.ids.includes(id));

      planned.forEach((row) => {
        const id = String(row.drill_id ?? "");
        const date = String(row.selected_date ?? "");
        if (!id || !date) return;
        const dayIdx = dayIndexOf(new Date(`${date}T12:00:00`));
        if (hasDrill(dayIdx, id)) return;
        const info = catalog.get(id);
        merged[dayIdx].push({
          key: `planned-${id}`,
          ids: [id],
          title: info?.title ?? "Practice drill",
          minutes: info?.minutes ?? 0,
          completed: false,
        });
      });

      practice.forEach((row) => {
        if (!row.completed_at) return;
        const dayIdx = dayIndexOf(new Date(String(row.completed_at)));
        const logId = row.id != null ? String(row.id) : undefined;
        const id = String(row.drill_id ?? row.type ?? "");
        const completed = row.completed === true;
        const dayDrills = merged[dayIdx];

        let match = logId ? dayDrills.find((d) => d.logId === logId) : undefined;
        if (!match && id) match = dayDrills.find((d) => !d.logId && d.ids.includes(id));
        if (match) {
          match.completed = completed;
          if (logId) match.logId = logId;
          return;
        }

        const info = id ? catalog.get(id) : undefined;
        dayDrills.push({
          key: `log-${logId ?? id}`,
          ids: id ? [id] : [],
          title:
            info?.title ??
            String(row.drill_name ?? row.type ?? row.title ?? "Practice session"),
          minutes:
            info?.minutes ?? (Number(row.duration_minutes ?? row.estimatedMinutes) || 0),
          completed,
          logId,
        });
      });

      setDays(merged);
    } catch (err) {
      console.warn("HomeWeekSchedule: could not load week from database", err);
    }
  }, [user?.id, weekStart, weekEnd, week.monday, week.sunday]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("practiceActivityUpdated", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("practiceActivityUpdated", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const totalDrills = days.reduce((sum, d) => sum + d.length, 0);
  const doneDrills = days.reduce((sum, d) => sum + d.filter((x) => x.completed).length, 0);

  const dayDrills = days[selectedDay] ?? [];
  const dayMinutes = dayDrills.reduce((sum, d) => sum + d.minutes, 0);
  const dayDone = dayDrills.filter((d) => d.completed).length;
  const isPast = selectedDay < week.todayIndex;
  const dayLabel =
    selectedDay === week.todayIndex
      ? "Today"
      : selectedDay === week.todayIndex + 1
        ? "Tomorrow"
        : DAY_NAMES[selectedDay];

  const openPlanner = (dayIdx = selectedDay) =>
    router.push(`/practice?plan=schedule&day=${dayIdx}`);

  return (
    <div className="w-full px-4 mb-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
            <h2 className="text-base font-bold text-gray-900">This Week</h2>
          </div>
          {totalDrills > 0 ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 tabular-nums">
              {doneDrills}/{totalDrills} done
            </span>
          ) : null}
        </div>

        <WeekDayStrip
          weekMonday={week.monday}
          todayIndex={week.todayIndex}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
          days={days.map((d) => ({ count: d.length, allDone: d.length > 0 && d.every((x) => x.completed) }))}
        />

        {dayDrills.length > 0 ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">{dayLabel}</p>
              <p className="text-xs text-gray-500 tabular-nums">
                {dayDone}/{dayDrills.length} done
                {dayMinutes > 0 ? ` · ${dayMinutes} min` : ""}
              </p>
            </div>
            <ul className="space-y-1.5">
              {dayDrills.slice(0, MAX_VISIBLE_DRILLS).map((drill) => (
                <li key={drill.key}>
                  <button
                    type="button"
                    onClick={() => openPlanner()}
                    className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        drill.completed ? "bg-[#014421] text-white" : "border-2 border-gray-300"
                      }`}
                    >
                      {drill.completed ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-medium ${
                        drill.completed ? "text-gray-400 line-through" : "text-gray-800"
                      }`}
                    >
                      {drill.title}
                    </span>
                    {drill.minutes > 0 ? (
                      <span className="shrink-0 text-xs text-gray-400 tabular-nums">{drill.minutes}m</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {dayDrills.length > MAX_VISIBLE_DRILLS ? (
              <p className="mt-2 text-xs text-gray-500">
                +{dayDrills.length - MAX_VISIBLE_DRILLS} more
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => openPlanner()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              {selectedDay === week.todayIndex && dayDone < dayDrills.length
                ? "Start today's practice"
                : `Open ${dayLabel === "Today" ? "today" : dayLabel}`}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <div className="rounded-xl bg-gray-50 px-4 py-5 text-center">
            <p className="text-sm font-medium text-gray-700">
              {isPast ? `Nothing was planned for ${DAY_NAMES[selectedDay]}.` : `Nothing planned for ${dayLabel.toLowerCase() === "today" ? "today" : dayLabel}.`}
            </p>
            {isPast ? (
              <button
                type="button"
                onClick={() => openPlanner()}
                className="mt-2 text-sm font-semibold text-[#014421] hover:underline"
              >
                Open planner
              </button>
            ) : (
              <>
                <p className="mt-1 text-xs text-gray-500">
                  Answer a few quick questions and we&apos;ll build it for you.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/practice")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#FFA500] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Build a session
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
