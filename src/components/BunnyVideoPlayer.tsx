import React, { useEffect, useRef } from "react";
import { resolveBunnyLibraryId } from "@/lib/bunnyStream";

const PLAYERJS_SRC = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";

type PlayerJsPlayer = {
  on: (event: string, cb: (data?: unknown) => void) => void;
  off?: (event: string) => void;
};

/** Share of the video that must be played in real time (not skipped) before it counts as watched. */
const FULL_WATCH_RATIO = 0.9;
/** Larger jumps between timeupdates are treated as seeking, not watching. */
const MAX_PLAYBACK_STEP_SECONDS = 2;

function parseTiming(data: unknown): { seconds: number; duration: number } | null {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const t = value as { seconds?: unknown; duration?: unknown } | null;
  const seconds = Number(t?.seconds);
  const duration = Number(t?.duration);
  if (!Number.isFinite(seconds)) return null;
  return { seconds, duration: Number.isFinite(duration) ? duration : 0 };
}
type PlayerJsGlobal = { Player: new (el: HTMLIFrameElement) => PlayerJsPlayer };

let playerJsPromise: Promise<PlayerJsGlobal | null> | null = null;

function loadPlayerJs(): Promise<PlayerJsGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = (window as unknown as { playerjs?: PlayerJsGlobal }).playerjs;
  if (existing) return Promise.resolve(existing);
  if (!playerJsPromise) {
    playerJsPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = PLAYERJS_SRC;
      script.async = true;
      script.onload = () =>
        resolve((window as unknown as { playerjs?: PlayerJsGlobal }).playerjs ?? null);
      script.onerror = () => {
        playerJsPromise = null;
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }
  return playerJsPromise;
}

interface BunnyVideoPlayerProps {
  videoId: string;
  libraryId?: string; // Optional if using environment variable
  autoplay?: boolean;
  /** Fill a sized parent instead of self-sizing */
  fill?: boolean;
  /** Portrait (9:16) vs landscape (16:9). Defaults to landscape to match current Bunny encodes. */
  portrait?: boolean;
  className?: string;
  /** Fires when the video ends after being played through (skipping ahead doesn't count). */
  onFullyWatched?: () => void;
}

export const BunnyVideoPlayer: React.FC<BunnyVideoPlayerProps> = ({
  videoId,
  libraryId,
  autoplay = false,
  fill = false,
  portrait = false,
  className = "",
  onFullyWatched,
}) => {
  const resolvedLibraryId = resolveBunnyLibraryId(libraryId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onFullyWatchedRef = useRef(onFullyWatched);
  const trackWatching = Boolean(onFullyWatched);

  useEffect(() => {
    onFullyWatchedRef.current = onFullyWatched;
  }, [onFullyWatched]);

  useEffect(() => {
    if (!trackWatching || !iframeRef.current) return;
    let cancelled = false;
    let player: PlayerJsPlayer | null = null;
    let lastSeconds: number | null = null;
    const watchedSecondMarks = new Set<number>();
    let duration = 0;

    void loadPlayerJs().then((playerjs) => {
      if (cancelled || !playerjs || !iframeRef.current) return;
      player = new playerjs.Player(iframeRef.current);
      player.on("ready", () => {
        player?.on("timeupdate", (data) => {
          const timing = parseTiming(data);
          if (!timing) return;
          if (timing.duration > 0) duration = timing.duration;
          if (lastSeconds !== null) {
            const step = timing.seconds - lastSeconds;
            if (step > 0 && step <= MAX_PLAYBACK_STEP_SECONDS) {
              for (let s = Math.floor(lastSeconds); s <= Math.floor(timing.seconds); s++) {
                watchedSecondMarks.add(s);
              }
            }
          }
          lastSeconds = timing.seconds;
        });
        player?.on("ended", () => {
          if (cancelled) return;
          if (duration > 0 && watchedSecondMarks.size >= Math.floor(duration * FULL_WATCH_RATIO)) {
            onFullyWatchedRef.current?.();
          }
        });
      });
    });
    return () => {
      cancelled = true;
      player?.off?.("timeupdate");
      player?.off?.("ended");
    };
  }, [trackWatching, videoId, resolvedLibraryId]);

  if (!resolvedLibraryId || !videoId) {
    return <div className="p-4 text-sm text-gray-500">Missing Video or Library ID</div>;
  }

  const src = `https://player.mediadelivery.net/embed/${resolvedLibraryId}/${videoId}?autoplay=${autoplay}&preload=true&responsive=true`;

  if (fill) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        <iframe
          ref={iframeRef}
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
        ref={iframeRef}
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
