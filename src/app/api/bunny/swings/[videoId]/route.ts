import { NextResponse } from "next/server";
import {
  assertBunnyVideoDeletable,
  getBunnyStudentSwingStoragePath,
  unregisterBunnyStudentSwing,
} from "@/lib/bunnyStudentSwings";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  bunnyApiConfigured,
  bunnyDeleteVideo,
  bunnyGetVideo,
  buildBunnyOriginalUrl,
  buildSignedBunnyDownloadUrls,
  resolveBunnyCdnHostname,
  resolveBunnyCdnTokenAuthKey,
} from "@/lib/bunnyStreamAdmin";

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
  opts?: { useRefererVariants?: boolean },
): Promise<{ response: Response; url: string } | null> {
  const configured =
    process.env.BUNNY_CDN_DOWNLOAD_REFERER?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : null);

  const referers = opts?.useRefererVariants
    ? [
        configured,
        "https://iframe.mediadelivery.net/",
        "https://player.mediadelivery.net/",
      ].filter((v): v is string => Boolean(v))
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
        if (response.ok && response.body) {
          return { response, url };
        }
      } catch {
        // try next
      }
    }
  }
  return null;
}

async function tryDownloadFromSupabaseStorage(videoId: string): Promise<Response | null> {
  // Always use service role — coach download must not depend on student JWT/RLS.
  const storagePath = await getBunnyStudentSwingStoragePath(videoId, null);
  if (!storagePath) return null;

  const service = createServiceRoleSupabase();
  if (!service) return null;

  const { data: signed, error } = await service.storage
    .from("swing-submissions")
    .createSignedUrl(storagePath, 120);
  if (error || !signed?.signedUrl) return null;

  const upstream = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return null;
  return upstream;
}

export async function GET(request: Request, context: RouteContext) {
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
        { error: "Only coaches can download student swings." },
        { status: 403 },
      );
    }

    const { videoId: rawId } = await context.params;
    const videoId = rawId?.trim();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const video = await bunnyGetVideo(videoId);
    const safeTitle = (video.title || "swing")
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 80);

    // Prefer the Supabase raw copy (reliable even when Bunny CDN blocks /original).
    const fromStorage = await tryDownloadFromSupabaseStorage(videoId);
    if (fromStorage) {
      const headers = new Headers();
      headers.set(
        "Content-Type",
        fromStorage.headers.get("Content-Type") || "application/octet-stream",
      );
      headers.set(
        "Content-Disposition",
        `attachment; filename="${safeTitle}-original.mp4"`,
      );
      const len = fromStorage.headers.get("Content-Length");
      if (len) headers.set("Content-Length", len);
      return new NextResponse(fromStorage.body, { status: 200, headers });
    }

    const tokenKeyConfigured = Boolean(resolveBunnyCdnTokenAuthKey());
    const candidates = buildSignedBunnyDownloadUrls(videoId);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "No downloadable copy yet. Set NEXT_PUBLIC_BUNNY_CDN_HOSTNAME, or ask the student to re-send so a raw copy is saved for you.",
          hasOriginal: video.hasOriginal ?? null,
          cdnConfigured: Boolean(resolveBunnyCdnHostname()),
          tokenAuthConfigured: tokenKeyConfigured,
        },
        { status: 503 },
      );
    }

    if (video.status === 2 || video.status === 1 || video.status === 0) {
      return NextResponse.json(
        {
          error:
            "This swing is still processing on Bunny and has no raw copy stored yet. Wait for encoding, or ask the student to re-send after the latest app update.",
          hasOriginal: video.hasOriginal ?? null,
          status: video.status,
        },
        { status: 409 },
      );
    }

    const preferred =
      video.hasOriginal === false
        ? candidates.filter((url) => !url.includes("/original"))
        : candidates;

    const hit = await fetchFirstAvailableDownload(preferred, {
      // Without a token key, Referer tricks are the only way past Block Direct URL File Access.
      useRefererVariants: !tokenKeyConfigured,
    });
    if (!hit) {
      return NextResponse.json(
        {
          error: tokenKeyConfigured
            ? "Bunny still blocked the file. Check BUNNY_CDN_TOKEN_AUTH_KEY matches Stream → Security → Token Authentication Key (or the Pull Zone token key). For this older swing, ask the student to re-send so a raw copy is saved."
            : "Bunny CDN blocked the download (Block Direct URL File Access / Token Auth). Add BUNNY_CDN_TOKEN_AUTH_KEY in Vercel from Bunny → Stream → your library → Security → Token Authentication Key, redeploy, then try again. Or ask the student to re-send so a raw copy is saved for you.",
          hasOriginal: video.hasOriginal ?? null,
          status: video.status,
          tokenAuthConfigured: tokenKeyConfigured,
          triedOriginal: buildBunnyOriginalUrl(videoId),
        },
        { status: 502 },
      );
    }

    const isOriginal = hit.url.includes("/original");
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

    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;

    await assertBunnyVideoDeletable(videoId, accessToken);

    // Fail clearly before touching Bunny if inbox cleanup can't run.
    if (!createServiceRoleSupabase()) {
      return NextResponse.json(
        {
          error:
            "Set SUPABASE_SERVICE_ROLE_KEY in Vercel (or .env.local), redeploy, then delete again. Without it the swing stays in the app.",
        },
        { status: 503 },
      );
    }

    // Bunny first, then registry — unregister throws if the app row can't be removed.
    await bunnyDeleteVideo(videoId);
    await unregisterBunnyStudentSwing(videoId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status =
      message.toLowerCase().includes("cannot be deleted") ||
      message.toLowerCase().includes("only swings") ||
      message.toLowerCase().includes("only coaches") ||
      message.toLowerCase().includes("library drills")
        ? 403
        : message.toLowerCase().includes("service_role") ||
            message.toLowerCase().includes("not configured")
          ? 503
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
