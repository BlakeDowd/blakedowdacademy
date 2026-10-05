import { NextResponse } from "next/server";
import { POST_MEDIA_COLUMNS, removePostMedia, type MediaRow } from "@/lib/coachingCleanup";
import { resolveRequestUser, supabaseAsUser } from "@/lib/coachingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ postId: string }> };

/** Coach-only: removes a post plus its Bunny video and stored raw copy. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await resolveRequestUser(request);
    if (!user?.accessToken) {
      return NextResponse.json({ error: "Sign in again to delete posts." }, { status: 401 });
    }
    const client = supabaseAsUser(user.accessToken);
    if (!client) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }
    const { postId } = await context.params;

    // Replies cascade with the post, so collect their files first.
    const { data: replyRows } = await client
      .from("coaching_posts")
      .select(POST_MEDIA_COLUMNS)
      .eq("parent_id", postId);

    // RLS only lets coaches delete, so a non-coach gets zero rows back.
    const { data, error } = await client
      .from("coaching_posts")
      .delete()
      .eq("id", postId)
      .select(POST_MEDIA_COLUMNS);
    if (error) throw new Error(error.message);
    const post = (data as MediaRow[] | null)?.[0];
    if (!post) {
      return NextResponse.json({ error: "Only coaches can delete posts." }, { status: 403 });
    }

    const warnings = await removePostMedia([post, ...((replyRows as MediaRow[] | null) ?? [])]);
    return NextResponse.json({ ok: true, warnings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
