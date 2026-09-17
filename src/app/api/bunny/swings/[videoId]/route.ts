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
  getBunnyStudentSwingStoragePath,
  unregisterBunnyStudentSwing,
} from "@/lib/bunnyStudentSwings";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { createHash } from "crypto";

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

/** Optional Bunny CDN URL Token Authentication (Pull Zone → Security). */
function signBunnyCdnUrl(urlString: string): string {
  const securityKey = process.env.BUNNY_CDN_TOKEN_AUTH_KEY?.trim();
  if (!securityKey) return urlString;
  try {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const parsed = new URL(urlString);
    const signaturePath = parsed.pathname;
    const hashable = `${securityKey}${signaturePath}${expires}`;
    const token = createHash("md5")
      .update(hashable)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    parsed.searchParams.set("token", token);
    parsed.searchParams.set("expires", String(expires));
    return parsed.toString();
  } catch {
    return urlString;
  }
}

async function tryDownloadFromSupabaseStorage(
  videoId: string,
  accessToken: string | null,
): Promise<Response | null> {
  const storagePath = await getBunnyStudentSwingStoragePath(videoId, accessToken);
  if (!storagePath) return null;

  const service = createServiceRoleSupabase();
  const supabase = service || (await createServerSupabase());
  const { data: signed, error } = await supabase.storage
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

    const video = await bunnyGetVideo(videoId);
    const safeTitle = (video.title || "swing")
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 80);

    // Prefer the Supabase raw copy (reliable even when Bunny CDN blocks /original).
    const fromStorage = await tryDownloadFromSupabaseStorage(videoId, accessToken);
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

    const candidates = buildBunnyDownloadCandidateUrls(videoId).map(signBunnyCdnUrl);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "No downloadable copy yet. Newer swings store a raw file for coaches automatically — ask the student to re-send, or set NEXT_PUBLIC_BUNNY_CDN_HOSTNAME and disable Bunny CDN Block Direct URL File Access.",
          hasOriginal: video.hasOriginal ?? null,
          cdnConfigured: Boolean(resolveBunnyCdnHostname()),
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

    const hit = await fetchFirstAvailableDownload(preferred);
    if (!hit) {
      return NextResponse.json(
        {
          error:
            "Bunny CDN blocked the download (common with Block Direct URL File Access / Token Auth). For this swing, ask the student to re-send so a raw copy is saved for you. Or turn off Block Direct URL File Access on the Stream pull zone, and optionally add BUNNY_CDN_TOKEN_AUTH_KEY if Token Authentication is on.",
          hasOriginal: video.hasOriginal ?? null,
          status: video.status,
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
