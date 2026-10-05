"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ImageIcon, Loader2, Play } from "lucide-react";
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

type Filter = "all" | "coaches" | "athletes";

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

  const names = useProfileNames(items.flatMap((i) => [i.author_id, i.student_id]));
  const spaceNames = useMemo(() => new Map(spaces.map((s) => [s.studentId, s.name] as const)), [spaces]);
  const studentName = (id: string) => spaceNames.get(id) ?? names.get(id) ?? "Golfer";
  const authorName = (i: ActivityItem) =>
    isCoachPost(i) ? (i.author_id && names.get(i.author_id)) || APP_VIDEO_COACH_NAME : studentName(i.student_id);

  const visible = items.filter((i) =>
    filter === "all" ? true : filter === "coaches" ? isCoachPost(i) : !isCoachPost(i),
  );
  const unreadCount = items.filter((i) => i.unread).length;

  const groups = useMemo(() => {
    const today = startOfToday();
    const weekAgo = today - 6 * 86400000;
    const out: { label: string; items: ActivityItem[] }[] = [
      { label: "Today", items: [] },
      { label: "This week", items: [] },
      { label: "Earlier", items: [] },
    ];
    for (const i of visible) {
      const at = Date.parse(i.created_at);
      out[at >= today ? 0 : at >= weekAgo ? 1 : 2]!.items.push(i);
    }
    return out.filter((g) => g.items.length);
  }, [visible]);

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
        <div className="flex gap-2 px-4 pt-3">
          {(
            [
              ["all", "All"],
              ["coaches", "By coaches"],
              ["athletes", "By athletes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
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
          <p className="mt-1 text-xs text-stone-500">New posts and replies will show up here.</p>
        </div>
      ) : (
        <div className="pb-2">
          {groups.map((g) => (
            <section key={g.label}>
              <h4 className="px-4 pb-1 pt-4 text-sm font-bold text-stone-900">{g.label}</h4>
              <ul>
                {g.items.map((i) => {
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
                        <Avatar name={name} coach={isCoachPost(i)} />
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
        </div>
      )}
    </div>
  );
}
