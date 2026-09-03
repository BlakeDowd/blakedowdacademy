import { cleanBunnyVideoTitle } from "@/lib/bunnyStream";

export async function fetchBunnyVideoTitleFromEmbed(
  libraryId: string,
  videoId: string
): Promise<string | null> {
  const response = await fetch(
    `https://player.mediadelivery.net/embed/${libraryId}/${videoId}`,
    { next: { revalidate: 300 } }
  );
  if (!response.ok) return null;

  const html = await response.text();
  const match = html.match(/<title>([^<]+)<\/title>/i);
  const title = match?.[1] ? cleanBunnyVideoTitle(match[1]) : "";
  return title || null;
}
