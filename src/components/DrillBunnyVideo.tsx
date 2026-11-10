"use client";

import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { useBunnyVideoMetadata } from "@/hooks/useBunnyVideoMetadata";
import { isBunnyPortraitVideo } from "@/lib/bunnyStream";

/** A drill's Bunny video, sized to the encode (phone-shot portrait videos stay narrow). */
export default function DrillBunnyVideo({
  videoId,
  autoplay = false,
  /** Tighter height so modal footers (Assign / Close) stay on screen. */
  constrained = false,
}: {
  videoId: string;
  autoplay?: boolean;
  constrained?: boolean;
}) {
  const { metadata } = useBunnyVideoMetadata(videoId);
  const portrait = metadata ? isBunnyPortraitVideo(metadata) : true;
  const portraitClass = constrained
    ? "mx-auto aspect-[9/16] max-h-[min(42vh,360px)] max-w-[280px]"
    : "mx-auto aspect-[9/16] max-h-[min(55vh,480px)] max-w-[340px]";
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-black ${
        portrait ? portraitClass : "aspect-video max-h-[min(40vh,360px)]"
      }`}
    >
      <BunnyVideoPlayer videoId={videoId} fill autoplay={autoplay} />
    </div>
  );
}
