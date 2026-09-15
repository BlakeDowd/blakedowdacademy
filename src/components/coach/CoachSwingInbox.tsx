"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Trash2, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/Toast";

type SwingAngle = "down_the_line" | "face_on" | string;

type InboxItem = {
  id: string;
  userId: string;
  storagePath: string;
  angle: SwingAngle;
  createdAt: string;
  studentName: string;
};

function formatAngleBadge(angle: SwingAngle): string {
  const normalized = String(angle || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "down_the_line" || normalized === "dtl") return "Down the Line";
  if (normalized === "face_on" || normalized === "faceon" || normalized === "fo") return "Face On";
  if (!angle) return "Unknown angle";
  return String(angle);
}

function formatSubmissionDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSupabaseError(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const e = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [e.message, e.details, e.hint, e.code ? `code ${e.code}` : ""]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Failed to load pending swing submissions";
  }
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function mapSwingRow(row: Record<string, unknown>): InboxItem | null {
  const id = firstString(row, ["id"]);
  if (!id) return null;

  return {
    id,
    userId: firstString(row, [
      "student_id",
      "profile_id",
      "player_id",
      "user_id",
      "submitted_by",
      "auth_user_id",
    ]),
    storagePath: firstString(row, [
      "storage_path",
      "file_path",
      "video_path",
      "path",
      "object_path",
      "slo_mo_path",
    ]),
    angle: firstString(row, ["angle", "camera_angle", "view", "swing_angle", "camera_view"]) || "face_on",
    createdAt: firstString(row, ["created_at", "submitted_at", "uploaded_at"]) || new Date(0).toISOString(),
    studentName: "Golfer",
  };
}

export default function CoachSwingInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Select * so we tolerate schema variants (student_id vs user_id, etc.).
      const { data, error } = await supabase
        .from("student_swings")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || [])
        .map((row) => mapSwingRow(row as Record<string, unknown>))
        .filter((row): row is InboxItem => Boolean(row));

      const studentIds = Array.from(new Set(mapped.map((r) => r.userId).filter(Boolean)));

      const nameById = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        if (profileError) {
          console.warn("[CoachSwingInbox] profile lookup failed:", formatSupabaseError(profileError));
        } else {
          for (const p of profiles || []) {
            const id = String((p as { id?: string }).id || "");
            const name = String((p as { full_name?: string | null }).full_name || "").trim();
            if (id) nameById.set(id, name || "Golfer");
          }
        }
      }

      setItems(
        mapped.map((row) => ({
          ...row,
          studentName: nameById.get(row.userId) || "Golfer",
        })),
      );
    } catch (err: unknown) {
      const message = formatSupabaseError(err);
      console.error("[CoachSwingInbox] fetch failed:", message, err);
      setToast({
        message:
          message.includes("PGRST205") || message.toLowerCase().includes("could not find the table")
            ? "student_swings table is missing — run the latest Supabase migration."
            : message || "Failed to load pending swing submissions",
        type: "error",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const handleDownload = async (item: InboxItem) => {
    if (!item.storagePath) {
      setToast({ message: "Missing storage path for this submission.", type: "error" });
      return;
    }

    setDownloadingId(item.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("swing-submissions")
        .createSignedUrl(item.storagePath, 3600, { download: true });

      if (error || !data?.signedUrl) {
        throw error ?? new Error("Could not create download link");
      }

      // Navigate to the signed URL with Content-Disposition: attachment so iOS Safari
      // can download the binary and save it to Photos/Files.
      window.location.assign(data.signedUrl);
    } catch (err: unknown) {
      const message = formatSupabaseError(err);
      console.error("[CoachSwingInbox] download failed:", message, err);
      setToast({ message: message || "Failed to generate download link", type: "error" });
      setDownloadingId(null);
    }
  };

  const handleVerifyAndDelete = async (item: InboxItem) => {
    if (deletingId) return;

    setDeletingId(item.id);
    // Optimistic remove
    setItems((prev) => prev.filter((row) => row.id !== item.id));

    try {
      const supabase = createClient();

      if (item.storagePath) {
        const { error: storageError } = await supabase.storage
          .from("swing-submissions")
          .remove([item.storagePath]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from("student_swings")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      setToast({
        message: `Verified & removed ${item.studentName}'s swing.`,
        type: "success",
      });
    } catch (err: unknown) {
      const message = formatSupabaseError(err);
      console.error("[CoachSwingInbox] verify/delete failed:", message, err);
      // Restore the card if delete failed
      setItems((prev) => {
        if (prev.some((row) => row.id === item.id)) return prev;
        return [...prev, item].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
      setToast({
        message: message || "Failed to verify and delete submission",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="w-full">
      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-stone-900">
            Swing inbox
          </h2>
          <p className="text-xs text-stone-500">
            Pending student submissions awaiting Sportsbox verification
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPending()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-10 text-sm text-stone-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading pending swings…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center shadow-sm">
          <Video className="mx-auto mb-2 h-8 w-8 text-stone-300" aria-hidden />
          <p className="text-sm font-medium text-stone-700">No pending swings</p>
          <p className="mt-1 text-xs text-stone-500">New student uploads will show up here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const isDownloading = downloadingId === item.id;
            const isDeleting = deletingId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-stone-900">
                      {item.studentName}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formatSubmissionDate(item.createdAt)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-[#014421]/10 px-2.5 py-1 text-[11px] font-semibold text-[#014421]">
                    {formatAngleBadge(item.angle)}
                  </span>
                </div>

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
                    {isDownloading ? "Preparing…" : "Download Slo-Mo Video"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleVerifyAndDelete(item)}
                    disabled={isDeleting || isDownloading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </>
                    )}
                    {isDeleting ? "Removing…" : "Verified in Sportsbox & Delete"}
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
