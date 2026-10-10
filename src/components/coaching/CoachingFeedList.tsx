"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";
import Toast from "@/components/Toast";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";
import { createClient } from "@/lib/supabase/client";
import {
  CoachingSetupError,
  FEED_PAGE_SIZE,
  fetchAnnouncementEntries,
  fetchAnnouncements,
  fetchPosts,
  fetchReplies,
  fetchSeenTimes,
  isCoachPost,
  markThreadRead,
  type CoachingAnnouncement,
  type CoachingPost,
  type CoachingSpaceSummary,
  type SpaceSeen,
} from "@/lib/coachingFeed";
import { useProfileNames } from "@/components/coaching/coachingUi";
import { CoachingPostCard, type SeenStatus } from "@/components/coaching/CoachingPostCard";
import { PostComposer, type ToastState } from "@/components/coaching/CoachingComposer";
import { CoachingAnnouncements } from "@/components/coaching/CoachingAnnouncements";

const byNewest = (a: CoachingPost, b: CoachingPost) => b.created_at.localeCompare(a.created_at);

/**
 * CoachNow-style feed. With `studentId` it shows one space (and marks it read);
 * without it, a coach sees every space and picks one when posting.
 */
export function CoachingFeedList({
  studentId,
  studentName,
  viewerId,
  viewerName,
  viewerIsCoach,
  spaces,
  onOpenSpace,
  onRead,
}: {
  studentId?: string;
  studentName?: string;
  viewerId: string;
  viewerName: string;
  viewerIsCoach: boolean;
  spaces: CoachingSpaceSummary[];
  onOpenSpace?: (studentId: string, name: string) => void;
  onRead?: () => void;
}) {
  const [posts, setPosts] = useState<CoachingPost[]>([]);
  const [replies, setReplies] = useState<Map<string, CoachingPost[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [announcements, setAnnouncements] = useState<CoachingAnnouncement[]>([]);
  const [entries, setEntries] = useState<Map<string, CoachingPost[]>>(new Map());
  const [seen, setSeen] = useState<Map<string, SpaceSeen>>(new Map());
  const showAnnouncements = !studentId || (!viewerIsCoach && studentId === viewerId);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const postIdsRef = useRef<Set<string>>(new Set());
  postIdsRef.current = new Set(posts.map((p) => p.id));

  const markRead = useCallback(async () => {
    if (!studentId) return;
    await markThreadRead(createClient(), viewerId, studentId);
    onReadRef.current?.();
  }, [viewerId, studentId]);

  const loadPage = useCallback(
    async (before?: string) => {
      const supabase = createClient();
      const page = await fetchPosts(supabase, { studentId, before });
      const pageReplies = await fetchReplies(
        supabase,
        page.map((p) => p.id),
      );
      return { page, pageReplies };
    },
    [studentId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPosts([]);
    setReplies(new Map());
    void (async () => {
      try {
        const supabase = createClient();
        const [{ page, pageReplies }, annList] = await Promise.all([
          loadPage(),
          showAnnouncements ? fetchAnnouncements(supabase) : Promise.resolve([]),
        ]);
        const annEntries = await fetchAnnouncementEntries(
          supabase,
          annList.map((a) => a.id),
        );
        if (cancelled) return;
        setPosts(page);
        setReplies(pageReplies);
        setAnnouncements(annList);
        setEntries(annEntries);
        setHasMore(page.length === FEED_PAGE_SIZE);
        setSetupError(null);
        void markRead();
        const seenTimes = await fetchSeenTimes(supabase, studentId ? [studentId] : page.map((p) => p.student_id));
        if (!cancelled) setSeen(seenTimes);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof CoachingSetupError) setSetupError(err.message);
        else setToast({ message: err instanceof Error ? err.message : "Couldn't load posts.", type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage, markRead, showAnnouncements, studentId]);

  const seenIdsKey = useMemo(
    () => (studentId ? studentId : [...new Set(posts.map((p) => p.student_id))].sort().join(",")),
    [studentId, posts],
  );
  useEffect(() => {
    if (!seenIdsKey) return;
    const refresh = async () => setSeen(await fetchSeenTimes(createClient(), seenIdsKey.split(",")));
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [seenIdsKey]);

  const loadMore = async () => {
    const oldest = posts[posts.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const { page, pageReplies } = await loadPage(oldest.created_at);
      setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]);
      setReplies((prev) => new Map([...prev, ...pageReplies]));
      setHasMore(page.length === FEED_PAGE_SIZE);
      if (!studentId) {
        const more = await fetchSeenTimes(createClient(), page.map((p) => p.student_id));
        setSeen((prev) => new Map([...prev, ...more]));
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Couldn't load more posts.", type: "error" });
    } finally {
      setLoadingMore(false);
    }
  };

  const addPost = useCallback((post: CoachingPost) => {
    setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev].sort(byNewest)));
  }, []);

  const addReply = useCallback((reply: CoachingPost) => {
    if (!reply.parent_id) return;
    setReplies((prev) => {
      const list = prev.get(reply.parent_id!) ?? [];
      if (list.some((r) => r.id === reply.id)) return prev;
      const next = new Map(prev);
      next.set(reply.parent_id!, [...list, reply]);
      return next;
    });
  }, []);

  const addEntry = useCallback((entry: CoachingPost) => {
    if (!entry.announcement_id) return;
    setEntries((prev) => {
      const list = prev.get(entry.announcement_id!) ?? [];
      if (list.some((r) => r.id === entry.id)) return prev;
      const next = new Map(prev);
      next.set(entry.announcement_id!, [...list, entry]);
      return next;
    });
  }, []);

  const addAnnouncement = useCallback((a: CoachingAnnouncement) => {
    setAnnouncements((prev) => (prev.some((x) => x.id === a.id) ? prev : [a, ...prev]));
  }, []);

  const removeById = (id: string) => {
    setEntries((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [k, list] of next) {
        if (list.some((r) => r.id === id)) {
          next.set(k, list.filter((r) => r.id !== id));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setReplies((prev) => {
      const next = new Map(prev);
      next.delete(id);
      for (const [k, list] of next) {
        if (list.some((r) => r.id === id)) next.set(k, list.filter((r) => r.id !== id));
      }
      return next;
    });
  };

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`coaching-feed-${studentId ?? "all"}-${viewerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "coaching_posts",
          ...(studentId ? { filter: `student_id=eq.${studentId}` } : {}),
        },
        (payload) => {
          const post = payload.new as CoachingPost;
          if (post.announcement_id) {
            addEntry(post);
          } else if (post.parent_id) {
            if (postIdsRef.current.has(post.parent_id)) addReply(post);
          } else {
            addPost(post);
          }
          if (post.author_id !== viewerId) void markRead();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [studentId, viewerId, markRead, addPost, addReply, addEntry]);

  useEffect(() => {
    if (!showAnnouncements) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`coaching-announcements-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coaching_announcements" },
        (payload) => {
          addAnnouncement(payload.new as CoachingAnnouncement);
          if (!viewerIsCoach) void markRead();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [showAnnouncements, viewerId, viewerIsCoach, addAnnouncement, markRead]);

  const allAuthors = useMemo(() => {
    const ids: (string | null)[] = posts.map((p) => p.author_id);
    replies.forEach((list) => list.forEach((r) => ids.push(r.author_id)));
    announcements.forEach((a) => ids.push(a.author_id));
    entries.forEach((list) => list.forEach((r) => ids.push(r.author_id, r.student_id)));
    return ids;
  }, [posts, replies, announcements, entries]);
  const names = useProfileNames(allAuthors);
  const spaceNames = useMemo(() => new Map(spaces.map((s) => [s.studentId, s.name] as const)), [spaces]);
  const studentNameFor = (id: string) =>
    (id === studentId ? studentName : undefined) ?? spaceNames.get(id) ?? names.get(id) ?? "Golfer";

  const coachFirst = APP_VIDEO_COACH_NAME.split(" ")[0];

  const seenFor = (p: CoachingPost): SeenStatus | null => {
    const ownSide = viewerIsCoach ? isCoachPost(p) : p.author_id === viewerId;
    if (!ownSide) return null;
    const times = seen.get(p.student_id);
    const lastOpened = (viewerIsCoach ? times?.player : times?.coach) ?? 0;
    const by = viewerIsCoach ? studentNameFor(p.student_id).split(" ")[0] || "player" : coachFirst || "coach";
    return { seen: lastOpened >= Date.parse(p.created_at), by };
  };
  const placeholder = viewerIsCoach
    ? studentId
      ? `Send ${(studentName ?? "").split(" ")[0] || "your student"} a lesson video, drill or note…`
      : "Send a lesson video, drill or note to one player or all players…"
    : `Create post… ask ${coachFirst} a question or send a swing`;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {setupError ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{setupError}</p>
      ) : (
        <PostComposer
          viewerId={viewerId}
          viewerIsCoach={viewerIsCoach}
          studentId={studentId}
          studentName={studentName}
          spaces={studentId ? undefined : spaces}
          placeholder={placeholder}
          onPosted={addPost}
          onAnnounced={viewerIsCoach && !studentId ? addAnnouncement : undefined}
          onToast={setToast}
        />
      )}

      {!loading && showAnnouncements && (
        <CoachingAnnouncements
          announcements={announcements}
          entriesFor={(id) => entries.get(id) ?? []}
          names={names}
          studentNameFor={studentNameFor}
          viewerId={viewerId}
          viewerName={viewerName}
          viewerIsCoach={viewerIsCoach}
          onEntry={addEntry}
          onEntryDeleted={removeById}
          onChanged={(a) => setAnnouncements((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
          onDeleted={(id) => {
            setAnnouncements((prev) => prev.filter((x) => x.id !== id));
            setEntries((prev) => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }}
          onToast={setToast}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading posts…
        </div>
      ) : posts.length === 0 && !setupError && !(showAnnouncements && announcements.length) ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <Video className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-800">Nothing here yet</p>
          <p className="mt-1 text-xs text-stone-500">
            {viewerIsCoach
              ? studentId
                ? `Post a message or video to start ${(studentName ?? "").split(" ")[0] || "this student"}'s space.`
                : "Posts from every space show up here."
              : `Send ${coachFirst} a swing video or a question. His replies show up here.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <CoachingPostCard
              key={post.id}
              post={post}
              replies={replies.get(post.id) ?? []}
              names={names}
              studentName={studentNameFor(post.student_id)}
              viewerId={viewerId}
              viewerName={viewerName}
              viewerIsCoach={viewerIsCoach}
              showSpace={!studentId}
              seenFor={seenFor}
              onOpenSpace={onOpenSpace}
              onDeleted={removeById}
              onReply={addReply}
              onToast={setToast}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Load older posts
            </button>
          )}
        </div>
      )}
    </div>
  );
}
