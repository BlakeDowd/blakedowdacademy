import { NextResponse } from "next/server";
import { POST_MEDIA_COLUMNS, removePostMedia, type MediaRow } from "@/lib/coachingCleanup";
import { resolveRequestUser, supabaseAsUser } from "@/lib/coachingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ announcementId: string }> };

/** Coach-only: removes an announcement, every player's replies to it, and all their media. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await resolveRequestUser(request);
    if (!user?.accessToken) {
      return NextResponse.json({ error: "Sign in again to delete announcements." }, { status: 401 });
    }
    const client = supabaseAsUser(user.accessToken);
    if (!client) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }
    const { announcementId } = await context.params;

    // Player replies cascade with the announcement, so collect their files first.
    const { data: entryRows } = await client
      .from("coaching_posts")
      .select(POST_MEDIA_COLUMNS)
      .eq("announcement_id", announcementId);

    // RLS only lets coaches delete, so a non-coach gets zero rows back.
    const { data, error } = await client
      .from("coaching_announcements")
      .delete()
      .eq("id", announcementId)
      .select("id, bunny_video_id, image_path, extra_videos");
    if (error) throw new Error(error.message);
    const announcement = (data as MediaRow[] | null)?.[0];
    if (!announcement) {
      return NextResponse.json({ error: "Only coaches can delete announcements." }, { status: 403 });
    }

    const warnings = await removePostMedia([announcement, ...((entryRows as MediaRow[] | null) ?? [])]);
    return NextResponse.json({ ok: true, warnings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
