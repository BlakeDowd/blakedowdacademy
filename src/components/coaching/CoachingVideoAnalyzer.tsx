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

/** Player layer key — keeps coach drawings intact. */
export function videoAnnotationPlayerKey(coachKey: string, userId: string): string {
  return `${coachKey}#u:${userId}`;
}

async function loadShapes(key: string): Promise<Shape[]> {
  const { data } = await createClient().from(TABLE).select("shapes").eq("video_key", key).maybeSingle();
  return Array.isArray(data?.shapes) ? (data.shapes as Shape[]) : [];
}

/** Whether anyone has saved drawings on this video (coach or the signed-in player). */
export function useHasVideoAnnotations(key: string | null, refreshKey = 0): boolean {
  const { user } = useAuth();
  const [state, setState] = useState<{ key: string | null; has: boolean }>({ key: null, has: false });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const keys = [key];
    if (user?.id) keys.push(videoAnnotationPlayerKey(key, user.id));
    void Promise.all(keys.map((k) => loadShapes(k))).then((layers) => {
      if (!cancelled) setState({ key, has: layers.some((s) => s.length > 0) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey, user?.id]);
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

/**
 * Full-screen analysis for a coaching video.
 * Coaches save the shared layer; players save their own layer on top (coach drawings stay locked).
 */
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
  const coachKey = videoAnnotationKey(video);
  const playerKey = coachKey && user?.id ? videoAnnotationPlayerKey(coachKey, user.id) : null;
  const saveKey = isCoach ? coachKey : playerKey;

  const [source, setSource] = useState<AnalyzerSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editable, setEditable] = useState<Shape[] | undefined>(undefined);
  const [locked, setLocked] = useState<Shape[]>([]);

  const { bunny_video_id: bunnyId, storage_bucket: bucket, storage_path: path } = video;
  useEffect(() => {
    let cancelled = false;
    loadSource({ bunny_video_id: bunnyId, storage_bucket: bucket, storage_path: path })
      .then((s) => !cancelled && setSource(s))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "This video couldn't be loaded."));

    if (coachKey) {
      void (async () => {
        const coachShapes = await loadShapes(coachKey);
        const playerShapes = playerKey ? await loadShapes(playerKey) : [];
        if (cancelled) return;
        if (isCoach) {
          setEditable(coachShapes);
          setLocked(playerShapes);
        } else {
          setEditable(playerShapes);
          setLocked(coachShapes);
        }
      })();
    } else {
      setEditable([]);
      setLocked([]);
    }

    return () => {
      cancelled = true;
    };
  }, [bunnyId, bucket, path, coachKey, playerKey, isCoach]);

  const save = async (next: Shape[]): Promise<string | null> => {
    if (!saveKey || !user?.id) return "Sign in to save drawings.";
    const { error: saveError } = await createClient()
      .from(TABLE)
      .upsert({
        video_key: saveKey,
        student_id: isCoach ? (studentId ?? null) : user.id,
        shapes: next,
        updated_at: new Date().toISOString(),
      });
    if (saveError) return saveError.message;
    onSaved?.();
    return null;
  };

  return (
    <SwingAnalyzer
      source={source}
      error={error}
      initialShapes={editable}
      lockedShapes={locked}
      canSave={Boolean(saveKey && user?.id)}
      onSave={save}
      onClose={onClose}
      title={isCoach ? "Swing analysis" : "Analyse your swing"}
      saveSuccessMessage={
        isCoach
          ? locked.length
            ? "Saved. Your drawings sit on top of the player’s layer."
            : "Saved. Your player can see these drawings."
          : locked.length
            ? "Saved. Coach drawings stay underneath yours."
            : "Saved to your layer."
      }
    />
  );
}
