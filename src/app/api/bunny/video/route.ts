import { NextResponse } from "next/server";
import { cleanBunnyVideoTitle, resolveBunnyLibraryId } from "@/lib/bunnyStream";
import { fetchBunnyVideoTitleFromEmbed } from "@/lib/bunnyStreamServer";

export const dynamic = "force-dynamic";

type BunnyVideoResponse = {
  title?: string;
  description?: string | null;
  length?: number;
  width?: number;
  height?: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  const libraryId = resolveBunnyLibraryId(searchParams.get("libraryId"));
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  if (!libraryId) {
    return NextResponse.json(
      { error: "Bunny Stream library ID is not configured" },
      { status: 503 }
    );
  }

  let title = "";
  let description: string | null = null;
  let lengthSeconds = 0;
  let width: number | null = null;
  let height: number | null = null;

  const hasValidApiKey = Boolean(apiKey && apiKey !== libraryId);

  if (hasValidApiKey) {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        headers: {
          AccessKey: apiKey!,
          Accept: "application/json",
        },
        next: { revalidate: 300 },
      }
    );

    if (response.ok) {
      const data = (await response.json()) as BunnyVideoResponse;
      title = data.title?.trim() ?? "";
      description = data.description ?? null;
      lengthSeconds = typeof data.length === "number" ? data.length : 0;
      width = typeof data.width === "number" && data.width > 0 ? data.width : null;
      height = typeof data.height === "number" && data.height > 0 ? data.height : null;
    }
  }

  if (!title) {
    title = (await fetchBunnyVideoTitleFromEmbed(libraryId, videoId)) ?? "";
  }

  if (!title) {
    return NextResponse.json(
      { error: "Failed to load video metadata" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    title: cleanBunnyVideoTitle(title),
    description,
    lengthSeconds,
    width,
    height,
  });
}
