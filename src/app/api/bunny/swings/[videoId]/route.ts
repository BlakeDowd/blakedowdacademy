import { NextResponse } from "next/server";
import {
  bunnyApiConfigured,
  bunnyDeleteVideo,
  bunnyGetVideo,
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
    const originalUrl = buildBunnyOriginalUrl(videoId);

    if (!originalUrl) {
      return NextResponse.json(
        {
          error:
            "Raw download needs your Bunny CDN hostname. Add NEXT_PUBLIC_BUNNY_CDN_HOSTNAME to .env.local (e.g. vz-xxxx.b-cdn.net from Stream → library → CDN / Pull Zone). Also enable Keep Original Files in Bunny encoding settings.",
          hasOriginal: video.hasOriginal ?? null,
          cdnConfigured: Boolean(resolveBunnyCdnHostname()),
        },
        { status: 503 },
      );
    }

    const upstream = await fetch(originalUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Could not fetch original file (${upstream.status}). Confirm Keep Original Files is enabled and Block Direct URL File Access is off (or allow this app).`,
          hasOriginal: video.hasOriginal ?? null,
          originalUrl,
        },
        { status: 502 },
      );
    }

    const safeTitle = (video.title || "swing-original")
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 80);
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "application/octet-stream",
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeTitle}-original.mp4"`,
    );
    const len = upstream.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);

    return new NextResponse(upstream.body, { status: 200, headers });
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
