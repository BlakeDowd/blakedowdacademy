import { NextResponse } from "next/server";
import {
  bunnyApiConfigured,
  bunnyDeleteVideo,
  bunnyGetVideo,
  buildBunnyDownloadCandidateUrls,
  buildBunnyOriginalUrl,
  resolveBunnyCdnHostname,
} from "@/lib/bunnyStreamAdmin";
import {
  assertBunnyVideoDeletable,
  unregisterBunnyStudentSwing,
} from "@/lib/bunnyStudentSwings";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ videoId: string }> };

async function requireCoach(request: Request): Promise<string | null> {
  const supabase = await createServerSupabase();
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

  if (bearer) {
    const { data } = await supabase.auth.getUser(bearer);
    if (data.user && isCoachEmail(data.user.email)) return data.user.id;
  }

  const { data } = await supabase.auth.getUser();
  if (data.user && isCoachEmail(data.user.email)) return data.user.id;
  return null;
}

async function fetchFirstAvailableDownload(
  urls: string[],
): Promise<{ response: Response; url: string } | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok && response.body) {
        return { response, url };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        { error: "Bunny Stream API key is not configured." },
        { status: 503 },
      );
    }

    const { videoId: rawId } = await context.params;
    const videoId = rawId?.trim();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const video = await bunnyGetVideo(videoId);
    const candidates = buildBunnyDownloadCandidateUrls(videoId);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "Raw download needs your Bunny CDN hostname. Add NEXT_PUBLIC_BUNNY_CDN_HOSTNAME in Vercel (e.g. vz-xxxx.b-cdn.net from Stream → library → CDN / Pull Zone).",
          hasOriginal: video.hasOriginal ?? null,
          cdnConfigured: Boolean(resolveBunnyCdnHostname()),
        },
        { status: 503 },
      );
    }

    // Still encoding — originals/MP4s are often missing until Finished.
    if (video.status === 2 || video.status === 1 || video.status === 0) {
      return NextResponse.json(
        {
          error:
            "This swing is still processing on Bunny. Wait until encoding finishes, then download again.",
          hasOriginal: video.hasOriginal ?? null,
          status: video.status,
        },
        { status: 409 },
      );
    }

    const preferred =
      video.hasOriginal === false
        ? candidates.filter((url) => !url.endsWith("/original"))
        : candidates;

    const hit = await fetchFirstAvailableDownload(preferred);
    if (!hit) {
      return NextResponse.json(
        {
          error:
            video.hasOriginal === false
              ? "No downloadable file yet. In Bunny Stream → library → Encoding, enable Keep Original Files and MP4 fallback, then re-upload or wait for processing."
              : "Could not fetch the video file from Bunny CDN. Check Keep Original Files is on, Block Direct URL File Access is off, and Token Authentication is off for this pull zone (or wait until encoding finishes).",
          hasOriginal: video.hasOriginal ?? null,
          status: video.status,
          triedOriginal: buildBunnyOriginalUrl(videoId),
        },
        { status: 502 },
      );
    }

    const isOriginal = hit.url.endsWith("/original");
    const safeTitle = (video.title || "swing")
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 80);
    const headers = new Headers();
    headers.set(
      "Content-Type",
      hit.response.headers.get("Content-Type") || "application/octet-stream",
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeTitle}-${isOriginal ? "original" : "video"}.mp4"`,
    );
    const len = hit.response.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);

    return new NextResponse(hit.response.body, { status: 200, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        { error: "Bunny Stream API key is not configured." },
        { status: 503 },
      );
    }

    const coachId = await requireCoach(request);
    if (!coachId) {
      return NextResponse.json(
        { error: "Only coaches can delete student swings." },
        { status: 403 },
      );
    }

    const { videoId: rawId } = await context.params;
    const videoId = rawId?.trim();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    await assertBunnyVideoDeletable(videoId);
    await bunnyDeleteVideo(videoId);
    await unregisterBunnyStudentSwing(videoId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status =
      message.toLowerCase().includes("cannot be deleted") ||
      message.toLowerCase().includes("only swings") ||
      message.toLowerCase().includes("only coaches")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
