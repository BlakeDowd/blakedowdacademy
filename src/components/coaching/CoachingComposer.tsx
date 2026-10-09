"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ImageIcon, Loader2, Paperclip, Send, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_COACHING_PHOTO_BYTES,
  MAX_VIDEOS_PER_POST,
  formatVideoLimit,
  maxVideoBytes,
  ANNOUNCEMENT_PHOTO_FOLDER,
  createAnnouncement,
  createPost,
  isLikelyImageFile,
  isLikelyVideoFile,
  uploadCoachingPhoto,
  uploadCoachingVideo,
  type CoachingAnnouncement,
  type CoachingPost,
  type CoachingSpaceSummary,
  type CoachingVideoRef,
} from "@/lib/coachingFeed";
import { Avatar } from "@/components/coaching/coachingUi";

export type ToastState = { message: string; type: "success" | "error" | "info" | "warning" } | null;

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

type Progress = { index: number; total: number; percent: number } | null;

type MediaInput = {
  photoFolder: string;
  videoTitle: string;
  authorId: string;
  authorIsCoach: boolean;
  videos: File[];
  photo: File | null;
  onProgress: (p: Progress) => void;
};

type SubmitInput = Omit<MediaInput, "photoFolder" | "videoTitle"> & {
  studentId: string;
  studentName: string;
  parentId?: string;
  announcementId?: string;
  body: string;
  notes?: { keyIssues: string; contact: string; directional: string };
};

type SubmitResult = { post: CoachingPost | null; failed: File[]; firstError: unknown };

/** Stops the phone screen sleeping (which pauses uploads) while videos are sending. */
export async function holdScreenAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    const lock = await nav.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}

/**
 * Uploads the photo, then videos one at a time (more reliable on phones).
 * Videos that failed come back in `failed` so they can be retried.
 */
async function uploadMedia(input: MediaInput) {
  const imagePath = input.photo ? await uploadCoachingPhoto(input.photo, input.photoFolder) : null;
  const uploaded: CoachingVideoRef[] = [];
  const failed: File[] = [];
  let firstError: unknown = null;

  const release = input.videos.length ? await holdScreenAwake() : () => undefined;
  try {
    for (let i = 0; i < input.videos.length; i++) {
      const file = input.videos[i]!;
      input.onProgress({ index: i, total: input.videos.length, percent: 0 });
      try {
        const v = await uploadCoachingVideo(file, {
          title: `${input.videoTitle} · ${new Date().toLocaleDateString()}${input.videos.length > 1 ? ` (${i + 1})` : ""}`,
          rawCopyOwnerId: input.authorIsCoach ? undefined : input.authorId,
          onProgress: (percent) => input.onProgress({ index: i, total: input.videos.length, percent }),
        });
        uploaded.push({ bunny_video_id: v.videoId, storage_path: v.storagePath });
      } catch (err) {
        failed.push(file);
        firstError ??= err;
      }
    }
  } finally {
    release();
  }
  return { imagePath, uploaded, failed, firstError };
}

/** Creates a post in one player's space with whatever media uploaded. */
async function submit(input: SubmitInput): Promise<SubmitResult> {
  const { imagePath, uploaded, failed, firstError } = await uploadMedia({
    ...input,
    photoFolder: input.studentId,
    videoTitle: input.studentName,
  });

  if (input.videos.length && !uploaded.length && !imagePath && !input.body.trim()) {
    return { post: null, failed, firstError };
  }

  const [first, ...extras] = uploaded;
  const hasVideo = Boolean(first);
  const post = await createPost(createClient(), {
    studentId: input.studentId,
    authorId: input.authorId,
    parentId: input.parentId,
    announcementId: input.announcementId,
    body: input.body,
    bunnyVideoId: first?.bunny_video_id ?? null,
    storagePath: first?.storage_path ?? null,
    extraVideos: extras,
    imagePath,
    keyIssues: hasVideo ? input.notes?.keyIssues : undefined,
    contactInfo: hasVideo ? input.notes?.contact : undefined,
    directionalMisses: hasVideo ? input.notes?.directional : undefined,
  });
  return { post, failed, firstError };
}

async function submitAnnouncement(
  input: Omit<MediaInput, "photoFolder" | "videoTitle"> & { body: string; pinnedUntil: string | null },
): Promise<{ announcement: CoachingAnnouncement | null; failed: File[]; firstError: unknown }> {
  const { imagePath, uploaded, failed, firstError } = await uploadMedia({
    ...input,
    photoFolder: ANNOUNCEMENT_PHOTO_FOLDER,
    videoTitle: "Announcement",
  });
  if (!uploaded.length && !imagePath && !input.body.trim()) return { announcement: null, failed, firstError };
  const [first, ...extras] = uploaded;
  const announcement = await createAnnouncement(createClient(), {
    authorId: input.authorId,
    body: input.body,
    bunnyVideoId: first?.bunny_video_id ?? null,
    extraVideos: extras,
    imagePath,
    pinnedUntil: input.pinnedUntil,
  });
  return { announcement, failed, firstError };
}

/** End of the chosen local day, as an ISO timestamp. */
function endOfDay(dateValue: string): string | null {
  if (!dateValue) return null;
  const d = new Date(`${dateValue}T23:59:59`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function dateInputValue(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ALL_PLAYERS = "__all__";

function failureMessage(result: { post?: unknown; announcement?: unknown; failed: File[]; firstError: unknown }): string {
  const posted = Boolean(result.post ?? result.announcement);
  const n = result.failed.length;
  const reason = result.firstError instanceof Error ? ` (${result.firstError.message})` : "";
  if (!posted) return `${n === 1 ? "The video" : `All ${n} videos`} failed to upload${reason}.`;
  return `Posted, but ${n} video${n === 1 ? "" : "s"} didn't upload${reason}. They're still attached — tap Post to send them.`;
}

/** One optional photo and up to MAX_VIDEOS_PER_POST videos per post. */
function useAttachments(onToast: (t: ToastState) => void, isCoach: boolean) {
  const [videos, setVideos] = useState<File[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const videoLimit = maxVideoBytes(isCoach);

  const pick = (picked: File[]) => {
    const nextVideos: File[] = [];
    let skippedLarge = 0;
    let skippedOther = 0;
    for (const file of picked) {
      if (isLikelyImageFile(file)) {
        if (file.size > MAX_COACHING_PHOTO_BYTES) {
          onToast({ message: "That photo is over 25 MB. Choose a smaller one.", type: "warning" });
        } else {
          setPhoto(file);
        }
      } else if (!isLikelyVideoFile(file)) {
        skippedOther++;
      } else if (file.size > videoLimit) {
        skippedLarge++;
      } else {
        nextVideos.push(file);
      }
    }
    if (skippedOther) onToast({ message: "Choose photos or videos (JPG, PNG, MP4 or MOV).", type: "warning" });
    if (skippedLarge) {
      onToast({
        message: `${skippedLarge} video${skippedLarge === 1 ? " is" : "s are"} over ${formatVideoLimit(videoLimit)}. Trim ${skippedLarge === 1 ? "it" : "them"} or export shorter clips.`,
        type: "warning",
      });
    }
    if (!nextVideos.length) return;
    setVideos((prev) => {
      const merged = [...prev, ...nextVideos];
      if (merged.length > MAX_VIDEOS_PER_POST) {
        onToast({ message: `Up to ${MAX_VIDEOS_PER_POST} videos per post. Extra ones weren't added.`, type: "warning" });
      }
      return merged.slice(0, MAX_VIDEOS_PER_POST);
    });
  };

  const clear = () => {
    setVideos([]);
    setPhoto(null);
  };
  const removeVideo = (index: number) => setVideos((prev) => prev.filter((_, i) => i !== index));

  return {
    videos,
    photo,
    setVideos,
    setPhoto,
    pick,
    clear,
    removeVideo,
    hasAny: videos.length > 0 || photo !== null,
    full: videos.length >= MAX_VIDEOS_PER_POST,
  };
}

function PhotoChip({ file, onRemove }: { file: File; onRemove?: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") setPreview(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
    };
  }, [file]);
  return (
    <div className="relative inline-block">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Photo to attach"
          className="h-24 w-24 rounded-xl object-cover ring-1 ring-stone-200"
          onError={() => setPreview(null)}
        />
      ) : (
        <span className="flex h-24 w-24 items-center justify-center rounded-xl bg-stone-100">
          <ImageIcon className="h-6 w-6 text-stone-400" aria-hidden />
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow"
          aria-label="Remove photo"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}

type VideoStatus = "done" | "uploading" | "waiting";

function VideoChip({
  file,
  status,
  percent = 0,
  onRemove,
}: {
  file: File;
  status?: VideoStatus;
  percent?: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
      <Video className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700">{file.name}</span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-stone-500">
        {status === "done" ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-[#014421]" aria-hidden />
            <span className="font-semibold text-[#014421]">Uploaded</span>
          </>
        ) : status === "uploading" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#014421]" aria-hidden />
            {percent}%
          </>
        ) : status === "waiting" ? (
          "Waiting"
        ) : (
          `${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function Attachments({
  photo,
  videos,
  sending,
  progress,
  onRemovePhoto,
  onRemoveVideo,
}: {
  photo: File | null;
  videos: File[];
  sending: boolean;
  progress: Progress;
  onRemovePhoto: () => void;
  onRemoveVideo: (index: number) => void;
}) {
  if (!photo && !videos.length) return null;
  const statusFor = (i: number): VideoStatus | undefined => {
    if (!sending || !progress) return undefined;
    if (i < progress.index || (i === progress.index && progress.percent >= 100)) return "done";
    if (i === progress.index) return "uploading";
    return "waiting";
  };
  return (
    <div className="space-y-2">
      {sending && <UploadProgress progress={progress} hasVideos={videos.length > 0} />}
      {photo && <PhotoChip file={photo} onRemove={sending ? undefined : onRemovePhoto} />}
      {videos.map((file, i) => (
        <VideoChip
          key={`${file.name}-${file.size}-${i}`}
          file={file}
          status={statusFor(i)}
          percent={progress?.index === i ? progress.percent : 0}
          onRemove={sending ? undefined : () => onRemoveVideo(i)}
        />
      ))}
    </div>
  );
}

function UploadProgress({ progress, hasVideos }: { progress: Progress; hasVideos: boolean }) {
  const overall = progress ? Math.round((progress.index * 100 + progress.percent) / progress.total) : 0;
  return (
    <div className="rounded-2xl bg-[#014421]/5 px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#014421]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{sendingLabel(progress)}</span>
        {progress && <span className="shrink-0 tabular-nums">{overall}%</span>}
      </div>
      {hasVideos && (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-[#014421] transition-all duration-300" style={{ width: `${overall}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-stone-500">Keep this screen open until it says it&apos;s posted.</p>
        </>
      )}
    </div>
  );
}

function FileInputLabel({
  id,
  accept,
  multiple,
  disabled,
  onPick,
  children,
  className,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  onPick: (files: File[]) => void;
  children: React.ReactNode;
  className: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          if (ref.current) ref.current.value = "";
        }}
      />
      <label htmlFor={id} className={`${className} ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
        {children}
      </label>
    </>
  );
}

function postedMessage(videoCount: number, where = ""): string {
  const uploaded = videoCount > 1 ? `All ${videoCount} videos uploaded and posted` : "Video uploaded and posted";
  return `${videoCount ? uploaded : "Posted"}${where ? ` ${where}` : ""}. ✓`;
}

function sendingLabel(progress: Progress): string {
  if (!progress) return "Sending…";
  if (progress.percent >= 100 && progress.index === progress.total - 1) return "Posting…";
  return progress.total > 1
    ? `Video ${progress.index + 1} of ${progress.total} · ${progress.percent}%`
    : `Uploading ${progress.percent}%`;
}

/** "Create post…" box. Pass `spaces` (coach feed) to choose which space it goes to. */
export function PostComposer({
  viewerId,
  viewerIsCoach,
  studentId,
  studentName,
  spaces,
  placeholder,
  onPosted,
  onAnnounced,
  onToast,
}: {
  viewerId: string;
  viewerIsCoach: boolean;
  studentId?: string;
  studentName?: string;
  spaces?: CoachingSpaceSummary[];
  placeholder: string;
  onPosted: (post: CoachingPost) => void;
  onAnnounced?: (announcement: CoachingAnnouncement) => void;
  onToast: (t: ToastState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [targetId, setTargetId] = useState("");
  const [pinDate, setPinDate] = useState(() => dateInputValue(7));
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState({ keyIssues: "", contact: "", directional: "" });
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const files = useAttachments(onToast, viewerIsCoach);

  const toAll = !studentId && targetId === ALL_PLAYERS && Boolean(onAnnounced);
  const target = studentId
    ? { id: studentId, name: studentName ?? "" }
    : (() => {
        const s = spaces?.find((x) => x.studentId === targetId);
        return s ? { id: s.studentId, name: s.name } : null;
      })();
  const canSend = !sending && (Boolean(target) || toAll) && (body.trim().length > 0 || files.hasAny);
  const field =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/15";
  const chipButton =
    "inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200";
  const idBase = `coaching-post-${studentId ?? "feed"}`;

  const reset = () => {
    setOpen(false);
    setBody("");
    files.clear();
    setShowNotes(false);
    setNotes({ keyIssues: "", contact: "", directional: "" });
  };

  const sendAnnouncement = async () => {
    setSending(true);
    try {
      const result = await submitAnnouncement({
        authorId: viewerId,
        authorIsCoach: viewerIsCoach,
        body,
        videos: files.videos,
        photo: files.photo,
        pinnedUntil: endOfDay(pinDate),
        onProgress: setProgress,
      });
      if (result.announcement) onAnnounced?.(result.announcement);
      if (result.failed.length) {
        onToast({ message: failureMessage(result), type: result.announcement ? "warning" : "error" });
        if (result.announcement) {
          setBody("");
          files.setPhoto(null);
        }
        files.setVideos(result.failed);
      } else {
        reset();
        onToast({ message: postedMessage(files.videos.length, "to all players"), type: "success" });
      }
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Couldn't send that. Try again.", type: "error" });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const send = async () => {
    if (!canSend) return;
    if (toAll) return sendAnnouncement();
    if (!target) return;
    setSending(true);
    try {
      const result = await submit({
        studentId: target.id,
        studentName: target.name,
        authorId: viewerId,
        authorIsCoach: viewerIsCoach,
        body,
        videos: files.videos,
        photo: files.photo,
        notes,
        onProgress: setProgress,
      });
      if (result.post) onPosted(result.post);
      if (result.failed.length) {
        onToast({ message: failureMessage(result), type: result.post ? "warning" : "error" });
        if (result.post) {
          setBody("");
          files.setPhoto(null);
          setNotes({ keyIssues: "", contact: "", directional: "" });
        }
        files.setVideos(result.failed);
      } else {
        const sent = files.videos.length;
        reset();
        const where = viewerIsCoach ? `to ${target.name.split(" ")[0] || "the player"}'s feed` : "";
        onToast({ message: postedMessage(sent, where), type: "success" });
      }
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Couldn't post that. Try again.", type: "error" });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  if (!open) {
    const pickAndOpen = (picked: File[]) => {
      files.pick(picked);
      setOpen(true);
    };
    return (
      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-left text-sm text-stone-400 hover:border-stone-400"
        >
          {placeholder}
        </button>
        <div className="flex items-center gap-2">
          <FileInputLabel
            id={`${idBase}-quick-video`}
            accept={VIDEO_ACCEPT}
            multiple
            disabled={false}
            onPick={pickAndOpen}
            className={chipButton}
          >
            <Video className="h-3.5 w-3.5" aria-hidden />
            Videos
          </FileInputLabel>
          <FileInputLabel id={`${idBase}-quick-photo`} 
            accept={PHOTO_ACCEPT}
            disabled={false}
            onPick={pickAndOpen}
            className={chipButton}
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            Photo
          </FileInputLabel>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl bg-white p-4 shadow-md ring-1 ring-stone-200">
      {studentId && viewerIsCoach && (
        <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          <span className="text-xs font-semibold text-stone-500">To</span>
          <Avatar name={studentName || "Golfer"} size="sm" userId={target?.id} />
          <span className="min-w-0 truncate font-semibold text-stone-800">{studentName || "Golfer"}</span>
          <span className="ml-auto shrink-0 text-[11px] text-stone-500">Private</span>
        </div>
      )}
      {!studentId && (
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className={`${field} font-medium`}
          aria-label="Post to space"
          disabled={sending}
        >
          <option value="">Post to which space?</option>
          {onAnnounced && <option value={ALL_PLAYERS}>📣 All players (announcement)</option>}
          {[...(spaces ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.name}
              </option>
            ))}
        </select>
      )}
      {toAll && (
        <div className="rounded-2xl bg-[#FFA500]/10 px-3 py-2.5 text-xs text-stone-700">
          <p>
            Every player sees this pinned at the top of their feed. Their replies stay private between them and you.
          </p>
          <label className="mt-2 flex items-center gap-2 font-semibold text-stone-800">
            Pinned until
            <input
              type="date"
              value={pinDate}
              min={dateInputValue(0)}
              onChange={(e) => setPinDate(e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium"
              disabled={sending}
            />
          </label>
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        autoFocus
        placeholder={toAll ? "e.g. This week's game: best 9-hole score wins a free lesson…" : placeholder}
        className={field}
        disabled={sending}
      />
      <Attachments
        photo={files.photo}
        videos={files.videos}
        sending={sending}
        progress={progress}
        onRemovePhoto={() => files.setPhoto(null)}
        onRemoveVideo={files.removeVideo}
      />
      {files.videos.length > 0 && !toAll && (
        <div>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#014421]"
            aria-expanded={showNotes}
          >
            {showNotes ? "Hide swing notes" : "Add swing notes (optional)"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showNotes ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showNotes && (
            <div className="mt-2 space-y-2">
              <textarea
                value={notes.keyIssues}
                onChange={(e) => setNotes((n) => ({ ...n, keyIssues: e.target.value }))}
                rows={2}
                placeholder="Key issues"
                className={field}
              />
              <textarea
                value={notes.contact}
                onChange={(e) => setNotes((n) => ({ ...n, contact: e.target.value }))}
                rows={2}
                placeholder="Contact: fat, thin, centred, low point…"
                className={field}
              />
              <textarea
                value={notes.directional}
                onChange={(e) => setNotes((n) => ({ ...n, directional: e.target.value }))}
                rows={2}
                placeholder="Directional misses: push, pull, fade, draw…"
                className={field}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <FileInputLabel
          id={`${idBase}-photo`}
          accept={PHOTO_ACCEPT}
          disabled={sending}
          onPick={files.pick}
          className={chipButton}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          Photo
        </FileInputLabel>
        <FileInputLabel
          id={`${idBase}-video`}
          accept={VIDEO_ACCEPT}
          multiple
          disabled={sending || files.full}
          onPick={files.pick}
          className={chipButton}
        >
          <Video className="h-3.5 w-3.5" aria-hidden />
          {files.videos.length ? `Videos ${files.videos.length}/${MAX_VIDEOS_PER_POST}` : "Videos"}
        </FileInputLabel>
        <button
          type="button"
          onClick={reset}
          disabled={sending}
          className="ml-auto rounded-full px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#014421] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#013320] disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          {sending ? sendingLabel(progress) : "Post"}
        </button>
      </div>
    </div>
  );
}

/**
 * "Say something…" row with an optional photo and videos. Replies to a post (`parentId`)
 * or adds to a player's private thread on an announcement (`announcementId`).
 */
export function ReplyComposer({
  studentId,
  parentId,
  announcementId,
  placeholder = "Say something…",
  viewerId,
  viewerName,
  viewerIsCoach,
  studentName,
  onPosted,
  onToast,
}: {
  studentId: string;
  parentId?: string;
  announcementId?: string;
  placeholder?: string;
  viewerId: string;
  viewerName: string;
  viewerIsCoach: boolean;
  studentName: string;
  onPosted: (reply: CoachingPost) => void;
  onToast: (t: ToastState) => void;
}) {
  const inputId = `coaching-reply-file-${parentId ?? `${announcementId}-${studentId}`}`;
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const files = useAttachments(onToast, viewerIsCoach);
  const canSend = !sending && (body.trim().length > 0 || files.hasAny);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await submit({
        studentId,
        studentName,
        authorId: viewerId,
        authorIsCoach: viewerIsCoach,
        parentId,
        announcementId,
        body,
        videos: files.videos,
        photo: files.photo,
        onProgress: setProgress,
      });
      if (result.post) {
        onPosted(result.post);
        setBody("");
        files.setPhoto(null);
      }
      files.setVideos(result.failed);
      if (result.failed.length) {
        onToast({ message: failureMessage(result), type: result.post ? "warning" : "error" });
      } else if (files.videos.length) {
        onToast({ message: postedMessage(files.videos.length), type: "success" });
      }
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "Couldn't send that reply.", type: "error" });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <Attachments
        photo={files.photo}
        videos={files.videos}
        sending={sending}
        progress={progress}
        onRemovePhoto={() => files.setPhoto(null)}
        onRemoveVideo={files.removeVideo}
      />
      <div className="flex items-center gap-2">
        <Avatar name={viewerName} coach={viewerIsCoach} size="sm" userId={viewerId} />
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-stone-300 bg-white pr-1 focus-within:border-[#014421]">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={sending ? sendingLabel(progress) : placeholder}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            disabled={sending}
            aria-label="Reply"
          />
          <FileInputLabel
            id={inputId}
            accept={`${PHOTO_ACCEPT},${VIDEO_ACCEPT}`}
            multiple
            disabled={sending || files.full}
            onPick={files.pick}
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            <span className="sr-only">Attach photos or videos</span>
          </FileInputLabel>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="rounded-full p-1.5 text-[#014421] hover:bg-[#014421]/10 disabled:text-stone-300"
            aria-label="Send reply"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
