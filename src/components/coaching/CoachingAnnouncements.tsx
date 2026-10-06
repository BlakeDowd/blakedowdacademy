"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Lock, Megaphone, MoreHorizontal, PinOff, Trash2 } from "lucide-react";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";
import { createClient } from "@/lib/supabase/client";
import {
  announcementAsPost,
  authJsonHeaders,
  isAnnouncementPinned,
  postVideos,
  type CoachingAnnouncement,
  type CoachingPost,
} from "@/lib/coachingFeed";
import { Avatar, timeAgo } from "@/components/coaching/coachingUi";
import { PostPhoto, PostVideos, Reply, postAuthorName } from "@/components/coaching/CoachingPostCard";
import { ReplyComposer, type ToastState } from "@/components/coaching/CoachingComposer";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function AnnouncementMenu({
  announcement,
  pinned,
  onChanged,
  onDeleted,
  onToast,
}: {
  announcement: CoachingAnnouncement;
  pinned: boolean;
  onChanged: (a: CoachingAnnouncement) => void;
  onDeleted: (id: string) => void;
  onToast: (t: ToastState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unpin = async () => {
    setOpen(false);
    setBusy(true);
    const pinnedUntil = new Date().toISOString();
    const { error } = await createClient()
      .from("coaching_announcements")
      .update({ pinned_until: pinnedUntil })
      .eq("id", announcement.id);
    setBusy(false);
    if (error) onToast({ message: error.message, type: "error" });
    else onChanged({ ...announcement, pinned_until: pinnedUntil });
  };

  const remove = async () => {
    setOpen(false);
    if (!window.confirm("Delete this announcement and every player's reply to it? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/coaching/announcements/${announcement.id}`, {
        method: "DELETE",
        headers: await authJsonHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(announcement.id);
      if (data.warnings?.length) onToast({ message: data.warnings.join(" "), type: "warning" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Delete failed", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
        aria-label="Announcement options"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-stone-200 bg-white py-1 shadow-lg">
          {pinned && (
            <button
              type="button"
              onClick={() => void unpin()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              <PinOff className="h-4 w-4" aria-hidden />
              End now (unpin)
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

type CardProps = {
  announcement: CoachingAnnouncement;
  entries: CoachingPost[];
  names: Map<string, string>;
  studentNameFor: (id: string) => string;
  viewerId: string;
  viewerName: string;
  viewerIsCoach: boolean;
  onEntry: (entry: CoachingPost) => void;
  onEntryDeleted: (id: string) => void;
  onChanged: (a: CoachingAnnouncement) => void;
  onDeleted: (id: string) => void;
  onToast: (t: ToastState) => void;
};

function PlayerThread({
  announcementId,
  studentId,
  entries,
  names,
  studentName,
  viewerId,
  viewerName,
  viewerIsCoach,
  placeholder,
  onEntry,
  onEntryDeleted,
  onToast,
}: {
  announcementId: string;
  studentId: string;
  entries: CoachingPost[];
  names: Map<string, string>;
  studentName: string;
  viewerId: string;
  viewerName: string;
  viewerIsCoach: boolean;
  placeholder: string;
  onEntry: (entry: CoachingPost) => void;
  onEntryDeleted: (id: string) => void;
  onToast: (t: ToastState) => void;
}) {
  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((e) => (
            <Reply
              key={e.id}
              reply={e}
              name={postAuthorName(e, names, studentName)}
              viewerIsCoach={viewerIsCoach}
              onDeleted={onEntryDeleted}
              onToast={onToast}
            />
          ))}
        </ul>
      )}
      <ReplyComposer
        studentId={studentId}
        announcementId={announcementId}
        placeholder={placeholder}
        viewerId={viewerId}
        viewerName={viewerName}
        viewerIsCoach={viewerIsCoach}
        studentName={studentName}
        onPosted={onEntry}
        onToast={onToast}
      />
    </div>
  );
}

function AnnouncementCard({
  announcement,
  entries,
  names,
  studentNameFor,
  viewerId,
  viewerName,
  viewerIsCoach,
  onEntry,
  onEntryDeleted,
  onChanged,
  onDeleted,
  onToast,
  now,
}: CardProps & { now: number }) {
  const [showEntries, setShowEntries] = useState(false);
  const pinned = isAnnouncementPinned(announcement, now);
  const authorName = (announcement.author_id && names.get(announcement.author_id)) || APP_VIDEO_COACH_NAME;
  const asPost = announcementAsPost(announcement, viewerId);
  const videos = postVideos(asPost);
  const coachFirst = authorName.split(" ")[0];

  const byPlayer = new Map<string, CoachingPost[]>();
  for (const e of entries) {
    const list = byPlayer.get(e.student_id) ?? [];
    list.push(e);
    byPlayer.set(e.student_id, list);
  }
  const players = [...byPlayer.entries()].sort((a, b) =>
    (b[1][b[1].length - 1]?.created_at ?? "").localeCompare(a[1][a[1].length - 1]?.created_at ?? ""),
  );
  const playerReplies = entries.filter((e) => e.author_id === e.student_id).length;

  return (
    <article
      className={`overflow-hidden rounded-3xl bg-white shadow-sm ${
        pinned ? "ring-2 ring-[#FFA500]/50" : "ring-1 ring-stone-200"
      }`}
    >
      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold ${pinned ? "bg-[#FFA500]/10 text-[#9a5b00]" : "bg-stone-50 text-stone-500"}`}>
        <Megaphone className="h-3.5 w-3.5" aria-hidden />
        To all players
        <span className="ml-auto font-medium">
          {pinned && announcement.pinned_until
            ? `Pinned until ${formatDay(announcement.pinned_until)}`
            : announcement.pinned_until
              ? `Ended ${formatDay(announcement.pinned_until)}`
              : ""}
        </span>
      </div>
      <header className="flex items-start gap-3 px-4 pt-3">
        <Avatar name={authorName} coach userId={announcement.author_id} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-stone-900">
            {authorName}
            <span className="rounded-full bg-[#014421]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#014421]">Coach</span>
          </p>
          <p className="text-xs text-stone-500">Announcement</p>
        </div>
        <span className="pt-0.5 text-xs text-stone-500">{timeAgo(announcement.created_at)}</span>
        {viewerIsCoach && (
          <AnnouncementMenu
            announcement={announcement}
            pinned={pinned}
            onChanged={onChanged}
            onDeleted={onDeleted}
            onToast={onToast}
          />
        )}
      </header>

      {announcement.body && (
        <p className="whitespace-pre-wrap px-4 pt-3 text-sm leading-relaxed text-stone-700">{announcement.body}</p>
      )}
      {announcement.image_path && (
        <div className="mt-3">
          <PostPhoto path={announcement.image_path} />
        </div>
      )}
      {videos.length > 0 && (
        <div className={announcement.image_path ? "mt-1" : "mt-3"}>
          <PostVideos videos={videos} createdAt={announcement.created_at} />
        </div>
      )}

      <div className="mt-3 space-y-3 border-t border-stone-100 px-4 py-3">
        {viewerIsCoach ? (
          <>
            <button
              type="button"
              onClick={() => setShowEntries((v) => !v)}
              disabled={!players.length}
              className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-stone-600 disabled:text-stone-400"
              aria-expanded={showEntries}
            >
              {players.length
                ? `${playerReplies} repl${playerReplies === 1 ? "y" : "ies"} from ${players.length} player${players.length === 1 ? "" : "s"}`
                : "No replies yet"}
              {players.length > 0 && (
                <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${showEntries ? "rotate-180" : ""}`} aria-hidden />
              )}
            </button>
            {showEntries && (
              <div className="space-y-4">
                {players.map(([studentId, list]) => {
                  const name = studentNameFor(studentId);
                  return (
                    <section key={studentId} className="rounded-2xl bg-stone-50 p-3">
                      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-stone-800">
                        <Avatar name={name} size="sm" userId={studentId} />
                        {name}
                      </p>
                      <PlayerThread
                        announcementId={announcement.id}
                        studentId={studentId}
                        entries={list}
                        names={names}
                        studentName={name}
                        viewerId={viewerId}
                        viewerName={viewerName}
                        viewerIsCoach
                        placeholder={`Reply to ${name.split(" ")[0]}…`}
                        onEntry={onEntry}
                        onEntryDeleted={onEntryDeleted}
                        onToast={onToast}
                      />
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
              <Lock className="h-3 w-3" aria-hidden />
              Only {coachFirst} sees your reply
            </p>
            <PlayerThread
              announcementId={announcement.id}
              studentId={viewerId}
              entries={entries}
              names={names}
              studentName={viewerName}
              viewerId={viewerId}
              viewerName={viewerName}
              viewerIsCoach={false}
              placeholder="Reply privately…"
              onEntry={onEntry}
              onEntryDeleted={onEntryDeleted}
              onToast={onToast}
            />
          </>
        )}
      </div>
    </article>
  );
}

/** Pinned announcements first, then a collapsible list of past ones. */
export function CoachingAnnouncements({
  announcements,
  ...rest
}: Omit<CardProps, "announcement" | "entries"> & {
  announcements: CoachingAnnouncement[];
  entriesFor: (announcementId: string) => CoachingPost[];
}) {
  const [showPast, setShowPast] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { entriesFor, onChanged, ...rest2 } = rest;
  const cardProps = {
    ...rest2,
    now,
    onChanged: (a: CoachingAnnouncement) => {
      setNow(Date.now());
      onChanged(a);
    },
  };
  const active = announcements.filter((a) => isAnnouncementPinned(a, now));
  const past = announcements.filter((a) => !isAnnouncementPinned(a, now));
  if (!announcements.length) return null;

  return (
    <div className="space-y-4">
      {active.map((a) => (
        <AnnouncementCard key={a.id} announcement={a} entries={entriesFor(a.id)} {...cardProps} />
      ))}
      {past.length > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-1.5 px-1 text-xs font-semibold text-stone-500 hover:text-stone-800"
            aria-expanded={showPast}
          >
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {showPast ? "Hide" : "Show"} past announcements ({past.length})
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPast ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showPast &&
            past.map((a) => <AnnouncementCard key={a.id} announcement={a} entries={entriesFor(a.id)} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}
