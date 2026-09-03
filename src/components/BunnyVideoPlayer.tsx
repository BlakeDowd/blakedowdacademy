import React from "react";
import { resolveBunnyLibraryId } from "@/lib/bunnyStream";

interface BunnyVideoPlayerProps {
  videoId: string;
  libraryId?: string; // Optional if using environment variable
  autoplay?: boolean;
  /** Fill a sized parent (e.g. aspect-video container) instead of self-sizing 16:9 */
  fill?: boolean;
  className?: string;
}

export const BunnyVideoPlayer: React.FC<BunnyVideoPlayerProps> = ({
  videoId,
  libraryId,
  autoplay = false,
  fill = false,
  className = "",
}) => {
  const resolvedLibraryId = resolveBunnyLibraryId(libraryId);

  if (!resolvedLibraryId || !videoId) {
    return <div className="p-4 text-sm text-gray-500">Missing Video or Library ID</div>;
  }

  const src = `https://player.mediadelivery.net/embed/${resolvedLibraryId}/${videoId}?autoplay=${autoplay}&preload=true`;

  if (fill) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        <iframe
          src={src}
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", paddingTop: "56.25%", width: "100%" }}>
      <iframe
        src={src}
        loading="lazy"
        style={{
          border: 0,
          position: "absolute",
          top: 0,
          height: "100%",
          width: "100%",
        }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
      />
    </div>
  );
};
