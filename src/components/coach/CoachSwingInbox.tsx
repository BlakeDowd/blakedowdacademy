"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Loader2,
  MessageSquareText,
  Trash2,
  Video,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Toast from "@/components/Toast";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { createClient } from "@/lib/supabase/client";

import { isCoachEmail } from "@/lib/coachEmails";

type InboxSwing = {
  bunny_video_id: string;
  title: string | null;
  uploaded_by: string | null;
  player_name: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

function formatSubmissionDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const msg = (payload as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function formatSupabaseError(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Failed to load swing inbox";
}

type CoachSwingInboxProps = {
  onReviewSwing?: (videoId: string) => void;
};

export default function CoachSwingInbox({ onReviewSwing }: CoachSwingInboxProps) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email);
  const [items, setItems] = useState<InboxSwing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  const loadInbox = useCallback(async () => {
    if (!isCoach) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("bunny_student_swings")
        .select(
          "bunny_video_id, title, uploaded_by, key_issues, contact_info, directional_misses, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as Omit<InboxSwing, "player_name">[];
      const uploaderIds = Array.from(
        new Set(rows.map((r) => r.uploaded_by).filter((id): id is string => Boolean(id))),
      );
      const nameById = new Map<string, string>();
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", uploaderIds);
        for (const p of profiles || []) {
          const id = String((p as { id?: string }).id || "");
          const name = String((p as { full_name?: string | null }).full_name || "").trim();
          if (id) nameById.set(id, name || "Golfer");
        }
      }

      setItems(
        rows.map((row) => ({
          ...row,
          player_name: (row.uploaded_by && nameById.get(row.uploaded_by)) || null,
        })),
      );
    } catch (err: unknown) {
      setToast({
        message: formatSupabaseError(err),
        type: "error",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isCoach]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  if (!isCoach) return null;

  const handleDownload = async (item: InboxSwing) => {
    setDownloadingId(item.bunny_video_id);
    try {
      const res = await fetch(
        `/api/bunny/swings/${encodeURIComponent(item.bunny_video_id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatApiError(data, "Raw download failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (item.player_name || item.title || "swing").replace(/[^\w\-]+/g, "_");
      a.download = `${safeName}-original.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ message: "Raw download started.", type: "success" });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Download failed",
        type: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (item: InboxSwing) => {
    if (
      !window.confirm(
        `Remove ${item.player_name || "this player"}'s swing from Bunny? Download first if you still need it.`,
      )
    ) {
      return;
    }
    setDeletingId(item.bunny_video_id);
    try {
      const res = await fetch(
        `/api/bunny/swings/${encodeURIComponent(item.bunny_video_id)}`,
        {
          method: "DELETE",
          headers: await (async () => {
            const supabase = createClient();
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            return token ? { Authorization: `Bearer ${token}` } : {};
          })(),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatApiError(data, "Delete failed"));

      const supabase = createClient();
      await supabase.from("bunny_student_swings").delete().eq("bunny_video_id", item.bunny_video_id);

      setItems((prev) => prev.filter((row) => row.bunny_video_id !== item.bunny_video_id));
      setToast({
        message: `Removed ${item.player_name || "player"}'s swing.`,
        type: "success",
      });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Delete failed",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="w-full">
      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-stone-900">
            Swing inbox
          </h2>
          <p className="text-xs text-stone-500">
            Player swings sent via Online Coaching — with their notes
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInbox()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-10 text-sm text-stone-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading swings…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center shadow-sm">
          <Video className="mx-auto mb-2 h-8 w-8 text-stone-300" aria-hidden />
          <p className="text-sm font-medium text-stone-700">No student swings yet</p>
          <p className="mt-1 text-xs text-stone-500">
            When a player sends a video to Blake, their name and swing appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const expanded = expandedId === item.bunny_video_id;
            const isDownloading = downloadingId === item.bunny_video_id;
            const isDeleting = deletingId === item.bunny_video_id;
            const notePreview =
              item.key_issues?.trim() ||
              item.directional_misses?.trim() ||
              item.contact_info?.trim() ||
              "";
            return (
              <li
                key={item.bunny_video_id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(expanded ? null : item.bunny_video_id);
                    onReviewSwing?.(item.bunny_video_id);
                  }}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-stone-900">
                        {item.player_name || "Golfer"}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatSubmissionDate(item.created_at)}
                        {item.title ? ` · ${item.title}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[#014421]/10 px-2.5 py-1 text-[11px] font-semibold text-[#014421]">
                      Online Coaching
                    </span>
                  </div>
                  {notePreview ? (
                    <p className="mt-2 line-clamp-2 text-xs text-stone-600">
                      <MessageSquareText className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      {notePreview}
                    </p>
                  ) : null}
                </button>

                {expanded ? (
                  <div className="mt-3 space-y-3">
                    <div className="overflow-hidden rounded-xl bg-black">
                      <div className="relative mx-auto aspect-[9/16] w-full max-w-[240px]">
                        <BunnyVideoPlayer videoId={item.bunny_video_id} fill />
                      </div>
                    </div>
                    {(item.key_issues || item.contact_info || item.directional_misses) && (
                      <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
                        {item.key_issues ? (
                          <p>
                            <span className="font-semibold text-stone-500">Key issues: </span>
                            {item.key_issues}
                          </p>
                        ) : null}
                        {item.contact_info ? (
                          <p>
                            <span className="font-semibold text-stone-500">Contact: </span>
                            {item.contact_info}
                          </p>
                        ) : null}
                        {item.directional_misses ? (
                          <p>
                            <span className="font-semibold text-stone-500">Directional: </span>
                            {item.directional_misses}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleDownload(item)}
                    disabled={isDownloading || isDeleting}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#013320] disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    {isDownloading ? "Preparing…" : "Download raw"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    disabled={isDeleting || isDownloading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                    {isDeleting ? "Removing…" : "Delete swing"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
