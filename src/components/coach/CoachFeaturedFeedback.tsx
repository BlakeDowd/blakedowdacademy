"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Crosshair, Loader2, MessageSquareText, Target, Upload, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Toast from "@/components/Toast";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";

const COACH_EMAILS = ["bdowd@pgamember.org.au", "allendowd86@gmail.com"];
const FEEDBACK_BUCKET = "coach-feedback";

type FeedbackRow = {
  id: string;
  student_id: string;
  coach_id: string | null;
  storage_path: string;
  notes: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

function formatSupabaseError(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code ? `code ${e.code}` : ""]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Something went wrong";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function FeedbackField({
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

export default function CoachFeaturedFeedback() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);
  const [targetStudentId, setTargetStudentId] = useState<string>("");
  const [keyIssuesDraft, setKeyIssuesDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [directionalDraft, setDirectionalDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  const isCoach = COACH_EMAILS.includes((user?.email || "").toLowerCase().trim());
  const libraryStudentId = isCoach ? targetStudentId || user?.id || "" : user?.id || "";
  const selected = items.find((row) => row.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (!isCoach) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name")
          .order("full_name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const rows = (data || [])
          .map((p) => ({
            id: String((p as { id?: string }).id || ""),
            full_name: String((p as { full_name?: string | null }).full_name || "").trim() || "Golfer",
          }))
          .filter((p) => p.id);
        setStudents(rows);
        setTargetStudentId((prev) => prev || user?.id || rows[0]?.id || "");
      } catch (err) {
        console.warn("[CoachFeaturedFeedback] student list failed:", formatSupabaseError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCoach, user?.id]);

  const loadFeedbackLibrary = useCallback(async () => {
    if (!libraryStudentId) {
      setItems([]);
      setSelectedId(null);
      setPlaybackUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("coach_swing_feedback")
        .select(
          "id, student_id, coach_id, storage_path, notes, key_issues, contact_info, directional_misses, created_at",
        )
        .eq("student_id", libraryStudentId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data as FeedbackRow[] | null) ?? [];
      setItems(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (err: unknown) {
      const message = formatSupabaseError(err);
      console.error("[CoachFeaturedFeedback] load failed:", message, err);
      setToast({
        message:
          message.includes("PGRST205") ||
          message.toLowerCase().includes("could not find the table") ||
          message.toLowerCase().includes("column")
            ? "Feedback table needs an update — run the latest Supabase migration (focus fields)."
            : message,
        type: "error",
      });
      setItems([]);
      setSelectedId(null);
      setPlaybackUrl(null);
    } finally {
      setLoading(false);
    }
  }, [libraryStudentId]);

  useEffect(() => {
    void loadFeedbackLibrary();
  }, [loadFeedbackLibrary]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!selected?.storage_path) {
        setPlaybackUrl(null);
        return;
      }
      try {
        const supabase = createClient();
        const { data: signed, error: signedError } = await supabase.storage
          .from(FEEDBACK_BUCKET)
          .createSignedUrl(selected.storage_path, 3600);
        if (signedError) throw signedError;
        if (!cancelled) setPlaybackUrl(signed?.signedUrl ?? null);
      } catch (err: unknown) {
        console.error("[CoachFeaturedFeedback] signed URL failed:", formatSupabaseError(err), err);
        if (!cancelled) setPlaybackUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.storage_path]);

  const handleUpload = async (file: File | null) => {
    if (!file || !user?.id) return;
    const studentId = isCoach ? targetStudentId || user.id : user.id;
    if (!studentId) {
      setToast({ message: "Choose a student before uploading.", type: "error" });
      return;
    }

    if (!file.type.startsWith("video/")) {
      setToast({ message: "Please choose a video file.", type: "error" });
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const storagePath = `${studentId}/${Date.now()}-feedback.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(FEEDBACK_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "video/mp4",
        });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from("coach_swing_feedback")
        .insert({
          student_id: studentId,
          coach_id: user.id,
          storage_path: storagePath,
          key_issues: keyIssuesDraft.trim() || null,
          contact_info: contactDraft.trim() || null,
          directional_misses: directionalDraft.trim() || null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      setKeyIssuesDraft("");
      setContactDraft("");
      setDirectionalDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setToast({
        message: "Feedback saved — it stays in this tab for the student to rewatch.",
        type: "success",
      });

      if (studentId === libraryStudentId) {
        await loadFeedbackLibrary();
        if (inserted?.id) setSelectedId(String(inserted.id));
      } else {
        setTargetStudentId(studentId);
      }
    } catch (err: unknown) {
      const message = formatSupabaseError(err);
      console.error("[CoachFeaturedFeedback] upload failed:", message, err);
      setToast({ message, type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const fieldClassName =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/20";

  return (
    <section>
      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      ) : null}

      <div className="mb-4">
        <h3 className="text-sm font-semibold text-stone-800">Coaching feedback</h3>
        <p className="mt-1 text-xs text-stone-500">
          Feedback videos stay here so students can rewatch anytime.
        </p>
      </div>

      {isCoach ? (
        <div className="mb-4 space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
            Student
          </label>
          <select
            value={targetStudentId}
            onChange={(e) => setTargetStudentId(e.target.value)}
            className={fieldClassName}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Key issues
            </label>
            <textarea
              value={keyIssuesDraft}
              onChange={(e) => setKeyIssuesDraft(e.target.value)}
              rows={2}
              placeholder="Main things to work on with this player…"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Contact
            </label>
            <textarea
              value={contactDraft}
              onChange={(e) => setContactDraft(e.target.value)}
              rows={2}
              placeholder="Strike quality — fat, thin, centered, low point…"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Directional misses
            </label>
            <textarea
              value={directionalDraft}
              onChange={(e) => setDirectionalDraft(e.target.value)}
              rows={2}
              placeholder="Left / right, push, pull, fade, draw…"
              className={fieldClassName}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={uploading || !targetStudentId}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#013320] disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {uploading ? "Uploading…" : "Upload coach feedback"}
          </button>
        </div>
      ) : null}

      <div
        className="mx-auto w-full max-w-[380px] overflow-hidden bg-white"
        style={{
          borderRadius: "16px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        }}
      >
        {loading ? (
          <div className="flex aspect-[9/16] w-full items-center justify-center bg-stone-100 text-sm text-stone-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Loading feedback…
          </div>
        ) : playbackUrl ? (
          <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
            <video
              key={playbackUrl}
              src={playbackUrl}
              controls
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 bg-stone-100 px-6 text-center">
            <Video className="h-10 w-10 text-stone-300" aria-hidden />
            <p className="text-sm font-medium text-stone-700">No coach feedback yet</p>
            <p className="text-xs text-stone-500">
              When Blake uploads a response, it will stay here to rewatch.
            </p>
          </div>
        )}

        <div className="space-y-3 p-5">
          <div>
            <h2
              className="mb-1 text-xl font-bold tracking-tight"
              style={{ color: "#014421", letterSpacing: "-0.02em" }}
            >
              {selected ? "Feedback video" : "Awaiting feedback"}
            </h2>
            <p className="text-sm text-stone-500">{APP_VIDEO_COACH_NAME}</p>
            {selected?.created_at ? (
              <p className="mt-1 text-xs text-stone-400">{formatDate(selected.created_at)}</p>
            ) : null}
          </div>

          <FeedbackField
            label="Key issues"
            icon={<Target className="h-3.5 w-3.5" aria-hidden />}
            value={selected?.key_issues}
          />
          <FeedbackField
            label="Contact"
            icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />}
            value={selected?.contact_info}
          />
          <FeedbackField
            label="Directional misses"
            icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden />}
            value={selected?.directional_misses}
          />
          <FeedbackField
            label="Notes"
            icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden />}
            value={selected?.notes}
          />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mx-auto mt-4 w-full max-w-[380px] space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Saved feedback ({items.length})
          </p>
          <ul className="space-y-2">
            {items.map((row, index) => {
              const active = row.id === (selected?.id ?? null);
              const preview =
                row.key_issues?.trim() ||
                row.directional_misses?.trim() ||
                row.contact_info?.trim() ||
                row.notes?.trim() ||
                "";
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-[#014421]/30 bg-[#014421]/5"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-stone-800">
                      {index === 0 ? "Latest" : `Feedback ${items.length - index}`}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">{formatDate(row.created_at)}</p>
                    {preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-stone-600">{preview}</p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
