import { bunnyApiConfigured, bunnyDeleteVideo } from "@/lib/bunnyStreamAdmin";
import { isProtectedLibraryBunnyVideo } from "@/lib/bunnyStream";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export type MediaRow = {
  bunny_video_id: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  image_path: string | null;
  extra_videos: { bunny_video_id?: string; storage_path?: string | null }[] | null;
  legacy_source?: string | null;
};

export const POST_MEDIA_COLUMNS =
  "id, bunny_video_id, storage_bucket, storage_path, image_path, extra_videos, legacy_source";

/** Removes Bunny videos, raw copies, photos and legacy rows for already-deleted posts. Returns warnings. */
export async function removePostMedia(rows: MediaRow[]): Promise<string[]> {
  const warnings: string[] = [];
  const service = createServiceRoleSupabase();

  for (const row of rows) {
    const videos = [
      { bunnyId: row.bunny_video_id, bucket: row.storage_bucket ?? null, path: row.storage_path ?? null },
      ...(row.extra_videos ?? []).map((v) => ({
        bunnyId: v.bunny_video_id ?? null,
        bucket: v.storage_path ? "swing-submissions" : null,
        path: v.storage_path ?? null,
      })),
    ];
    for (const v of videos) {
      if (v.bunnyId && !isProtectedLibraryBunnyVideo(v.bunnyId) && bunnyApiConfigured()) {
        try {
          await bunnyDeleteVideo(v.bunnyId);
        } catch (err) {
          warnings.push(`Bunny video not removed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (service) {
          await service.from("bunny_student_swings").delete().eq("bunny_video_id", v.bunnyId);
        }
      }
      if (v.bucket && v.path && service) {
        const { error } = await service.storage.from(v.bucket).remove([v.path]);
        if (error) warnings.push(`Stored file not removed: ${error.message}`);
      }
    }
    if (row.image_path && service) {
      const { error } = await service.storage.from("coaching-photos").remove([row.image_path]);
      if (error) warnings.push(`Photo not removed: ${error.message}`);
    }
    if (row.legacy_source === "coach_swing_feedback" && service) {
      await service.from("coach_swing_feedback").delete().eq("storage_path", row.storage_path ?? "");
    }
  }
  return warnings;
}
