"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Crosshair,
  Download,
  ImageIcon,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Play,
  Target,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { APP_VIDEO_COACH_NAME, buildBunnyThumbnailUrl } from "@/lib/bunnyStream";
import { createClient } from "@/lib/supabase/client";
import {
  authJsonHeaders,
  isCoachPost,
  postVideos,
  signedPhotoUrl,
  type CoachingPost,
  type CoachingPostVideo,
} from "@/lib/coachingFeed";
import { Avatar, timeAgo } from "@/components/coaching/coachingUi";
import { ReplyComposer, type ToastState } from "@/components/coaching/CoachingComposer";
import {
  CoachingVideoAnalyzer,
  useHasVideoAnnotations,
  videoAnnotationKey,
} from "@/components/coaching/CoachingVideoAnalyzer";

export function postAuthorName(post: CoachingPost, names: Map<string, string>, studentName: string): string {
  if (!isCoachPost(post)) return studentName;
  return (post.author_id && names.get(post.author_id)) || APP_VIDEO_COACH_NAME;
}

/** Bunny has no thumbnail until it finishes processing an upload; keep retrying for this long after posting. */
const PROCESSING_WINDOW_MS = 30 * 60 * 1000;
const PROCESSING_RETRY_MS = 5000;

/** Portrait iPhone footage; used until the real shape is known from the thumbnail. */
const PHONE_VIDEO_ASPECT = 9 / 16;
const VIDEO_STAGE_HEIGHT = "h-[min(110vw,460px)]";

export function PostVideo({
  video,
  compact,
  createdAt,
  studentId,
}: {
  video: CoachingPostVideo;
  compact?: boolean;
  createdAt?: string;
  studentId?: string | null;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [drawingsVersion, setDrawingsVersion] = useState(0);
  const [aspect, setAspect] = useState(PHONE_VIDEO_ASPECT);
  const hasDrawings = useHasVideoAnnotations(videoAnnotationKey(video), drawingsVersion);
  const content = (
    <>
      <PostVideoPlayer
        video={video}
        compact={compact}
        createdAt={createdAt}
        paused={analyzing}
        onAspect={(w, h) => {
          if (w > 0 && h > 0) setAspect(w / h);
        }}
      />
      <button
        type="button"
        onClick={() => setAnalyzing(true)}
        className={`absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full font-bold text-white shadow ${
          hasDrawings ? "bg-[#FFA500]/95 text-[#3d2600]" : "bg-black/60"
        } ${compact ? "p-1.5" : "px-2.5 py-1 text-[11px]"}`}
        aria-label={hasDrawings ? "Open coach drawings" : "Analyse swing"}
      >
        <PenLine className="h-3.5 w-3.5" aria-hidden />
        {!compact && (hasDrawings ? "Coach drawings" : "Analyse")}
      </button>
      {analyzing && (
        <CoachingVideoAnalyzer
          video={video}
          studentId={studentId}
          onClose={() => setAnalyzing(false)}
          onSaved={() => setDrawingsVersion((n) => n + 1)}
        />
      )}
    </>
  );
  if (compact) return <div className="relative">{content}</div>;
  // Fixed stage height so every slide (thumbnail or playing) is the same size; the frame
  // matches the video's own shape so the player never letterboxes it in black.
  return (
    <div className={`flex ${VIDEO_STAGE_HEIGHT} w-full items-center justify-center bg-stone-100`}>
      <div
        className="relative"
        style={{ aspectRatio: aspect, width: `min(100%, calc(min(110vw, 460px) * ${aspect}))` }}
      >
        {content}
      </div>
    </div>
  );
}

function PostVideoPlayer({
  video,
  compact,
  createdAt,
  paused,
  onAspect,
}: {
  video: CoachingPostVideo;
  compact?: boolean;
  createdAt?: string;
  paused?: boolean;
  onAspect?: (width: number, height: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  if (paused && playing) setPlaying(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStoredFile = !video.bunny_video_id && Boolean(video.storage_bucket && video.storage_path);
  const baseThumb = video.bunny_video_id && !thumbFailed ? buildBunnyThumbnailUrl(video.bunny_video_id) : null;
  const thumb = baseThumb && attempt ? `${baseThumb}?v=${attempt}` : baseThumb;

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const onThumbError = () => {
    const age = createdAt ? Date.now() - Date.parse(createdAt) : Infinity;
    if (age < PROCESSING_WINDOW_MS) {
      setProcessing(true);
      retryTimer.current = setTimeout(() => setAttempt((n) => n + 1), PROCESSING_RETRY_MS);
    } else {
      setProcessing(false);
      setThumbFailed(true);
    }
  };

  if (!video.bunny_video_id && !isStoredFile) return null;

  const start = async () => {
    setPlaying(true);
    if (!isStoredFile || fileUrl) return;
    const { data, error: signError } = await createClient()
      .storage.from(video.storage_bucket!)
      .createSignedUrl(video.storage_path!, 3600);
    if (signError || !data?.signedUrl) setError("This video couldn't be loaded.");
    else setFileUrl(data.signedUrl);
  };

  const frame = compact
    ? "relative aspect-[9/16] w-36 overflow-hidden rounded-2xl"
    : "relative flex h-full w-full items-center justify-center overflow-hidden";

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className={`${frame} group ${compact ? "bg-stone-900" : "bg-stone-200"}`}
        aria-label="Play video"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${processing ? "invisible" : ""}`}
            onLoad={(e) => {
              setProcessing(false);
              onAspect?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
            }}
            onError={onThumbError}
          />
        ) : (
          <Video className={`h-10 w-10 ${compact ? "text-stone-600" : "text-stone-400"}`} aria-hidden />
        )}
        {processing ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-stone-800/80 px-2 text-center text-white">
            <Loader2 className={`animate-spin ${compact ? "h-5 w-5" : "h-7 w-7"}`} aria-hidden />
            <span className={`font-semibold ${compact ? "text-[10px]" : "text-xs"}`}>Processing video…</span>
            {!compact && <span className="text-[11px] text-white/70">Uploaded. Ready to play in a minute or two.</span>}
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className={`flex items-center justify-center rounded-full border-[3px] border-white bg-black/35 shadow-lg transition group-hover:scale-105 ${
                compact ? "h-11 w-11" : "h-14 w-14"
              }`}
            >
              <Play className={`ml-1 fill-white text-white ${compact ? "h-5 w-5" : "h-6 w-6"}`} aria-hidden />
            </span>
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`${frame} bg-black`}>
      {video.bunny_video_id ? (
        <BunnyVideoPlayer videoId={video.bunny_video_id} fill autoplay />
      ) : fileUrl ? (
        <video
          src={fileUrl}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={(e) => onAspect?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <span className="text-xs text-stone-300">
          {error ?? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        </span>
      )}
    </div>
  );
}

/** One video, or a swipeable row of them with a counter and dots. */
export function PostVideos({
  videos,
  compact,
  createdAt,
  studentId,
}: {
  videos: CoachingPostVideo[];
  compact?: boolean;
  createdAt?: string;
  studentId?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  if (!videos.length) return null;
  if (videos.length === 1) return <PostVideo video={videos[0]!} compact={compact} createdAt={createdAt} studentId={studentId} />;

  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {videos.map((v, i) => (
          <div key={`${v.bunny_video_id ?? v.storage_path}-${i}`} className="shrink-0">
            <PostVideo video={v} compact createdAt={createdAt} studentId={studentId} />
          </div>
        ))}
      </div>
    );
  }

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== index) setIndex(next);
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {videos.map((v, i) => (
          <div key={`${v.bunny_video_id ?? v.storage_path}-${i}`} className="w-full shrink-0 snap-center snap-always">
            <PostVideo video={v} createdAt={createdAt} studentId={studentId} />
          </div>
        ))}
      </div>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
        {index + 1} / {videos.length}
      </span>
      <div className="flex justify-center gap-1.5 py-2">
        {videos.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-[#014421]" : "w-1.5 bg-stone-300"}`}
            aria-label={`Show video ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function useSignedPhoto(path: string | null): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ path: string | null; url: string | null; failed: boolean }>({
    path: null,
    url: null,
    failed: false,
  });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void signedPhotoUrl(path).then((url) => {
      if (!cancelled) setState({ path, url, failed: !url });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state.path === path ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}

export function PostPhoto({ path, compact }: { path: string; compact?: boolean }) {
  const { url, failed } = useSignedPhoto(path);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const frame = compact
    ? "relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl bg-stone-200"
    : "relative flex max-h-[min(110vw,460px)] min-h-40 w-full items-center justify-center overflow-hidden bg-stone-100";

  if (!url) {
    return (
      <div className={frame}>
        {failed ? (
          <span className="flex flex-col items-center gap-1 text-xs text-stone-500">
            <ImageIcon className="h-6 w-6 text-stone-400" aria-hidden />
            Photo unavailable
          </span>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-stone-400" aria-hidden />
        )}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setZoomed(true)} className={frame} aria-label="View photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className={compact ? "h-full w-full object-cover" : "max-h-[min(110vw,460px)] w-auto max-w-full object-contain"}
        />
      </button>
      {zoomed &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            aria-label="Close photo"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>,
          document.body,
        )}
    </>
  );
}

function NoteRow({ icon, label, value }: { icon: ReactNode; label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
        {icon}
        {label}
      </p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function SwingNotes({ post }: { post: CoachingPost }) {
  if (!post.key_issues && !post.contact_info && !post.directional_misses) return null;
  return (
    <div className="space-y-2">
      <NoteRow icon={<Target className="h-3.5 w-3.5" aria-hidden />} label="Key issues" value={post.key_issues} />
      <NoteRow icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />} label="Contact" value={post.contact_info} />
      <NoteRow
        icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden />}
        label="Directional misses"
        value={post.directional_misses}
      />
    </div>
  );
}

function PostMenu({
  post,
  authorName,
  onDeleted,
  onToast,
}: {
  post: CoachingPost;
  authorName: string;
  onDeleted: (id: string) => void;
  onToast: (t: ToastState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const downloadable = isCoachPost(post)
    ? []
    : postVideos(post)
        .map((v) => v.bunny_video_id)
        .filter((id): id is string => Boolean(id));

  const download = async (videoId: string, n: number) => {
    setBusy("download");
    try {
      const res = await fetch(`/api/bunny/swings/${encodeURIComponent(videoId)}`, {
        cache: "no-store",
        headers: await authJsonHeaders(),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Download failed");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${authorName.replace(/[^\w-]+/g, "_")}-${post.created_at.slice(0, 10)}${downloadable.length > 1 ? `-${n}` : ""}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Download failed", type: "error" });
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const remove = async () => {
    setOpen(false);
    const what = post.parent_id ? "reply" : "post and its replies";
    if (!window.confirm(`Delete this ${what}? Any video in it is removed too. This can't be undone.`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/coaching/posts/${post.id}`, { method: "DELETE", headers: await authJsonHeaders() });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(post.id);
      if (data.warnings?.length) onToast({ message: data.warnings.join(" "), type: "warning" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Delete failed", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
        aria-label="Post options"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-stone-200 bg-white py-1 shadow-lg">
          {downloadable.map((videoId, i) => (
            <button
              key={videoId}
              type="button"
              onClick={() => void download(videoId, i + 1)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              {downloadable.length > 1 ? `Download video ${i + 1}` : "Download original"}
            </button>
          ))}
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

export function Reply({
  reply,
  name,
  viewerIsCoach,
  onDeleted,
  onToast,
}: {
  reply: CoachingPost;
  name: string;
  viewerIsCoach: boolean;
  onDeleted: (id: string) => void;
  onToast: (t: ToastState) => void;
}) {
  const fromCoach = isCoachPost(reply);
  const replyVideos = postVideos(reply);
  return (
    <li className="flex gap-2">
      <Avatar name={name} coach={fromCoach} size="sm" userId={reply.author_id} />
      <div className="min-w-0 flex-1">
        <div className={`rounded-2xl px-3 py-2 ${fromCoach ? "bg-[#014421]/5" : "bg-stone-100"}`}>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold text-stone-900">{name}</p>
            {fromCoach && <span className="text-[10px] font-semibold text-[#014421]">Coach</span>}
          </div>
          {reply.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">{reply.body}</p>}
          {reply.image_path && (
            <div className="mt-2">
              <PostPhoto path={reply.image_path} compact />
            </div>
          )}
          {replyVideos.length > 0 && (
            <div className="mt-2">
              <PostVideos videos={replyVideos} compact createdAt={reply.created_at} studentId={reply.student_id} />
            </div>
          )}
          {(reply.key_issues || reply.contact_info || reply.directional_misses) && (
            <div className="mt-2">
              <SwingNotes post={reply} />
            </div>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 pl-3">
          <span className="text-[11px] text-stone-400">{timeAgo(reply.created_at)}</span>
          {viewerIsCoach && <PostMenu post={reply} authorName={name} onDeleted={onDeleted} onToast={onToast} />}
        </div>
      </div>
    </li>
  );
}

export function CoachingPostCard({
  post,
  replies,
  names,
  studentName,
  viewerId,
  viewerName,
  viewerIsCoach,
  showSpace,
  onOpenSpace,
  onDeleted,
  onReply,
  onToast,
}: {
  post: CoachingPost;
  replies: CoachingPost[];
  names: Map<string, string>;
  studentName: string;
  viewerId: string;
  viewerName: string;
  viewerIsCoach: boolean;
  showSpace?: boolean;
  onOpenSpace?: (studentId: string, name: string) => void;
  onDeleted: (id: string) => void;
  onReply: (reply: CoachingPost) => void;
  onToast: (t: ToastState) => void;
}) {
  const fromCoach = isCoachPost(post);
  const authorName = postAuthorName(post, names, studentName);
  const videos = postVideos(post);
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, replies.length - 3);
  const shown = replies.slice(hidden);

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <header className="flex items-start gap-3 px-4 pt-4">
        <Avatar name={authorName} coach={fromCoach} userId={post.author_id} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-stone-900">
            {authorName}
            {fromCoach && (
              <span className="rounded-full bg-[#014421]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#014421]">
                Coach
              </span>
            )}
          </p>
          {showSpace ? (
            <button
              type="button"
              onClick={() => onOpenSpace?.(post.student_id, studentName)}
              className="truncate text-xs font-medium text-sky-600 hover:underline"
            >
              In {studentName}&apos;s space
            </button>
          ) : (
            <p className="text-xs text-stone-500">{fromCoach ? "Coach feedback" : "Posted to the space"}</p>
          )}
        </div>
        <span className="pt-0.5 text-xs text-stone-500">{timeAgo(post.created_at)}</span>
        {viewerIsCoach && <PostMenu post={post} authorName={authorName} onDeleted={onDeleted} onToast={onToast} />}
      </header>

      {post.title && !post.body && <p className="px-4 pt-3 text-sm font-semibold text-stone-800">{post.title}</p>}
      {post.body && <p className="whitespace-pre-wrap px-4 pt-3 text-sm leading-relaxed text-stone-700">{post.body}</p>}
      {(post.key_issues || post.contact_info || post.directional_misses) && (
        <div className="px-4 pt-3">
          <SwingNotes post={post} />
        </div>
      )}

      {post.image_path && (
        <div className="mt-3">
          <PostPhoto path={post.image_path} />
        </div>
      )}
      {videos.length > 0 && (
        <div className={post.image_path ? "mt-1" : "mt-3"}>
          <PostVideos videos={videos} createdAt={post.created_at} studentId={post.student_id} />
        </div>
      )}

      <div className="space-y-3 border-t border-stone-100 px-4 py-3 mt-3">
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs font-semibold text-stone-500 hover:text-stone-800"
          >
            View {hidden} earlier repl{hidden === 1 ? "y" : "ies"}
          </button>
        )}
        {shown.length > 0 && (
          <ul className="space-y-3">
            {shown.map((r) => (
              <Reply
                key={r.id}
                reply={r}
                name={postAuthorName(r, names, studentName)}
                viewerIsCoach={viewerIsCoach}
                onDeleted={onDeleted}
                onToast={onToast}
              />
            ))}
          </ul>
        )}
        <ReplyComposer
          studentId={post.student_id}
          parentId={post.id}
          viewerId={viewerId}
          viewerName={viewerName}
          viewerIsCoach={viewerIsCoach}
          studentName={studentName}
          onPosted={onReply}
          onToast={onToast}
        />
      </div>
    </article>
  );
}
