"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ImageIcon, MessageCircle, Play, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VIDEO_COACH_NAME, buildBunnyThumbnailUrl } from "@/lib/bunnyStream";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import { fetchActivity, isCoachPost, postVideos, type ActivityItem } from "@/lib/coachingFeed";
import { Avatar, timeAgo, useProfileNames } from "@/components/coaching/coachingUi";
import { useSignedPhoto } from "@/components/coaching/CoachingPostCard";

const COACHING_HREF = "/profile?tab=coaching";
const MAX_TILES = 4;

function VideoTile({ videoId, unread }: { videoId: string; unread: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = buildBunnyThumbnailUrl(videoId);
  return (
    <TileFrame unread={unread}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Video className="h-5 w-5 text-gray-300" aria-hidden />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-black/35">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" aria-hidden />
        </span>
      </span>
    </TileFrame>
  );
}

function PhotoTile({ path, unread }: { path: string; unread: boolean }) {
  const { url } = useSignedPhoto(path);
  return (
    <TileFrame unread={unread}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-5 w-5 text-gray-300" aria-hidden />
      )}
    </TileFrame>
  );
}

function TileFrame({ unread, children }: { unread: boolean; children: React.ReactNode }) {
  return (
    <span className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-gray-100">
      {children}
      {unread && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[#FFA500] px-1.5 text-[9px] font-bold leading-4 text-white">
          NEW
        </span>
      )}
    </span>
  );
}

type Tile = { key: string; videoId: string | null; photoPath: string | null; unread: boolean };

function mediaTiles(items: ActivityItem[]): Tile[] {
  const tiles: Tile[] = [];
  for (const item of items) {
    for (const v of postVideos(item)) {
      if (v.bunny_video_id) {
        tiles.push({ key: `${item.id}-${v.bunny_video_id}`, videoId: v.bunny_video_id, photoPath: null, unread: item.unread });
      }
    }
    if (item.image_path) {
      tiles.push({ key: `${item.id}-photo`, videoId: null, photoPath: item.image_path, unread: item.unread });
    }
    if (tiles.length >= MAX_TILES) break;
  }
  return tiles.slice(0, MAX_TILES);
}

/** Homepage entry point to the Coaching tab: latest swings/lessons and what's new. */
export function HomeCoachingCard() {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchActivity(createClient(), user.id, { includeAnnouncements: !isCoach })
      .then((list) => {
        if (!cancelled) setItems(isCoach ? list : list.filter((i) => i.announcement || isCoachPost(i)));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isCoach]);

  const names = useProfileNames((items ?? []).slice(0, 1).map((i) => (isCoach ? i.student_id : i.author_id)));

  if (!user?.id) return null;

  const coachFirst = APP_VIDEO_COACH_NAME.split(" ")[0];
  const unread = (items ?? []).filter((i) => i.unread).length;
  const latest = items?.[0];
  const tiles = mediaTiles(items ?? []);
  const latestName = latest
    ? isCoach
      ? names.get(latest.student_id) ?? "A student"
      : (latest.author_id && names.get(latest.author_id)) || APP_VIDEO_COACH_NAME
    : "";
  const latestVerb = latest
    ? latest.announcement
      ? "posted to all players"
      : postVideos(latest).length > 1
        ? `sent ${postVideos(latest).length} videos`
        : postVideos(latest).length === 1
          ? "sent a video"
          : latest.image_path
            ? "sent a photo"
            : latest.parent_id
              ? "replied"
              : "posted"
    : "";

  return (
    <section className="mb-4 w-full px-4" aria-label="Coaching">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <Link href={COACHING_HREF} className="block">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Video className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
              <h2 className="text-base font-bold text-gray-900">{isCoach ? "Coaching" : "Your Coaching"}</h2>
            </div>
            {unread > 0 ? (
              <span className="shrink-0 rounded-full bg-[#FFA500] px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
                {unread > 9 ? "9+" : unread} new
              </span>
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {isCoach ? "Your students' swings and questions" : `Your swings and lessons from ${coachFirst}`}
          </p>

          {items === null ? (
            <div className="mt-3 grid grid-cols-4 gap-2" aria-hidden>
              {Array.from({ length: MAX_TILES }, (_, i) => (
                <span key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : tiles.length > 0 ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {tiles.map((t) =>
                t.videoId ? (
                  <VideoTile key={t.key} videoId={t.videoId} unread={t.unread} />
                ) : (
                  <PhotoTile key={t.key} path={t.photoPath!} unread={t.unread} />
                ),
              )}
            </div>
          ) : null}

          {latest ? (
            <div className="mt-3 flex items-center gap-2">
              <Avatar name={latestName} coach={!isCoach} size="sm" userId={latest.author_id} />
              <p className="min-w-0 truncate text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{latestName}</span> {latestVerb} · {timeAgo(latest.created_at)}
              </p>
            </div>
          ) : items !== null ? (
            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              {isCoach
                ? "Nothing new from your students yet."
                : `Your swing videos and lessons from ${coachFirst} will show up here.`}
            </p>
          ) : null}
        </Link>

        <div className="mt-3">
          <Link
            href={COACHING_HREF}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#013320]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Open coaching
          </Link>
        </div>
      </div>
    </section>
  );
}
