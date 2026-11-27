import type { DrillRecord } from "@/data/official_drills";
import { DESCRIPTION_BY_DRILL_ID } from "@/data/official_drills";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayDayIndexMon0(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function categoryToFacility(category: string): string | undefined {
  const map: Record<string, string> = {
    Driving: "Driving",
    Irons: "Irons",
    Wedges: "Wedges",
    Chipping: "Chipping",
    Bunkers: "Bunkers",
    Putting: "Putting",
    "Mental/Strategy": "Mental/Strategy",
    "9-Hole Round": "On-Course",
    "18-Hole Round": "On-Course",
  };
  return map[category];
}

/**
 * Append a catalog drill to today's weekly practice plan (localStorage + optional user_drills).
 * Combine runners can call this without being on the Practice page.
 */
export async function addDrillToWeeklyPlanToday(
  drill: Pick<
    DrillRecord,
    "id" | "drill_id" | "title" | "drill_name" | "category" | "estimatedMinutes" | "contentType" | "description" | "pdf_url" | "youtube_url" | "video_url" | "goal"
  >,
  userId?: string | null,
): Promise<{ ok: boolean; dayIndex: number; error?: string }> {
  const dayIndex = todayDayIndexMon0();
  const today = new Date();
  const currentDay = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
  const dayDate = new Date(monday);
  dayDate.setDate(monday.getDate() + dayIndex);
  const formattedDate = toLocalDateString(dayDate);

  const desc =
    (drill.description && String(drill.description).trim()) ||
    DESCRIPTION_BY_DRILL_ID[drill.drill_id] ||
    undefined;

  const drillToAdd = {
    id: drill.id,
    drill_id: drill.drill_id || drill.id,
    title: drill.drill_name ?? drill.title ?? "Untitled",
    category: drill.category,
    estimatedMinutes: drill.estimatedMinutes,
    completed: false,
    xpEarned: 0,
    isRound: drill.category === "9-Hole Round" || drill.category === "18-Hole Round",
    contentType: drill.contentType,
    description: desc ?? drill.description,
    pdf_url: drill.pdf_url,
    youtube_url: drill.youtube_url || drill.video_url,
    video_url: drill.video_url || drill.youtube_url,
    goal: drill.goal,
    facility: categoryToFacility(drill.category),
  };

  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("weeklyPracticePlans") : null;
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const existing = (prev?.[dayIndex] as Record<string, unknown> | undefined) ?? {
      dayIndex,
      dayName: DAY_NAMES[dayIndex],
      selected: false,
      availableTime: 0,
      selectedFacilities: [],
      roundType: null,
      drills: [],
    };
    const existingDrills = Array.isArray(existing.drills) ? existing.drills : [];
    const already = existingDrills.some(
      (d) =>
        d &&
        typeof d === "object" &&
        (String((d as { id?: string }).id) === String(drill.id) ||
          String((d as { drill_id?: string }).drill_id) === String(drill.drill_id)),
    );
    const nextDrills = already ? existingDrills : [...existingDrills, drillToAdd];
    const updated = {
      ...prev,
      [dayIndex]: {
        ...existing,
        selected: true,
        date: formattedDate,
        drills: nextDrills,
      },
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("weeklyPracticePlans", JSON.stringify(updated));
      window.dispatchEvent(new Event("weeklyPracticePlansUpdated"));
    }
  } catch (e) {
    return { ok: false, dayIndex, error: e instanceof Error ? e.message : "plan_write_failed" };
  }

  if (userId) {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.from("user_drills").insert({
        user_id: userId,
        drill_id: drill.id,
        selected_date: formattedDate,
      });
      if (error) {
        console.warn("[addDrillToWeeklyPlanToday] user_drills:", error.message);
      }
    } catch (e) {
      console.warn("[addDrillToWeeklyPlanToday]", e);
    }
  }

  return { ok: true, dayIndex };
}
