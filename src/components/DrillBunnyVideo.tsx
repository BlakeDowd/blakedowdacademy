"use client";

import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { useBunnyVideoMetadata } from "@/hooks/useBunnyVideoMetadata";
import { isBunnyPortraitVideo } from "@/lib/bunnyStream";

/** A drill's Bunny video, sized to the encode (phone-shot portrait videos stay narrow). */
export default function DrillBunnyVideo({ videoId, autoplay = false }: { videoId: string; autoplay?: boolean }) {
  const { metadata } = useBunnyVideoMetadata(videoId);
  const portrait = metadata ? isBunnyPortraitVideo(metadata) : true;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-black ${
        portrait ? "mx-auto aspect-[9/16] max-h-[70vh] max-w-[340px]" : "aspect-video"
      }`}
    >
      <BunnyVideoPlayer videoId={videoId} fill autoplay={autoplay} />
    </div>
  );
}
