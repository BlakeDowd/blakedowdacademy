"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Bell, BookOpen, ClipboardCheck, Clock, Flag, ImageIcon, Loader2, Play, Target } from "lucide-react";
import {
  describeUsage,
  featureOf,
  fetchDrillTitles,
  fetchUsageEvents,
  type DrillTitles,
  type UsageEvent,
  type UsageSource,
} from "@/lib/appUsage";
import { APP_VIDEO_COACH_NAME, buildBunnyThumbnailUrl } from "@/lib/bunnyStream";
import { createClient } from "@/lib/supabase/client";
import {
  fetchActivity,
  isCoachPost,
  markAllRead,
  postVideos,
  type ActivityItem,
  type CoachingSpaceSummary,
} from "@/lib/coachingFeed";
import { Avatar, timeAgo, useProfileNames } from "@/components/coaching/coachingUi";
import { useSignedPhoto } from "@/components/coaching/CoachingPostCard";

type Filter = "all" | "coaches" | "athletes" | "training";

type Row =
  | { kind: "post"; at: number; item: ActivityItem }
  | { kind: "training"; at: number; event: UsageEvent };

/** Player actions from the usage log shown alongside posts (not screens opened or coaching posts). */
const TRAINING_SOURCES = new Set<UsageSource>(["practice", "skills_log", "drill_score", "round", "lesson", "trophy"]);
const TRAINING_DAYS = 14;
const ROWS_PAGE = 60;

function TrainingIcon({ event }: { event: UsageEvent }) {
  const feature = featureOf(event);
  const [Icon, tone] =
    event.source === "drill_score"
      ? [Target, "bg-[#FFA500]/15 text-[#b36b00]"]
      : feature === "Combines & tests"
        ? [ClipboardCheck, "bg-[#014421]/10 text-[#014421]"]
        : event.source === "round"
          ? [Flag, "bg-[#014421]/10 text-[#014421]"]
          : event.source === "lesson"
            ? [BookOpen, "bg-sky-100 text-sky-700"]
            : event.source === "trophy"
              ? [Award, "bg-amber-100 text-amber-700"]
              : [Clock, "bg-[#014421]/10 text-[#014421]"];
  return (
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`} title={feature}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function snippet(text: string | null, max = 70): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function Thumb({ videoId }: { videoId: string }) {
  const [failed, setFailed] = useState(false);
  const src = buildBunnyThumbnailUrl(videoId);
  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-200">
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <Play className="relative h-4 w-4 fill-white text-white drop-shadow" aria-hidden />
    </span>
  );
}

function PhotoThumb({ path }: { path: string }) {
  const { url } = useSignedPhoto(path);
  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-200">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-4 w-4 text-stone-400" aria-hidden />
      )}
    </span>
  );
}

export function CoachingActivity({
  viewerId,
  viewerIsCoach,
  spaces,
  onOpenSpace,
  onOpenFeed,
  onRead,
}: {
  viewerId: string;
  viewerIsCoach: boolean;
  spaces: CoachingSpaceSummary[];
  onOpenSpace: (studentId: string, name: string) => void;
  /** Announcements and replies to them live in the feed, not a single space. */
  onOpenFeed?: () => void;
  onRead?: () => void;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchActivity(createClient(), viewerId, { includeAnnouncements: !viewerIsCoach }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load activity.");
    } finally {
      setLoading(false);
    }
  }, [viewerId, viewerIsCoach]);

  useEffect(() => {
    void load();
  }, [load]);

  const [training, setTraining] = useState<UsageEvent[]>([]);
  const [drillTitles, setDrillTitles] = useState<DrillTitles>(new Map());
  const [rowLimit, setRowLimit] = useState(ROWS_PAGE);

  useEffect(() => {
    if (!viewerIsCoach) return;
    let cancelled = false;
    const since = new Date(Date.now() - TRAINING_DAYS * 86400000);
    void Promise.all([fetchUsageEvents(createClient(), since), fetchDrillTitles()])
      .then(([events, titles]) => {
        if (cancelled) return;
        setTraining(events.filter((e) => e.user_id !== viewerId && TRAINING_SOURCES.has(e.source)));
        setDrillTitles(titles);
      })
      .catch((err) => {
        if (!cancelled) console.warn("[CoachingActivity] training:", err instanceof Error ? err.message : err);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId, viewerIsCoach]);

  const names = useProfileNames([
    ...items.flatMap((i) => [i.author_id, i.student_id]),
    ...training.map((e) => e.user_id),
  ]);
  const spaceNames = useMemo(() => new Map(spaces.map((s) => [s.studentId, s.name] as const)), [spaces]);
  const studentName = (id: string) => spaceNames.get(id) ?? names.get(id) ?? "Golfer";
  const authorName = (i: ActivityItem) =>
    isCoachPost(i) ? (i.author_id && names.get(i.author_id)) || APP_VIDEO_COACH_NAME : studentName(i.student_id);

  const unreadCount = items.filter((i) => i.unread).length;

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (filter !== "training") {
      for (const item of items) {
        if (filter === "coaches" && !isCoachPost(item)) continue;
        if (filter === "athletes" && isCoachPost(item)) continue;
        out.push({ kind: "post", at: Date.parse(item.created_at), item });
      }
    }
    if (filter === "all" || filter === "training") {
      for (const event of training) out.push({ kind: "training", at: Date.parse(event.at), event });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [items, training, filter]);

  const groups = useMemo(() => {
    const today = startOfToday();
    const weekAgo = today - 6 * 86400000;
    const out: { label: string; rows: Row[] }[] = [
      { label: "Today", rows: [] },
      { label: "This week", rows: [] },
      { label: "Earlier", rows: [] },
    ];
    for (const row of rows.slice(0, rowLimit)) {
      out[row.at >= today ? 0 : row.at >= weekAgo ? 1 : 2]!.rows.push(row);
    }
    return out.filter((g) => g.rows.length);
  }, [rows, rowLimit]);

  const readAll = async () => {
    setMarking(true);
    try {
      await markAllRead(
        createClient(),
        viewerId,
        items.filter((i) => i.unread).map((i) => i.student_id),
      );
      setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
      onRead?.();
    } finally {
      setMarking(false);
    }
  };

  const describe = (i: ActivityItem) => {
    const text = snippet(i.body || i.title);
    const videoCount = postVideos(i).length;
    const verb = i.announcement
      ? "posted to all players"
      : i.announcement_id
        ? viewerIsCoach
          ? "replied to your announcement"
          : "replied about the announcement"
        : i.parent_id
      ? "replied"
      : videoCount > 1
        ? `posted ${videoCount} videos`
        : videoCount === 1
        ? "posted a video"
        : i.image_path
          ? "posted a photo"
          : "posted";
    return { verb, text };
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
        <h3 className="text-base font-bold text-stone-900">Notifications</h3>
        {unreadCount > 0 && (
          <span className="rounded-full bg-[#FFA500] px-2 py-0.5 text-[11px] font-bold text-white">{unreadCount}</span>
        )}
        <button
          type="button"
          onClick={() => void readAll()}
          disabled={!unreadCount || marking}
          className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5 disabled:text-stone-300"
        >
          {marking ? "Marking…" : "Read all"}
        </button>
      </div>

      {viewerIsCoach && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {(
            [
              ["all", "All"],
              ["training", "Training"],
              ["coaches", "By coaches"],
              ["athletes", "By athletes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFilter(id);
                setRowLimit(ROWS_PAGE);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading activity…
        </div>
      ) : error ? (
        <p className="m-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>
      ) : groups.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-800">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-stone-500">
            {filter === "training"
              ? "Drills, practice, combines and rounds from the last two weeks will show up here."
              : "New posts and replies will show up here."}
          </p>
        </div>
      ) : (
        <div className="pb-2">
          {groups.map((g) => (
            <section key={g.label}>
              <h4 className="px-4 pb-1 pt-4 text-sm font-bold text-stone-900">{g.label}</h4>
              <ul>
                {g.rows.map((row, idx) => {
                  if (row.kind === "training") {
                    const e = row.event;
                    const name = studentName(e.user_id);
                    const hasSpace = spaceNames.has(e.user_id);
                    const body = (
                      <>
                        <Avatar name={name} userId={e.user_id} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-stone-700">
                            <span className="font-bold text-stone-900">{name}</span> {describeUsage(e, drillTitles)}
                          </span>
                          <span className="mt-0.5 block text-xs text-stone-500">{timeAgo(e.at)}</span>
                        </span>
                        <TrainingIcon event={e} />
                      </>
                    );
                    return (
                      <li key={`t-${e.user_id}-${e.source}-${e.detail ?? ""}-${e.at}-${idx}`}>
                        {hasSpace ? (
                          <button
                            type="button"
                            onClick={() => onOpenSpace(e.user_id, name)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-stone-50"
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="flex w-full items-start gap-3 px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  }
                  const i = row.item;
                  const name = authorName(i);
                  const { verb, text } = describe(i);
                  const space = studentName(i.student_id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() =>
                          (i.announcement || i.announcement_id) && onOpenFeed
                            ? onOpenFeed()
                            : onOpenSpace(i.student_id, space)
                        }
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-stone-50 ${
                          i.unread ? "bg-[#FFA500]/10" : ""
                        }`}
                      >
                        <Avatar name={name} coach={isCoachPost(i)} userId={i.author_id} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-stone-700">
                            <span className="font-bold text-stone-900">{name}</span> {verb}
                            {text ? `: “${text}”` : ""}
                          </span>
                          <span className="mt-0.5 block text-xs text-stone-500">
                            {timeAgo(i.created_at)}
                            {viewerIsCoach ? ` • ${space}` : ""}
                          </span>
                        </span>
                        {i.bunny_video_id ? (
                          <Thumb videoId={i.bunny_video_id} />
                        ) : i.image_path ? (
                          <PhotoThumb path={i.image_path} />
                        ) : null}
                        {i.unread && !i.bunny_video_id && !i.image_path && (
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FFA500]" aria-label="Unread" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {rows.length > rowLimit && (
            <div className="px-4 pt-2">
              <button
                type="button"
                onClick={() => setRowLimit((n) => n + ROWS_PAGE)}
                className="w-full rounded-xl bg-stone-100 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200"
              >
                Show more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
