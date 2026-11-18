import { pickRecorderMime, recorderSupported } from "@/lib/swingAnalyzerRecord";

export { recorderSupported };

type FocusCapable = MediaTrackCapabilities & {
  focusMode?: string[];
};

/**
 * Open the lesson camera at ~1080p, rear-facing by default.
 * Uses continuous/manual focus when available so the phone does not
 * "lock on" a person the way the system Camera app subject-tracking does.
 */
export async function openGamePlanCamera(
  facing: "environment" | "user" = "environment",
): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  }

  const track = stream.getVideoTracks()[0];
  if (track?.applyConstraints && track.getCapabilities) {
    try {
      const caps = track.getCapabilities() as FocusCapable;
      const modes = caps.focusMode ?? [];
      const focusMode = modes.includes("continuous")
        ? "continuous"
        : modes.includes("manual")
          ? "manual"
          : null;
      if (focusMode) {
        await track.applyConstraints({
          advanced: [{ focusMode } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Best-effort — many browsers ignore focusMode.
    }
  }

  return stream;
}

/** ~1080p-friendly bitrate for sharper game-plan lesson clips. */
const VIDEO_BITS = 6_000_000;
const AUDIO_BITS = 128_000;

export type GamePlanRecorderHandle = {
  stop: () => Promise<File>;
  mimeType: string;
};

export function startGamePlanRecorder(stream: MediaStream): GamePlanRecorderHandle {
  if (!recorderSupported()) {
    throw new Error("This browser can't record video in-app. Choose a file instead.");
  }
  const mimeType = pickRecorderMime();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: VIDEO_BITS,
    audioBitsPerSecond: AUDIO_BITS,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let resolveStop: ((f: File) => void) | null = null;
  const done = new Promise<File>((resolve) => {
    resolveStop = resolve;
  });
  recorder.onstop = () => {
    const type = mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type });
    const file = new File([blob], `game-plan-${Date.now()}.${ext}`, { type });
    resolveStop?.(file);
  };

  recorder.start(250);
  return {
    mimeType: mimeType || "video/webm",
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
  };
}
