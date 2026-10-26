import { NextResponse } from "next/server";
import { LIBRARY_MODULES, resolveBunnyLibraryId } from "@/lib/bunnyStream";
import { resolveBunnyCdnHostname } from "@/lib/bunnyStreamAdmin";

export const dynamic = "force-dynamic";

const VIDEO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIBRARY_VIDEO_IDS = new Set(
  LIBRARY_MODULES.flatMap((mod) => [
    ...mod.videos.map((video) => video.bunnyVideoId.toLowerCase()),
    ...(mod.coverBunnyVideoId ? [mod.coverBunnyVideoId.toLowerCase()] : []),
  ]),
);

async function thumbnailFileName(libraryId: string, apiKey: string, videoId: string): Promise<string> {
  const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    headers: { AccessKey: apiKey, Accept: "application/json" },
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return "thumbnail.jpg";
  const data = (await response.json()) as { thumbnailFileName?: string | null };
  const name = data.thumbnailFileName?.trim();
  return name && !name.includes("/") && !name.includes("\\") ? name : "thumbnail.jpg";
}

async function fetchThumb(url: string): Promise<Response | null> {
  const response = await fetch(url, {
    headers: { Referer: "https://iframe.mediadelivery.net/", Accept: "image/*" },
    next: { revalidate: 86_400 },
  });
  if (!response.ok || !response.body) return null;
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.startsWith("image/")) return null;
  return response;
}

/** Screenshot for a public library lesson. Direct CDN links are blocked, so the app loads this instead. */
export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId")?.trim() ?? "";
  if (!VIDEO_ID_RE.test(videoId) || !LIBRARY_VIDEO_IDS.has(videoId.toLowerCase())) {
    return NextResponse.json({ error: "Unknown video" }, { status: 404 });
  }

  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const libraryId = resolveBunnyLibraryId();
  const host = resolveBunnyCdnHostname()?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!apiKey || !libraryId || !host) {
    return NextResponse.json({ error: "Thumbnails are not configured" }, { status: 503 });
  }

  const preferred = await thumbnailFileName(libraryId, apiKey, videoId);
  const files = preferred === "thumbnail.jpg" ? ["thumbnail.jpg"] : [preferred, "thumbnail.jpg"];
  let image: Response | null = null;
  for (const file of files) {
    image = await fetchThumb(`https://${host}/${videoId}/${file}`);
    if (image) break;
  }
  if (!image) {
    return NextResponse.json({ error: "Thumbnail not ready" }, { status: 404 });
  }

  return new NextResponse(image.body, {
    headers: {
      "Content-Type": image.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
