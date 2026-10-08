"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import { authJsonHeaders, type CoachingPostVideo } from "@/lib/coachingFeed";
import { SwingAnalyzer, type AnalyzerSource, type Shape } from "@/components/video/SwingAnalyzer";

const TABLE = "coaching_video_annotations";

export function videoAnnotationKey(video: CoachingPostVideo): string | null {
  if (video.bunny_video_id) return `bunny:${video.bunny_video_id.toLowerCase()}`;
  if (video.storage_path) return `file:${video.storage_path}`;
  return null;
}

/** Whether a coach has saved drawings on this video (shown as a badge on the post). */
export function useHasVideoAnnotations(key: string | null, refreshKey = 0): boolean {
  const [state, setState] = useState<{ key: string | null; has: boolean }>({ key: null, has: false });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void createClient()
      .from(TABLE)
      .select("shapes")
      .eq("video_key", key)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ key, has: Array.isArray(data?.shapes) && data.shapes.length > 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);
  return state.key === key && state.has;
}

async function loadSource(video: CoachingPostVideo): Promise<AnalyzerSource> {
  if (video.bunny_video_id) {
    const res = await fetch(`/api/coaching/video/${encodeURIComponent(video.bunny_video_id)}/play`, {
      headers: await authJsonHeaders(),
    });
    const body = (await res.json().catch(() => ({}))) as { mp4?: string; hls?: string; error?: string };
    if (body.mp4) return { url: body.mp4, type: "mp4" };
    if (body.hls) return { url: body.hls, type: "hls" };
    throw new Error(body.error || "This video couldn't be opened for analysis.");
  }
  const { data, error } = await createClient()
    .storage.from(video.storage_bucket!)
    .createSignedUrl(video.storage_path!, 3600);
  if (error || !data?.signedUrl) throw new Error("This video couldn't be loaded.");
  return { url: data.signedUrl, type: "mp4" };
}

/** Full-screen analysis for a coaching video. Coaches can save drawings for the player. */
export function CoachingVideoAnalyzer({
  video,
  studentId,
  onClose,
  onSaved,
}: {
  video: CoachingPostVideo;
  studentId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const key = videoAnnotationKey(video);
  const [source, setSource] = useState<AnalyzerSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shapes, setShapes] = useState<Shape[] | undefined>(undefined);

  const { bunny_video_id: bunnyId, storage_bucket: bucket, storage_path: path } = video;
  useEffect(() => {
    let cancelled = false;
    loadSource({ bunny_video_id: bunnyId, storage_bucket: bucket, storage_path: path })
      .then((s) => !cancelled && setSource(s))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "This video couldn't be loaded."));
    if (key) {
      void createClient()
        .from(TABLE)
        .select("shapes")
        .eq("video_key", key)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && Array.isArray(data?.shapes)) setShapes(data.shapes as Shape[]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [bunnyId, bucket, path, key]);

  const save = async (next: Shape[]): Promise<string | null> => {
    if (!key) return "This video can't hold drawings.";
    const { error: saveError } = await createClient()
      .from(TABLE)
      .upsert({ video_key: key, student_id: studentId ?? null, shapes: next, updated_at: new Date().toISOString() });
    if (saveError) return saveError.message;
    onSaved?.();
    return null;
  };

  return (
    <SwingAnalyzer
      source={source}
      error={error}
      initialShapes={shapes}
      canSave={isCoach && Boolean(key)}
      onSave={save}
      onClose={onClose}
    />
  );
}
