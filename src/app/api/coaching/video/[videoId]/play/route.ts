import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRequestUser, supabaseAsUser } from "@/lib/coachingServer";
import {
  resolveBunnyCdnHostname,
  resolveBunnyCdnTokenAuthKey,
  signBunnyCdnUrlAdvanced,
} from "@/lib/bunnyStreamAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ videoId: string }> };

const PLAY_TTL_SEC = 4 * 60 * 60;
const MP4_RENDITIONS = ["play_720p.mp4", "play_480p.mp4", "play_1080p.mp4", "play_360p.mp4"];

/** RLS decides visibility, so a row coming back means this user may watch the video. */
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

async function reachable(url: string): Promise<boolean> {
  const referer = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://iframe.mediadelivery.net/";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0", Referer: referer },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Signed direct URL for a coaching video so the app can play it in its own player
 * (frame scrubbing and drawing don't work inside Bunny's iframe).
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await resolveRequestUser(request);
    if (!user?.accessToken) {
      return NextResponse.json({ error: "Sign in to watch this video." }, { status: 401 });
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
      return NextResponse.json({ error: "You can't view this video." }, { status: 403 });
    }

    const host = resolveBunnyCdnHostname()?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!host) {
      return NextResponse.json({ error: "Video CDN isn't configured." }, { status: 503 });
    }
    const key = resolveBunnyCdnTokenAuthKey();
    const base = `https://${host}/${videoId}`;
    const dir = `/${videoId}/`;
    const sign = (url: string, pathStyle: boolean) =>
      key ? signBunnyCdnUrlAdvanced(url, key, { ttlSec: PLAY_TTL_SEC, directoryPath: dir, pathStyle }) : url;

    const mp4s = MP4_RENDITIONS.map((file) => sign(`${base}/${file}`, false));
    const hls = sign(`${base}/playlist.m3u8`, true);
    const ok = await Promise.all([...mp4s, hls].map(reachable));
    const mp4 = mp4s.find((_, i) => ok[i]);
    if (mp4) return NextResponse.json({ mp4 });
    if (ok[mp4s.length]) return NextResponse.json({ hls });

    return NextResponse.json({ error: "This video can't be opened in the analysis player yet." }, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Couldn't load the video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
