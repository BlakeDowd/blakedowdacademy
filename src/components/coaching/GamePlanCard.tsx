"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Loader2, Plus, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_VIDEOS_PER_POST,
  createPost,
  fetchGamePlans,
  formatVideoLimit,
  isLikelyVideoFile,
  maxVideoBytes,
  postVideos,
  uploadCoachingVideo,
  type CoachingPost,
  type CoachingVideoRef,
} from "@/lib/coachingFeed";
import { PostVideos } from "@/components/coaching/CoachingPostCard";
import { holdScreenAwake } from "@/components/coaching/CoachingComposer";

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";

function lessonDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

function PlanBody({ plan, studentId, compact }: { plan: CoachingPost; studentId: string; compact?: boolean }) {
  const videos = postVideos(plan);
  return (
    <div className="space-y-2">
      {videos.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-stone-100">
          <PostVideos videos={videos} compact={compact} createdAt={plan.created_at} studentId={studentId} />
        </div>
      )}
      {plan.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{plan.body}</p>}
    </div>
  );
}

/** Coach-only form: one long lesson video (plus optional extras) and the key points in writing. */
function GamePlanForm({
  studentId,
  studentName,
  authorId,
  onPosted,
  onCancel,
}: {
  studentId: string;
  studentName: string;
  authorId: string;
  onPosted: () => void;
  onCancel: () => void;
}) {
  const [videos, setVideos] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ index: number; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const limit = maxVideoBytes(true);

  const pick = (files: FileList | null) => {
    if (!files) return;
    const picked = [...files];
    const ok = picked.filter((f) => isLikelyVideoFile(f) && f.size <= limit);
    if (ok.length < picked.length) setError(`Some files were skipped: videos only, up to ${formatVideoLimit(limit)} each.`);
    else setError(null);
    setVideos((prev) => [...prev, ...ok].slice(0, MAX_VIDEOS_PER_POST));
  };

  const post = async () => {
    if (!videos.length && !notes.trim()) {
      setError("Add a video or write what to work on.");
      return;
    }
    setSending(true);
    setError(null);
    const release = videos.length ? await holdScreenAwake() : () => undefined;
    const uploaded: CoachingVideoRef[] = [];
    try {
      for (let i = 0; i < videos.length; i++) {
        setProgress({ index: i, percent: 0 });
        const v = await uploadCoachingVideo(videos[i]!, {
          title: `${studentName} · Game plan · ${new Date().toLocaleDateString()}${videos.length > 1 ? ` (${i + 1})` : ""}`,
          kind: "game_plan",
          onProgress: (percent) => setProgress({ index: i, percent }),
        });
        uploaded.push({ bunny_video_id: v.videoId, storage_path: v.storagePath });
      }
      const [first, ...extras] = uploaded;
      await createPost(createClient(), {
        studentId,
        authorId,
        title: "Game plan",
        body: notes,
        bunnyVideoId: first?.bunny_video_id ?? null,
        storagePath: first?.storage_path ?? null,
        extraVideos: extras,
        isGamePlan: true,
      });
      onPosted();
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "Upload failed."}${
          uploaded.length ? ` ${uploaded.length} of ${videos.length} videos had uploaded.` : ""
        }`,
      );
    } finally {
      release();
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      {videos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={sending}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#014421]/30 bg-[#014421]/5 px-4 py-6 text-[#014421] hover:bg-[#014421]/10"
        >
          <Video className="h-6 w-6" aria-hidden />
          <span className="text-sm font-bold">Choose your end-of-lesson video</span>
          <span className="text-[11px] text-stone-500">Long videos are fine, up to {formatVideoLimit(limit)}</span>
        </button>
      ) : (
        <ul className="space-y-1.5">
          {videos.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
              <Video className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700">{f.name}</span>
              <span className="shrink-0 text-[11px] text-stone-500">
                {progress && sending
                  ? i < progress.index
                    ? "Uploaded"
                    : i === progress.index
                      ? `${progress.percent}%`
                      : "Waiting"
                  : sizeLabel(f.size)}
              </span>
              {!sending && (
                <button
                  type="button"
                  onClick={() => setVideos((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
          {!sending && videos.length < MAX_VIDEOS_PER_POST && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1 px-1 text-xs font-semibold text-[#014421]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add another video
              </button>
            </li>
          )}
        </ul>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-stone-700">Key points to work on</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={sending}
          placeholder={"e.g.\n1. Grip: left thumb more right of centre\n2. Feel the club stay outside the hands to waist height"}
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30"
        />
      </label>

      {sending && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-[#FFA500] transition-[width]"
              style={{
                width: `${progress ? ((progress.index + progress.percent / 100) / Math.max(1, videos.length)) * 100 : 100}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-stone-500">Keep this screen open until it finishes. Big videos can take a few minutes.</p>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void post()}
          disabled={sending}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#014421] py-3 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-50"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {sending ? "Uploading…" : "Post game plan"}
        </button>
        {!sending && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 text-sm font-semibold text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The coach's latest "what to work on" video and notes, pinned above the coaching feed.
 * Players only see it once there's a plan; coaches can post a new one.
 */
export function GamePlanCard({
  studentId,
  studentName,
  viewerId,
  viewerIsCoach,
  onPosted,
}: {
  studentId: string;
  studentName: string;
  viewerId: string;
  viewerIsCoach: boolean;
  onPosted?: () => void;
}) {
  const [plans, setPlans] = useState<CoachingPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlans(await fetchGamePlans(createClient(), studentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the game plan.");
    } finally {
      setLoaded(true);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return null;
  if (!viewerIsCoach && (error || plans.length === 0)) return null;

  const [latest, ...earlier] = plans;
  const firstName = studentName.split(" ")[0] || "the player";

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#014421] to-[#0b6b3a] px-4 py-4 text-white">
        <ClipboardList className="absolute -right-3 -top-3 h-24 w-24 text-white opacity-10" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#FFA500]">Game plan</p>
        <h3 className="mt-0.5 text-xl font-extrabold leading-tight">
          {viewerIsCoach ? `What ${firstName} is working on` : "What to work on"}
        </h3>
        <p className="mt-1 text-xs text-white/75">
          {latest ? `From the lesson on ${lessonDate(latest.created_at)}` : "Nothing posted yet"}
        </p>
      </div>

      <div className="space-y-3 p-3">
        {error && viewerIsCoach && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}

        {latest ? (
          <PlanBody plan={latest} studentId={studentId} />
        ) : (
          !adding &&
          viewerIsCoach &&
          !error && (
            <p className="text-sm text-stone-600">
              Film your end-of-lesson summary and post it here. It stays pinned at the top of {firstName}&apos;s Coaching tab.
            </p>
          )
        )}

        {earlier.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowEarlier((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-xs font-semibold text-stone-600"
              aria-expanded={showEarlier}
            >
              Earlier game plans ({earlier.length})
              <ChevronDown className={`h-4 w-4 transition-transform ${showEarlier ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {showEarlier && (
              <ul className="mt-1 space-y-3">
                {earlier.map((p) => (
                  <li key={p.id} className="rounded-2xl bg-stone-50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      {lessonDate(p.created_at)}
                    </p>
                    <PlanBody plan={p} studentId={studentId} compact />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {viewerIsCoach && !error &&
          (adding ? (
            <GamePlanForm
              studentId={studentId}
              studentName={studentName}
              authorId={viewerId}
              onCancel={() => setAdding(false)}
              onPosted={() => {
                setAdding(false);
                void load();
                onPosted?.();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#014421]/20 py-3 text-sm font-bold text-[#014421] hover:bg-[#014421]/5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {latest ? "Post a new game plan" : "Post a game plan"}
            </button>
          ))}
      </div>
    </section>
  );
}
