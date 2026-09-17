"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CloudUpload,
  Crosshair,
  Download,
  Loader2,
  MessageSquare,
  MessageSquareText,
  Target,
  Trash2,
  Video,
} from "lucide-react";
import * as tus from "tus-js-client";
import { useAuth } from "@/contexts/AuthContext";
import Toast from "@/components/Toast";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { createClient } from "@/lib/supabase/client";
import { formatBunnyDuration } from "@/lib/bunnyStream";

import { isCoachEmail } from "@/lib/coachEmails";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

type BunnySwingWorkflowProps = {
  onOpenFeedback?: () => void;
  reviewVideoId?: string | null;
};

type BunnyListItem = {
  guid: string;
  title: string;
  length: number;
  status: number;
  hasOriginal?: boolean | null;
  dateUploaded?: string;
};

type StudentSwingMeta = {
  bunny_video_id: string;
  title: string | null;
  uploaded_by: string | null;
  player_name: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

function formatApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const msg = (payload as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function isLikelyVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  // iOS Photos often leaves type empty for library videos
  return /\.(mp4|mov|m4v|webm|avi|mpeg|mpg)$/i.test(file.name);
}

async function readApiJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      error:
        text.slice(0, 180) ||
        `Upload failed (${res.status}). Try a shorter MP4/MOV clip.`,
    };
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function registerSwingInBrowserInbox(input: {
  videoId: string;
  title: string;
  keyIssues: string;
  contactInfo: string;
  directionalMisses: string;
  storagePath?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    throw new Error("You must be signed in to save this swing to the inbox.");
  }

  const { error } = await supabase.from("bunny_student_swings").upsert(
    {
      bunny_video_id: input.videoId,
      title: input.title || null,
      uploaded_by: user.id,
      key_issues: input.keyIssues || null,
      contact_info: input.contactInfo || null,
      directional_misses: input.directionalMisses || null,
      storage_path: input.storagePath || null,
    },
    { onConflict: "bunny_video_id" },
  );
  if (error) {
    throw new Error(
      error.message.toLowerCase().includes("row-level security")
        ? "Could not save swing to inbox (RLS). Run the latest bunny_student_swings RLS SQL in Supabase, then try again."
        : `Could not save swing to inbox: ${error.message}`,
    );
  }
}

async function uploadRawSwingCopy(file: File, videoId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    throw new Error("You must be signed in to upload a swing.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const storagePath = `${user.id}/${videoId}.${ext}`;
  const { error } = await supabase.storage.from("swing-submissions").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || "video/mp4",
  });
  if (error) {
    throw new Error(`Could not save raw copy for coach download: ${error.message}`);
  }
  return storagePath;
}

function ClientNoteField({
  label,
  icon,
  value,
}: {
  label: string;
  icon: ReactNode;
  value: string | null | undefined;
}) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {icon}
        {label}
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export default function BunnySwingWorkflow({
  onOpenFeedback,
  reviewVideoId,
}: BunnySwingWorkflowProps) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isCoach = isCoachEmail(user?.email);

  const [items, setItems] = useState<BunnyListItem[]>([]);
  const [studentSwings, setStudentSwings] = useState<StudentSwingMeta[]>([]);
  const [deletableVideoIds, setDeletableVideoIds] = useState<string[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [keyIssuesDraft, setKeyIssuesDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [directionalDraft, setDirectionalDraft] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bunny/swings", {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const data = (await res.json()) as {
        items?: BunnyListItem[];
        studentSwings?: StudentSwingMeta[];
        configured?: boolean;
        error?: string;
        deletableVideoIds?: string[];
      };
      setConfigured(Boolean(data.configured));
      if (!res.ok) {
        setConfigError(data.error || "Could not reach Bunny Stream.");
        setItems([]);
        setStudentSwings([]);
        setDeletableVideoIds([]);
        return;
      }
      setConfigError(null);
      const swings = Array.isArray(data.studentSwings) ? data.studentSwings : [];
      const scopedSwings = isCoach
        ? swings
        : swings.filter((s) => !user?.id || s.uploaded_by === user.id);
      const deletable = Array.isArray(data.deletableVideoIds)
        ? data.deletableVideoIds
        : scopedSwings.map((s) => s.bunny_video_id);
      const bunnyById = new Map(
        (Array.isArray(data.items) ? data.items : []).map((v) => [v.guid, v] as const),
      );
      // Prefer registry rows so swings stay visible while Bunny is still processing.
      const list: BunnyListItem[] = scopedSwings.map((s) => {
        const fromBunny = bunnyById.get(s.bunny_video_id);
        if (fromBunny) {
          return {
            ...fromBunny,
            title: s.player_name
              ? `${s.player_name} · ${fromBunny.title || s.title || "Swing"}`
              : fromBunny.title || s.title || "Swing",
          };
        }
        return {
          guid: s.bunny_video_id,
          title: s.player_name
            ? `${s.player_name} · ${s.title || "Processing…"}`
            : s.title || "Processing…",
          length: 0,
          status: 0,
        };
      });
      setItems(list);
      setStudentSwings(scopedSwings);
      setDeletableVideoIds(deletable);
      setSelectedId((prev) => {
        if (prev && list.some((v) => v.guid === prev)) return prev;
        return list[0]?.guid || "";
      });
    } catch (err: unknown) {
      setConfigured(false);
      setConfigError(err instanceof Error ? err.message : "Failed to load Bunny videos");
      setItems([]);
      setStudentSwings([]);
      setDeletableVideoIds([]);
    } finally {
      setLoading(false);
    }
  }, [isCoach, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void loadVideos();
  }, [user?.id, loadVideos]);

  useEffect(() => {
    if (reviewVideoId) setSelectedId(reviewVideoId);
  }, [reviewVideoId]);

  const selected = items.find((v) => v.guid === selectedId) ?? null;
  const selectedNotes = useMemo(
    () => studentSwings.find((s) => s.bunny_video_id === selectedId) ?? null,
    [studentSwings, selectedId],
  );
  const canDeleteSelected = Boolean(
    isCoach && selectedId && deletableVideoIds.includes(selectedId),
  );
  const hasClientNotes =
    Boolean(keyIssuesDraft.trim()) ||
    Boolean(contactDraft.trim()) ||
    Boolean(directionalDraft.trim());

  if (!user?.id) return null;

  const fieldClassName =
    "w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/20";

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!hasClientNotes) {
      setToast({
        message:
          "Add Key issues, Contact, or Directional misses so Blake knows what to work on.",
        type: "warning",
      });
      return;
    }
    if (!isLikelyVideoFile(file)) {
      setToast({
        message: "Please choose a video from your library (MP4 or MOV).",
        type: "warning",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setToast({
        message: "Video is too large (max ~200MB). Trim it or export a shorter clip.",
        type: "warning",
      });
      return;
    }

    setUploading(true);
    setUploadPercent(0);
    let preparedVideoId: string | null = null;
    const notesPayload = {
      keyIssues: keyIssuesDraft.trim(),
      contactInfo: contactDraft.trim(),
      directionalMisses: directionalDraft.trim(),
    };
    const videoTitle = uploadTitle.trim() || file.name.replace(/\.[^.]+$/, "") || "Swing upload";

    try {
      const prepRes = await fetch("/api/bunny/swings", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phase: "prepare",
          title: videoTitle,
          ...notesPayload,
        }),
      });
      const prepData = await readApiJson(prepRes);
      if (!prepRes.ok) throw new Error(formatApiError(prepData, "Could not start upload"));

      const upload =
        prepData && typeof prepData === "object" && "upload" in prepData
          ? (prepData as {
              upload?: {
                videoId: string;
                libraryId: string;
                expirationTime: number;
                signature: string;
                endpoint: string;
              };
            }).upload
          : null;
      if (!upload?.videoId || !upload.signature) {
        throw new Error("Upload credentials missing from server.");
      }
      preparedVideoId = upload.videoId;

      await registerSwingInBrowserInbox({
        videoId: upload.videoId,
        title: videoTitle,
        keyIssues: notesPayload.keyIssues,
        contactInfo: notesPayload.contactInfo,
        directionalMisses: notesPayload.directionalMisses,
      });
      if (isCoach) await loadVideos();

      // Upload to Bunny + store a raw copy for coach download (Bunny CDN often blocks /original).
      let storagePath: string | null = null;
      await new Promise<void>((resolve, reject) => {
        const tusUpload = new tus.Upload(file, {
          endpoint: upload.endpoint || "https://video.bunnycdn.com/tusupload",
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: upload.signature,
            AuthorizationExpire: String(upload.expirationTime),
            VideoId: upload.videoId,
            LibraryId: upload.libraryId,
          },
          metadata: {
            filename: file.name || "swing.mp4",
            filetype: file.type || "video/mp4",
            title: videoTitle,
          },
          onError: (error) => reject(error),
          onProgress: (bytesUploaded, bytesTotal) => {
            if (bytesTotal > 0) {
              setUploadPercent(Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)));
            }
          },
          onSuccess: () => resolve(),
        });

        void (async () => {
          try {
            storagePath = await uploadRawSwingCopy(file, upload.videoId);
          } catch (err) {
            console.warn("[Send to Blake] raw copy upload failed:", err);
          }
          tusUpload.start();
        })();
      });

      if (storagePath) {
        await registerSwingInBrowserInbox({
          videoId: upload.videoId,
          title: videoTitle,
          keyIssues: notesPayload.keyIssues,
          contactInfo: notesPayload.contactInfo,
          directionalMisses: notesPayload.directionalMisses,
          storagePath,
        });
      }

      setUploadPercent(100);
      await registerSwingInBrowserInbox({
        videoId: upload.videoId,
        title: videoTitle,
        keyIssues: notesPayload.keyIssues,
        contactInfo: notesPayload.contactInfo,
        directionalMisses: notesPayload.directionalMisses,
        storagePath,
      });

      const completeRes = await fetch("/api/bunny/swings", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phase: "complete",
          videoId: upload.videoId,
          title: videoTitle,
          ...notesPayload,
        }),
      });
      const completeData = await readApiJson(completeRes);
      if (!completeRes.ok) throw new Error(formatApiError(completeData, "Could not finish upload"));

      const video =
        completeData && typeof completeData === "object" && "video" in completeData
          ? ((completeData as { video?: BunnyListItem }).video as BunnyListItem | undefined)
          : undefined;

      setToast({
        message: isCoach
          ? "Video sent with client notes."
          : "Video sent to Blake with your notes.",
        type: "success",
      });
      setUploadTitle("");
      setKeyIssuesDraft("");
      setContactDraft("");
      setDirectionalDraft("");
      if (fileRef.current) fileRef.current.value = "";
      if (isCoach) {
        await loadVideos();
        if (video?.guid) setSelectedId(video.guid);
        else if (upload.videoId) setSelectedId(upload.videoId);
      }
    } catch (err: unknown) {
      if (preparedVideoId) {
        void fetch(`/api/bunny/swings?videoId=${encodeURIComponent(preparedVideoId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      const raw = err instanceof Error ? err.message : "Upload failed";
      setToast({
        message:
          /expected pattern|payload too large|too large/i.test(raw)
            ? "Upload failed. Try an MP4/MOV under a few minutes long, or check your connection."
            : raw,
        type: "error",
      });
    } finally {
      setUploading(false);
      setUploadPercent(null);
    }
  };

  const handleDownloadRaw = async () => {
    if (!selectedId || !isCoach) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/bunny/swings/${encodeURIComponent(selectedId)}`, {
        cache: "no-store",
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatApiError(data, "Raw download failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(selected?.title || "swing").replace(/[^\w\-]+/g, "_")}-original.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({
        message: "Raw footage download started — save to Photos/Files on your phone.",
        type: "success",
      });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Download failed",
        type: "error",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !isCoach) return;
    if (!deletableVideoIds.includes(selectedId)) {
      setToast({
        message:
          "Library drills like Hell Drill are protected. Only student swings (Send to Blake) can be deleted.",
        type: "warning",
      });
      return;
    }
    if (
      !window.confirm(
        "Delete this student swing from Bunny Stream? This cannot be undone. Download the raw file first if you still need it.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/bunny/swings/${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatApiError(data, "Delete failed"));
      setToast({ message: "Student swing deleted from Bunny Stream.", type: "success" });
      setSelectedId("");
      await loadVideos();
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Delete failed",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      ) : null}

      <div className="mb-3">
        <h2 className="text-base font-semibold tracking-tight text-stone-900">
          Online Coaching
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          {isCoach
            ? "Review student swings and their notes, then reply in Feedback."
            : "Send Blake your swing and tell him what you’re struggling with."}
        </p>
      </div>

      {configured === false || configError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
          <p className="font-semibold">Bunny API setup needed</p>
          <p className="mt-1 leading-relaxed">
            {configError ||
              "Set BUNNY_STREAM_API_KEY in .env.local to your Stream library API key (Bunny → Stream → your library → API). Do not paste the library ID (742155)."}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {isCoach ? "1 · Send swing (with notes)" : "Send to Blake"}
          </label>
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Title (optional)"
            className={fieldClassName}
          />
          <textarea
            value={keyIssuesDraft}
            onChange={(e) => setKeyIssuesDraft(e.target.value)}
            rows={2}
            placeholder="Key issues — what do you want Blake to look at?"
            className={fieldClassName}
          />
          <textarea
            value={contactDraft}
            onChange={(e) => setContactDraft(e.target.value)}
            rows={2}
            placeholder="Contact — fat, thin, centered, low point…"
            className={fieldClassName}
          />
          <textarea
            value={directionalDraft}
            onChange={(e) => setDirectionalDraft(e.target.value)}
            rows={2}
            placeholder="Directional misses — left / right, push, pull, curve…"
            className={fieldClassName}
          />
          <input
            id="send-to-blake-video"
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              void handleUpload(picked);
            }}
          />
          <label
            htmlFor="send-to-blake-video"
            aria-disabled={uploading || configured === false || !hasClientNotes}
            className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#013320] ${
              uploading || configured === false || !hasClientNotes
                ? "pointer-events-none opacity-60"
                : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CloudUpload className="h-4 w-4" aria-hidden />
            )}
            {uploading
              ? uploadPercent != null
                ? `Sending… ${uploadPercent}%`
                : "Sending to Blake…"
              : "Send video to Blake"}
          </label>
          {!hasClientNotes ? (
            <p className="text-center text-[11px] text-stone-500">
              Fill in at least one note above before sending.
            </p>
          ) : null}
        </div>

        {isCoach ? (
          <>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Student swing to review
          </label>
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-3 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading swings…
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500">
              No student swings yet. When a client sends a video with notes, it appears here.
            </p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={`${fieldClassName} bg-white py-2.5`}
            >
              {items.map((v) => (
                <option key={v.guid} value={v.guid}>
                  {v.title}
                  {v.length ? ` · ${formatBunnyDuration(v.length)}` : ""}
                  {v.hasOriginal === false ? " · no original" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedId ? (
          <div className="overflow-hidden rounded-xl bg-black">
            <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px]">
              <BunnyVideoPlayer videoId={selectedId} fill />
            </div>
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-stone-100 text-stone-400">
            <Video className="h-8 w-8" aria-hidden />
          </div>
        )}

        {selectedNotes ? (
          <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              {`Client notes${selectedNotes.player_name ? ` · ${selectedNotes.player_name}` : ""}`}
            </p>
            {selected?.length === 0 ? (
              <p className="text-xs text-amber-800">
                Bunny is still processing this swing — it stays in your inbox and will play when ready.
              </p>
            ) : null}
            <ClientNoteField
              label="Key issues"
              icon={<Target className="h-3.5 w-3.5" aria-hidden />}
              value={selectedNotes.key_issues}
            />
            <ClientNoteField
              label="Contact"
              icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />}
              value={selectedNotes.contact_info}
            />
            <ClientNoteField
              label="Directional misses"
              icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden />}
              value={selectedNotes.directional_misses}
            />
          </div>
        ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!selectedId || downloading || configured === false}
                onClick={() => void handleDownloadRaw()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-white disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                2 · Download raw
              </button>
              <button
                type="button"
                disabled={!selectedId || deleting || configured === false || !canDeleteSelected}
                onClick={() => void handleDelete()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                3 · Delete on Bunny
              </button>
            </div>

            <button
              type="button"
              onClick={() => onOpenFeedback?.()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#014421]/20 bg-[#014421]/5 px-3 py-2.5 text-sm font-semibold text-[#014421] hover:bg-[#014421]/10"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              4 · Send response in Feedback tab
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
