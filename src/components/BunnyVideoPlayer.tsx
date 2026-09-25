import React from "react";
import { resolveBunnyLibraryId } from "@/lib/bunnyStream";

interface BunnyVideoPlayerProps {
  videoId: string;
  libraryId?: string; // Optional if using environment variable
  autoplay?: boolean;
  /** Fill a sized parent instead of self-sizing */
  fill?: boolean;
  /** Portrait (9:16) vs landscape (16:9). Defaults to landscape to match current Bunny encodes. */
  portrait?: boolean;
  className?: string;
}

export const BunnyVideoPlayer: React.FC<BunnyVideoPlayerProps> = ({
  videoId,
  libraryId,
  autoplay = false,
  fill = false,
  portrait = false,
  className = "",
}) => {
  const resolvedLibraryId = resolveBunnyLibraryId(libraryId);

  if (!resolvedLibraryId || !videoId) {
    return <div className="p-4 text-sm text-gray-500">Missing Video or Library ID</div>;
  }

  const src = `https://player.mediadelivery.net/embed/${resolvedLibraryId}/${videoId}?autoplay=${autoplay}&preload=true&responsive=true`;

  if (fill) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        <iframe
          src={src}
          title="Bunny video player"
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  // Self-sized embed: match encode orientation (Bunny docs: set iframe aspect to the video).
  const paddingTop = portrait ? "177.78%" : "56.25%";
  return (
    <div className={className} style={{ position: "relative", paddingTop, width: "100%" }}>
      <iframe
        src={src}
        title="Bunny video player"
        loading="lazy"
        style={{
          border: 0,
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "100%",
          display: "block",
        }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
};
