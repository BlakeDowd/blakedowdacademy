"use client";

import { useEffect, useState } from "react";
import { buildBunnyThumbnailUrl, type BunnyVideoMetadata } from "@/lib/bunnyStream";

export function useBunnyVideoMetadata(videoId: string | null | undefined) {
  const [metadata, setMetadata] = useState<BunnyVideoMetadata | null>(null);
  const [loading, setLoading] = useState(Boolean(videoId));

  useEffect(() => {
    if (!videoId) {
      setMetadata(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/bunny/video?videoId=${encodeURIComponent(videoId)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<BunnyVideoMetadata>;
      })
      .then((data) => {
        if (cancelled || !data?.title) return;
        setMetadata(data);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return { metadata, loading };
}

/** Thumbnail URL using the video's real thumbnail file; null until the metadata has loaded. */
export function useBunnyThumbnailUrl(videoId: string | null | undefined): string | null {
  const { metadata, loading } = useBunnyVideoMetadata(videoId);
  if (!videoId || loading) return null;
  return buildBunnyThumbnailUrl(videoId, metadata?.thumbnailFileName);
}
