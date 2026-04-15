"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import { createClient } from "@/lib/supabase/client";
import { listUserCombineCompletionEvents } from "@/lib/combineCompletionDetection";
import {
  practiceSessionMinutesFromRow,
  practiceSessionsForUser,
} from "@/lib/practiceSessionDuration";
import { XP_AWARD_PER_LOGGED_ROUND } from "@/lib/addProfileXp";

const METRICS = ["combines", "practice-hours", "xp", "lowest-score", "rounds"] as const;
type SkillMetric = (typeof METRICS)[number];

function isSkillMetric(s: string): s is SkillMetric {
  return (METRICS as readonly string[]).includes(s);
}

function formatListDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPracticeHoursShort(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  if (hours < 10) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(hours)} h`;
}

function xpHintFromActivityTitle(title: string, activityType: string): string | null {
  const m = title.match(/\+\s*(\d+)\s*XP/i);
  if (m) return `+${m[1]} XP`;
  if (activityType === "round" && /round/i.test(title)) {
    return `+${XP_AWARD_PER_LOGGED_ROUND} XP (logged round)`;
  }
  return null;
}

/** Matches dashboard level thresholds for “XP to next level” copy. */
function xpRemainingFromTotal(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 500;
  if (xp < 500) return 500 - xp;
  if (xp < 1500) return 1500 - xp;
  if (xp < 3000) return 3000 - xp;
  return 2000 - ((xp - 3000) % 2000);
}

interface ActivityLogRow {
  id: string;
  created_at: string;
  activity_title?: string | null;
  activity_type?: string | null;
  xp_earned?: number | null;
}

export default function SkillHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const raw = typeof params?.metric === "string" ? params.metric : "";
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { rounds, practiceSessions, practiceLogs, loading: statsLoading } = useStats();

  const [xpRows, setXpRows] = useState<ActivityLogRow[]>([]);
  const [xpLoading, setXpLoading] = useState(true);

  useEffect(() => {
    if (!raw || !isSkillMetric(raw)) return;
    if (raw !== "xp") {
      setXpLoading(false);
      return;
    }
    if (!user?.id) {
      setXpRows([]);
      setXpLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setXpLoading(true);
      try {
        const supabase = createClient();
        // Use * (not xp_earned in the projection): many DBs omit xp_earned; requesting it causes PGRST204
        // and Supabase's PostgrestError often prints as {} in the console.
        const { data, error } = await supabase
          .from("activity_logs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200);

        if (cancelled) return;
        if (error) {
          const err = error as { message?: string; code?: string; details?: string };
          console.warn(
            "skill-history xp: activity_logs fetch failed:",
            err.message || err.code || err.details || String(error),
          );
          setXpRows([]);
        } else {
          const rows = (data || []) as Record<string, unknown>[];
          setXpRows(
            rows.map((log) => ({
              id: String(log.id ?? ""),
              created_at: String(log.created_at ?? ""),
              activity_title: (log.activity_title ?? log.title ?? null) as string | null,
              activity_type: (log.activity_type ?? log.type ?? null) as string | null,
              xp_earned:
                log.xp_earned != null && Number.isFinite(Number(log.xp_earned))
                  ? Number(log.xp_earned)
                  : null,
            })),
          );
        }
      } catch (e) {
        console.error("skill-history xp fetch:", e);
        if (!cancelled) setXpRows([]);
      } finally {
        if (!cancelled) setXpLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [raw, user?.id]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const mineSessions = useMemo(
    () => practiceSessionsForUser(practiceSessions as any[], user?.id),
    [practiceSessions, user?.id],
  );

  const combineEvents = useMemo(
    () =>
      listUserCombineCompletionEvents({
        userId: user?.id,
        practiceSessions: mineSessions,
        practiceLogs: practiceLogs ?? [],
      }),
    [user?.id, mineSessions, practiceLogs],
  );

  const practiceHourEvents = useMemo(() => {
    const rows = mineSessions
      .map((s: any) => {
        const minutes = practiceSessionMinutesFromRow(s);
        if (minutes <= 0) return null;
        const at = String(s.completed_at || s.created_at || s.practice_date || "");
        const label =
          s.facility_type ||
          s.type ||
          (s.test_type ? String(s.test_type).replace(/_/g, " ") : null) ||
          "Practice session";
        return { at, label: String(label), minutes };
      })
      .filter(Boolean) as { at: string; label: string; minutes: number }[];

    rows.sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    return rows;
  }, [mineSessions]);

  const roundsNewestFirst = useMemo(() => {
    return [...rounds]
      .map((r) => ({
        ...r,
        sortAt: r.created_at || r.date || "",
        scoreNum:
          r.score !== null && r.score !== undefined && Number.isFinite(Number(r.score))
            ? Number(r.score)
            : null,
      }))
      .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  }, [rounds]);

  const scoredRounds = useMemo(
    () => roundsNewestFirst.filter((r): r is typeof r & { scoreNum: number } => r.scoreNum !== null),
    [roundsNewestFirst],
  );

  const lowestGross = useMemo(() => {
    if (!scoredRounds.length) return null;
    return Math.min(...scoredRounds.map((r) => r.scoreNum));
  }, [scoredRounds]);

  const titles: Record<SkillMetric, string> = {
    combines: "Combine completions",
    "practice-hours": "Practice time logged",
    xp: "XP & activity",
    "lowest-score": "Scored rounds (gross)",
    rounds: "Rounds logged",
  };

  const metric: SkillMetric | null = isSkillMetric(raw) ? raw : null;

  const pageLoading =
    authLoading || statsLoading || (metric === "xp" && xpLoading);

  if (!metric) {
    notFound();
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#014421] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-1 flex-col bg-gray-50">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-50"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6 text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{titles[metric]}</h1>
        <div className="w-10" />
      </div>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 pb-32">
        {pageLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#014421] border-t-transparent" />
          </div>
        ) : metric === "combines" ? (
          combineEvents.length === 0 ? (
            <p className="text-center text-sm text-gray-500">
              No combine completions yet. Finish a combine protocol to see dates here.
            </p>
          ) : (
            <ul className="space-y-2">
              {combineEvents.map((ev, i) => (
                <li
                  key={`${ev.at}-${i}`}
                  className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-medium text-gray-900">{ev.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatListDate(ev.at)}</p>
                </li>
              ))}
            </ul>
          )
        ) : metric === "practice-hours" ? (
          practiceHourEvents.length === 0 ? (
            <p className="text-center text-sm text-gray-500">
              No practice sessions with logged duration yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {practiceHourEvents.map((ev, i) => (
                <li
                  key={`${ev.at}-${ev.label}-${i}`}
                  className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-medium text-gray-900">{ev.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatListDate(ev.at)} · {formatPracticeHoursShort(ev.minutes / 60)}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : metric === "xp" ? (
          <>
            <div className="mb-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Current progress</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                Level {user?.currentLevel ?? 1}
                <span className="ml-2 text-sm font-semibold text-[#FFA500]">
                  {(user?.totalXP ?? 0).toLocaleString()} XP
                </span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {xpRemainingFromTotal(user?.totalXP ?? 0).toLocaleString()} XP to next level
              </p>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-gray-500">
              Timeline from your activity log. Round logs include the standard XP award when you post a
              score. Drill titles may include earned XP when recorded that way.
            </p>
            {xpRows.length === 0 ? (
              <p className="text-center text-sm text-gray-500">No activity entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {xpRows.map((log) => {
                  const title = log.activity_title || "";
                  const type = String(log.activity_type || "");
                  const xpCol =
                    log.xp_earned != null && Number(log.xp_earned) > 0
                      ? `+${Number(log.xp_earned)} XP`
                      : xpHintFromActivityTitle(title, type);
                  return (
                    <li
                      key={log.id}
                      className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                    >
                      <p className="text-sm font-medium text-gray-900">{title || type || "Activity"}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{formatListDate(log.created_at)}</p>
                      {xpCol ? (
                        <p className="mt-1 text-xs font-semibold text-[#FFA500]">{xpCol}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : metric === "lowest-score" ? (
          scoredRounds.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No rounds with a gross score yet.</p>
          ) : (
            <ul className="space-y-2">
              {scoredRounds.map((r) => {
                const isBest = lowestGross !== null && r.scoreNum === lowestGross;
                return (
                  <li
                    key={`${r.sortAt}-${r.course}-${r.scoreNum}`}
                    className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{r.course || "Round"}</p>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
                        {r.scoreNum}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{formatListDate(r.sortAt)}</p>
                    {isBest ? (
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#014421]">
                        Current best (gross)
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        ) : metric === "rounds" ? (
          roundsNewestFirst.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No rounds logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {roundsNewestFirst.map((r, idx) => (
                <li
                  key={`${r.sortAt}-${r.course}-${idx}`}
                  className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{r.course || "Round"}</p>
                    <span className="shrink-0 text-sm text-gray-600">
                      {r.scoreNum !== null ? r.scoreNum : "—"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{formatListDate(r.sortAt)}</p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
