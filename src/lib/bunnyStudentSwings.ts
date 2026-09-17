import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProtectedLibraryBunnyVideo } from "@/lib/bunnyStream";
import { bunnyVideoExists } from "@/lib/bunnyStreamAdmin";

/** Keep brand-new uploads visible while Bunny finishes creating/indexing them. */
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

export type BunnyStudentSwingMeta = {
  bunny_video_id: string;
  title: string | null;
  uploaded_by: string | null;
  player_name: string | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  storage_path: string | null;
  created_at: string;
};

/**
 * Prefer the caller's JWT when present (browser auth is localStorage, not cookies).
 * Service role is optional fallback for server-only reads when no token is available.
 * Use preferServiceRole for coach delete/prune — authenticated DELETE was revoked for students.
 */
async function getBunnySwingsClient(
  accessToken?: string | null,
  opts?: { preferServiceRole?: boolean },
): Promise<SupabaseClient> {
  if (opts?.preferServiceRole) {
    const service = createServiceRoleSupabase();
    if (service) return service;
  }

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

function normalizeBunnyVideoId(videoId: string): string {
  return videoId.trim().toLowerCase();
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
    storage_path: typeof row.storage_path === "string" ? row.storage_path : null,
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
        "bunny_video_id, title, uploaded_by, key_issues, contact_info, directional_misses, storage_path, created_at",
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

/**
 * Drop inbox rows for videos already deleted in the Bunny dashboard.
 * Skips very recent uploads so processing races don't wipe the registry.
 */
export async function pruneOrphanedBunnyStudentSwings(
  accessToken?: string | null,
  knownBunnyIds?: Iterable<string>,
): Promise<BunnyStudentSwingMeta[]> {
  const swings = await listBunnyStudentSwings(accessToken);
  if (swings.length === 0) return swings;

  const known = new Set(
    Array.from(knownBunnyIds || [], (id) => id.trim().toLowerCase()).filter(Boolean),
  );
  const now = Date.now();
  const kept: BunnyStudentSwingMeta[] = [];

  for (const swing of swings) {
    const id = swing.bunny_video_id;
    if (known.has(id.toLowerCase())) {
      kept.push(swing);
      continue;
    }

    const createdAt = Date.parse(swing.created_at);
    const isFresh =
      Number.isFinite(createdAt) && now - createdAt < ORPHAN_GRACE_MS;
    if (isFresh) {
      kept.push(swing);
      continue;
    }

    try {
      const exists = await bunnyVideoExists(id);
      if (exists) {
        kept.push(swing);
      } else {
        try {
          await unregisterBunnyStudentSwing(id, accessToken);
        } catch (err) {
          console.warn("[bunny_student_swings] prune unregister failed:", err);
          kept.push(swing);
        }
      }
    } catch {
      kept.push(swing);
    }
  }

  return kept;
}

export async function registerBunnyStudentSwing(input: {
  bunnyVideoId: string;
  title?: string;
  uploadedBy?: string | null;
  keyIssues?: string | null;
  contactInfo?: string | null;
  directionalMisses?: string | null;
  storagePath?: string | null;
  accessToken?: string | null;
}): Promise<void> {
  const videoId = normalizeBunnyVideoId(input.bunnyVideoId);
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
      storage_path: input.storagePath?.trim() || null,
    },
    { onConflict: "bunny_video_id" },
  );
  if (error) {
    const msg = error.message || "unknown error";
    if (/invalid api key/i.test(msg)) {
      throw new Error(
        "Could not save swing for inbox: Supabase API key mismatch. Check NEXT_PUBLIC_SUPABASE_URL / ANON_KEY match your project, and you are signed in.",
      );
    }
    throw new Error(`Could not save swing for inbox: ${msg}`);
  }
}

export async function getBunnyStudentSwingStoragePath(
  videoId: string,
  accessToken?: string | null,
): Promise<string | null> {
  const id = normalizeBunnyVideoId(videoId);
  if (!id) return null;
  try {
    const supabase = await getBunnySwingsClient(accessToken, { preferServiceRole: true });
    const { data, error } = await supabase
      .from("bunny_student_swings")
      .select("bunny_video_id, storage_path");
    if (error) return null;
    const match = (data || []).find(
      (row) =>
        normalizeBunnyVideoId(String((row as { bunny_video_id?: string }).bunny_video_id || "")) ===
        id,
    ) as { storage_path?: string | null } | undefined;
    const path = match?.storage_path;
    return typeof path === "string" && path.trim() ? path.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Remove inbox row(s). Always uses service role — authenticated DELETE was revoked
 * so students cannot wipe swings; coach API deletes must still succeed.
 */
export async function unregisterBunnyStudentSwing(
  videoId: string,
  _accessToken?: string | null,
): Promise<void> {
  const id = normalizeBunnyVideoId(videoId);
  if (!id) return;

  const service = createServiceRoleSupabase();
  if (!service) {
    throw new Error(
      "Could not clear swing from the app: set SUPABASE_SERVICE_ROLE_KEY on the server (Vercel env), then redeploy.",
    );
  }

  // Case-insensitive match in case older rows stored mixed-case GUIDs.
  const { data: rows, error: findError } = await service
    .from("bunny_student_swings")
    .select("bunny_video_id, storage_path");
  if (findError) {
    throw new Error(`Could not clear swing from the app: ${findError.message}`);
  }

  const matches = (rows || []).filter(
    (row) => normalizeBunnyVideoId(String((row as { bunny_video_id?: string }).bunny_video_id || "")) === id,
  );
  if (matches.length === 0) return;

  for (const row of matches) {
    const storedId = String((row as { bunny_video_id?: string }).bunny_video_id || "");
    const storagePath = String((row as { storage_path?: string | null }).storage_path || "").trim();

    const { error: deleteError } = await service
      .from("bunny_student_swings")
      .delete()
      .eq("bunny_video_id", storedId);
    if (deleteError) {
      throw new Error(`Could not clear swing from the app: ${deleteError.message}`);
    }

    if (storagePath) {
      const { error: storageError } = await service.storage
        .from("swing-submissions")
        .remove([storagePath]);
      if (storageError) {
        console.warn("[bunny_student_swings] storage cleanup failed:", storageError.message);
      }
    }
  }
}

export async function assertBunnyVideoDeletable(
  videoId: string,
  accessToken?: string | null,
): Promise<void> {
  const id = normalizeBunnyVideoId(videoId);
  if (!id) throw new Error("videoId is required");

  if (isProtectedLibraryBunnyVideo(id)) {
    throw new Error(
      "Library drills (like Hell Drill) cannot be deleted. Only student swing uploads can be removed.",
    );
  }

  // Service role first so delete isn't blocked if JWT list is empty/RLS-limited.
  const supabase = await getBunnySwingsClient(accessToken, { preferServiceRole: true });
  const { data, error } = await supabase
    .from("bunny_student_swings")
    .select("bunny_video_id");
  if (error) {
    throw new Error(`Could not verify swing for delete: ${error.message}`);
  }

  const found = (data || []).some(
    (row) =>
      normalizeBunnyVideoId(String((row as { bunny_video_id?: string }).bunny_video_id || "")) === id,
  );
  if (!found) {
    throw new Error(
      "Only swings sent by students (Send to Blake) can be deleted — not library drills.",
    );
  }
}
