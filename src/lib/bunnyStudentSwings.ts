import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  isProtectedLibraryBunnyVideo,
  PROTECTED_LIBRARY_BUNNY_VIDEO_IDS,
} from "@/lib/bunnyStream";

export type BunnyStudentSwingMeta = {
  bunny_video_id: string;
  title: string | null;
  uploaded_by: string | null;
  player_name: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

/**
 * Prefer the caller's JWT when present (browser auth is localStorage, not cookies).
 * Service role is optional fallback for server-only reads when no token is available.
 */
async function getBunnySwingsClient(accessToken?: string | null): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (url && anon && accessToken) {
    return createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const service = createServiceRoleSupabase();
  if (service) return service;

  return createServerSupabase();
}

function mapSwingRow(row: Record<string, unknown>): Omit<BunnyStudentSwingMeta, "player_name"> | null {
  const bunnyVideoId = String(row.bunny_video_id || "").trim();
  if (!bunnyVideoId || isProtectedLibraryBunnyVideo(bunnyVideoId)) return null;
  return {
    bunny_video_id: bunnyVideoId,
    title: typeof row.title === "string" ? row.title : null,
    uploaded_by: typeof row.uploaded_by === "string" ? row.uploaded_by : null,
    key_issues: typeof row.key_issues === "string" ? row.key_issues : null,
    contact_info: typeof row.contact_info === "string" ? row.contact_info : null,
    directional_misses:
      typeof row.directional_misses === "string" ? row.directional_misses : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

async function attachPlayerNames(
  supabase: SupabaseClient,
  swings: Omit<BunnyStudentSwingMeta, "player_name">[],
): Promise<BunnyStudentSwingMeta[]> {
  const ids = Array.from(
    new Set(swings.map((s) => s.uploaded_by).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) {
    return swings.map((s) => ({ ...s, player_name: null }));
  }

  try {
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    if (error) {
      console.warn("[bunny_student_swings] profile lookup failed:", error.message);
      return swings.map((s) => ({ ...s, player_name: null }));
    }
    const nameById = new Map<string, string>();
    for (const row of data || []) {
      const id = String((row as { id?: string }).id || "");
      const name = String((row as { full_name?: string | null }).full_name || "").trim();
      if (id) nameById.set(id, name || "Golfer");
    }
    return swings.map((s) => ({
      ...s,
      player_name: (s.uploaded_by && nameById.get(s.uploaded_by)) || null,
    }));
  } catch (err) {
    console.warn("[bunny_student_swings] profile lookup threw:", err);
    return swings.map((s) => ({ ...s, player_name: null }));
  }
}

export async function listBunnyStudentSwings(
  accessToken?: string | null,
): Promise<BunnyStudentSwingMeta[]> {
  try {
    const supabase = await getBunnySwingsClient(accessToken);
    const { data, error } = await supabase
      .from("bunny_student_swings")
      .select(
        "bunny_video_id, title, uploaded_by, key_issues, contact_info, directional_misses, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[bunny_student_swings] list failed:", error.message);
      return [];
    }
    const mapped = (data || [])
      .map((row) => mapSwingRow(row as Record<string, unknown>))
      .filter((row): row is Omit<BunnyStudentSwingMeta, "player_name"> => Boolean(row));
    return attachPlayerNames(supabase, mapped);
  } catch (err) {
    console.warn("[bunny_student_swings] list threw:", err);
    return [];
  }
}

export async function listDeletableBunnyStudentVideoIds(
  accessToken?: string | null,
): Promise<string[]> {
  const swings = await listBunnyStudentSwings(accessToken);
  return swings.map((s) => s.bunny_video_id);
}

export async function registerBunnyStudentSwing(input: {
  bunnyVideoId: string;
  title?: string;
  uploadedBy?: string | null;
  keyIssues?: string | null;
  contactInfo?: string | null;
  directionalMisses?: string | null;
  accessToken?: string | null;
}): Promise<void> {
  const videoId = input.bunnyVideoId.trim();
  if (!videoId || isProtectedLibraryBunnyVideo(videoId)) {
    throw new Error("That video cannot be registered as a student swing.");
  }

  const supabase = await getBunnySwingsClient(input.accessToken);
  const { error } = await supabase.from("bunny_student_swings").upsert(
    {
      bunny_video_id: videoId,
      title: input.title || null,
      uploaded_by: input.uploadedBy || null,
      key_issues: input.keyIssues?.trim() || null,
      contact_info: input.contactInfo?.trim() || null,
      directional_misses: input.directionalMisses?.trim() || null,
    },
    { onConflict: "bunny_video_id" },
  );
  if (error) {
    throw new Error(`Could not save swing for inbox: ${error.message}`);
  }
}

export async function unregisterBunnyStudentSwing(
  videoId: string,
  accessToken?: string | null,
): Promise<void> {
  const id = videoId.trim();
  if (!id) return;
  try {
    const supabase = await getBunnySwingsClient(accessToken);
    await supabase.from("bunny_student_swings").delete().eq("bunny_video_id", id);
  } catch (err) {
    console.warn("[bunny_student_swings] unregister threw:", err);
  }
}

export async function assertBunnyVideoDeletable(
  videoId: string,
  accessToken?: string | null,
): Promise<void> {
  const id = videoId.trim();
  if (!id) throw new Error("videoId is required");

  if (isProtectedLibraryBunnyVideo(id) || PROTECTED_LIBRARY_BUNNY_VIDEO_IDS.has(id)) {
    throw new Error(
      "Library drills (like Hell Drill) cannot be deleted. Only student swing uploads can be removed.",
    );
  }

  const deletable = await listDeletableBunnyStudentVideoIds(accessToken);
  if (!deletable.includes(id)) {
    throw new Error(
      "Only swings sent by students (Send to Blake) can be deleted — not library drills.",
    );
  }
}
