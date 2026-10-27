import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRequestUser, supabaseAsUser } from "@/lib/coachingServer";
import { getBunnyStudentSwingStoragePath } from "@/lib/bunnyStudentSwings";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  buildSignedBunnyDownloadUrls,
  resolveBunnyCdnHostname,
  resolveBunnyCdnTokenAuthKey,
} from "@/lib/bunnyStreamAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ videoId: string }> };

/** RLS decides visibility — a matching post/announcement means this user may download. */
async function canSeeVideo(client: SupabaseClient, ids: string[]): Promise<boolean> {
  for (const table of ["coaching_posts", "coaching_announcements"]) {
    const direct = await client.from(table).select("id").in("bunny_video_id", ids).limit(1);
    if (direct.data?.length) return true;
    for (const id of ids) {
      const extra = await client.from(table).select("id").contains("extra_videos", [{ bunny_video_id: id }]).limit(1);
      if (extra.data?.length) return true;
    }
  }
  return false;
}

async function fetchFirstAvailable(
  urls: string[],
  useRefererVariants: boolean,
): Promise<{ response: Response; url: string } | null> {
  const configured =
    process.env.BUNNY_CDN_DOWNLOAD_REFERER?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : null);

  const referers = useRefererVariants
    ? [configured, "https://iframe.mediadelivery.net/", "https://player.mediadelivery.net/"].filter(
        (v): v is string => Boolean(v),
      )
    : [configured || "https://iframe.mediadelivery.net/"];

  for (const url of urls) {
    for (const referer of referers) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            Accept: "*/*",
            "User-Agent": "BlakeGolfCoaching/1.0",
            Referer: referer,
            Origin: new URL(referer).origin,
          },
          redirect: "follow",
        });
        if (response.ok && response.body) return { response, url };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

async function tryStorageCopy(videoId: string): Promise<Response | null> {
  const storagePath = await getBunnyStudentSwingStoragePath(videoId, null);
  if (!storagePath) return null;
  const service = createServiceRoleSupabase();
  if (!service) return null;
  const { data: signed, error } = await service.storage.from("swing-submissions").createSignedUrl(storagePath, 120);
  if (error || !signed?.signedUrl) return null;
  const upstream = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return null;
  return upstream;
}

function attachment(body: ReadableStream<Uint8Array> | null, contentType: string | null, filename: string, len: string | null) {
  const headers = new Headers();
  headers.set("Content-Type", contentType || "video/mp4");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  if (len) headers.set("Content-Length", len);
  return new NextResponse(body, { status: 200, headers });
}

/**
 * Lets a student (or coach) download a coaching video they can already see —
 * game plans, coach feedback, and swings in their space.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await resolveRequestUser(request);
    if (!user?.accessToken) {
      return NextResponse.json({ error: "Sign in to download this video." }, { status: 401 });
    }
    const client = supabaseAsUser(user.accessToken);
    if (!client) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const { videoId: rawId } = await context.params;
    const videoId = rawId?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
      return NextResponse.json({ error: "Unknown video." }, { status: 400 });
    }
    if (!(await canSeeVideo(client, Array.from(new Set([videoId, videoId.toLowerCase()]))))) {
      return NextResponse.json({ error: "You can't download this video." }, { status: 403 });
    }

    const safeName = `golf-video-${videoId.slice(0, 8)}.mp4`;

    const fromStorage = await tryStorageCopy(videoId);
    if (fromStorage) {
      return attachment(
        fromStorage.body,
        fromStorage.headers.get("Content-Type"),
        safeName,
        fromStorage.headers.get("Content-Length"),
      );
    }

    if (!resolveBunnyCdnHostname()) {
      return NextResponse.json({ error: "Video CDN isn't configured." }, { status: 503 });
    }

    const candidates = buildSignedBunnyDownloadUrls(videoId);
    // Prefer encoded MP4s for students (smaller); original first is fine if available.
    const hit = await fetchFirstAvailable(candidates, !resolveBunnyCdnTokenAuthKey());
    if (!hit) {
      return NextResponse.json(
        { error: "This video isn't ready to download yet. Try again in a minute." },
        { status: 404 },
      );
    }

    return attachment(
      hit.response.body,
      hit.response.headers.get("Content-Type"),
      safeName,
      hit.response.headers.get("Content-Length"),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
